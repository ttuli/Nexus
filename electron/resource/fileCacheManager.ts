// import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { nativeImage, net } from 'electron';

import { tokenManager } from './tokenManager';
import { settingManager } from './settingManager';
import { APP_CONSTANTS, Main_Config as config } from '@/src/config/constants';
import { CacheOptionType, CacheOption } from '@/src/types/resourceCache';
import { fileManager } from './fileManager';
import { ApiTypes } from '@/src/types';

/**
 * 本地文件缓存管理器
 * 负责将网络图片（头像等）下载并持久化到本地磁盘
 * 配合 imcache:// 自定义协议供前端渲染使用
 *
 * 协议格式：
 *   imcache://encode(网络URL)   -> 前端渲染时使用这个地址
 * 主进程拦截后：
 *   1. 如果本地有缓存文件，直接返回本地文件
 *   2. 否则触发后台下载，当次请求返回原 URL（兜底显示网络图片）
 */


class FileCacheManager {
    private cacheDir: string = '';
    private initialized = false;

    constructor() {

    }

    public init(): void {
        if (this.initialized) return;
        this.initialized = true;

        // 使用用户配置的（或默认的）大文件资源统一存储路径
        this.cacheDir = settingManager.getStoragePath()

        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    /**
     * 处理 localcache:// 协议的核心逻辑
     * 根据 pathOrUrl 类型分发到网络资源或本地文件两条处理链路
     *
     * @param pathOrUrl  原始路径或网络 URL（已解码）
     * @param encodedPart URL 中 Base64 编码的路径部分（用于构造 imlocal mock URL）
     * @param opts       从 URL 中解析出的选项对象
     * @returns Response 对象或 null（null 表示调用方应继续兜底处理）
     */
    public async handleLocalCacheRequest(
        pathOrUrl: string,
        opts: CacheOption
    ): Promise<Response | null> {

        // 网络资源处理：有本地缓存直接返回，否则异步预取并返回网络图
        if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
            // 提取出 url 最后一个 / 后面的内容（并去掉问号后面的签名参数），作为稳定的 fileKey
            const urlWithoutQuery = pathOrUrl.split('?')[0];
            let cacheKey = urlWithoutQuery.substring(urlWithoutQuery.lastIndexOf('/') + 1) || pathOrUrl;

            const width = opts.width || APP_CONSTANTS.maxImageWidth;
            const height = opts.height || APP_CONSTANTS.maxImageHeight;
            const quality = opts.quality || APP_CONSTANTS.imageCompressQuality;
            let ft: ApiTypes.file.FileType = ApiTypes.file.FileType.UNRECOGNIZED;

            switch (opts.cacheType) {
                case CacheOptionType.IMAGE_THUMB:
                    const process = `image/resize,m_lfit,w_${width},h_${height}/quality,q_${quality}`;
                    cacheKey += `|${process}`;
                    ft = ApiTypes.file.FileType.FileTypeChatImage;
                    break;
                case CacheOptionType.VIDEO_THUMB:
                    const videoProcess = `video/snapshot,t_0,f_jpg/image/quality,q_${quality}`;
                    cacheKey += `|${videoProcess}`;
                    ft = ApiTypes.file.FileType.FileTypeChatFile;
                    break;
                case CacheOptionType.IMAGE:
                    ft = ApiTypes.file.FileType.FileTypeChatImage;
                    break;
                case CacheOptionType.VIDEO:
                    ft = ApiTypes.file.FileType.FileTypeChatFile;
                    break;
                case CacheOptionType.FILE:
                    ft = ApiTypes.file.FileType.FileTypeChatFile;
                    break;
                case CacheOptionType.AVATAR:
                    ft = ApiTypes.file.FileType.FileTypeAvatar;
                    break;
                default:
            }
            const localPath = this.getLocalPath(cacheKey);
            if (fs.existsSync(localPath)) {
                console.log('[FileCacheManager] Cache hit:', pathOrUrl, '->', localPath);
                // 必须使用 fs.readFileSync！因为在 protocol.handle 内部，Electron 出于安全限制，
                // 拦截并拒绝了对 file:// 协议的 net.fetch 请求，会直接返回 403 Forbidden！
                const buffer = fs.readFileSync(localPath);
                let contentType = 'application/octet-stream';
                if (opts.cacheType === CacheOptionType.IMAGE_THUMB ||
                    opts.cacheType === CacheOptionType.IMAGE ||
                    opts.cacheType === CacheOptionType.AVATAR) {
                    contentType = 'image/jpeg';
                } else if (opts.cacheType === CacheOptionType.VIDEO || 
                           opts.cacheType === CacheOptionType.VIDEO_THUMB) {
                    contentType = 'video/mp4';
                }
                return new Response(buffer, {
                    status: 200,
                    headers: { 'Content-Type': contentType }
                });
            }
            
            // 本地无缓存则触发下载，等待下载完成后读取缓存文件返回
            await this.doFetch(pathOrUrl, cacheKey, ft);
            
            if (fs.existsSync(localPath)) {
                const buffer = fs.readFileSync(localPath);
                let contentType = 'application/octet-stream';
                if (opts.cacheType === CacheOptionType.IMAGE_THUMB ||
                    opts.cacheType === CacheOptionType.IMAGE ||
                    opts.cacheType === CacheOptionType.AVATAR) {
                    contentType = 'image/jpeg';
                } else if (opts.cacheType === CacheOptionType.VIDEO || 
                           opts.cacheType === CacheOptionType.VIDEO_THUMB) {
                    contentType = 'video/mp4';
                }
                return new Response(buffer, {
                    status: 200,
                    headers: { 'Content-Type': contentType }
                });
            }
            return new Response(null, { status: 404 });
        }

        // 本地文件处理：支持带缩放和不带缩放两种模式
        let width = opts.width || 0;
        let height = opts.height || 0;
        let quality = opts.quality || 100;
        let cacheKey = pathOrUrl;

        switch (opts.cacheType) {
            case CacheOptionType.IMAGE_THUMB:
                if (width > 0 && height > 0) {
                    cacheKey += `|image_w_${width}_h_${height}_q_${quality}`
                }
                break;
            case CacheOptionType.VIDEO_THUMB:
                cacheKey += `|video_snapshoot_w_${width}_h_${height}_q_${quality}`
                break;
            default:
        }
        return this.doFetchLocal(cacheKey)
    }

    /**
     * 获取某个网络 URL 对应的本地缓存文件路径
     *
     * 目录结构：cacheDir/{userId}/{fileCategory}/{YYYY_MM}/{sha256hash}{ext}
     *   - userId      : 当前登录用户 ID（未登录时为 "anonymous"）
     *   - fileCategory: picture | video | document | other
     *   - YYYY_MM     : 当前年月，如 2026_06
     */
    public getLocalPath(url: string): string {
        const hash = crypto.createHash('sha256').update(url).digest('hex');

        const userId = tokenManager.getCurrentUserID() || 'anonymous';
        const dir = path.join(this.cacheDir, String(userId), 'cache');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        return path.join(dir, `${hash}.bin`);
    }

    private async doFetch(url: string, cacheKey: string, ft: ApiTypes.file.FileType) {
        const process = cacheKey.split('|')[1] || '';
        try {
            let accessUrl = '';
            if (ft === ApiTypes.file.FileType.FileTypeAvatar) {
                accessUrl = url;
            } else {
                const res = await fileManager.getAccessUrl({
                    file_key: cacheKey.split('|')[0],
                    oss_process: process,
                    method: ApiTypes.file.GetMethod.MethodGet,
                    file_type: ft
                });
                accessUrl = res.data?.access_url || '';
            }
            if (!accessUrl) {
                console.warn('[FileCacheManager] doFetch: empty access_url for', url);
                return;
            }
            const path = this.getLocalPath(cacheKey);
            const bytes = await net.fetch(accessUrl);
            const buffer = Buffer.from(await bytes.arrayBuffer());
            fs.writeFileSync(path, buffer);
            console.log('[FileCacheManager] Cached:', url, '->', path);
        } catch (err) {
            console.error('[FileCacheManager] doFetch error:', url, err);
        }
    }

    private async doFetchLocal(cacheKey: string): Promise<Response> {
        // cacheKey 格式：
        //   filePath                                          （无处理）
        //   filePath|image_w_{w}_h_{h}_q_{q}                 （图片缩略图）
        //   filePath|video_snapshoot_w_{w}_h_{h}_q_{q}       （视频缩略图）
        const [filePath, paramsStr] = cacheKey.split('|');

        if (!fs.existsSync(filePath)) {
            return new Response(null, { status: 404 });
        }

        // 无附加参数：直接返回原文件
        if (!paramsStr) {
            return net.fetch('file://' + filePath);
        }

        // IMAGE_THUMB：image_w_${width}_h_${height}_q_${quality}
        if (paramsStr.startsWith('image_')) {
            const wMatch = paramsStr.match(/w_(\d+)/);
            const hMatch = paramsStr.match(/h_(\d+)/);
            const qMatch = paramsStr.match(/q_(\d+)/);
            const width = wMatch ? parseInt(wMatch[1], 10) : 0;
            const height = hMatch ? parseInt(hMatch[1], 10) : 0;
            const quality = qMatch ? parseInt(qMatch[1], 10) : config.FileCacheManagerConfig.quality;

            // 命中缓存则直接返回
            const cachePath = this.getLocalPath(cacheKey);
            if (fs.existsSync(cachePath)) {
                return net.fetch('file://' + cachePath);
            }

            try {
                const img = nativeImage.createFromPath(filePath);
                if (img.isEmpty()) return new Response(null, { status: 404 });
                const size = img.getSize();

                // 等比缩放，不放大
                let targetWidth = size.width;
                if (width > 0 && height > 0 && size.height > 0) {
                    const ratio = Math.min(width / size.width, height / size.height, 1);
                    targetWidth = Math.round(size.width * ratio);
                } else if (width > 0) {
                    targetWidth = Math.min(width, size.width);
                }

                const resized = img.resize({ width: targetWidth });
                const buffer = resized.toJPEG(quality);
                fs.writeFileSync(cachePath, buffer);

                return new Response(Buffer.from(buffer), {
                    headers: {
                        'Content-Type': 'image/jpeg',
                        'Cache-Control': 'max-age=31536000',
                    }
                });
            } catch (e) {
                console.error('[FileCacheManager] doFetchLocal image resize error:', filePath, e);
                return new Response(null, { status: 500 });
            }
        }

        // VIDEO_THUMB：video_snapshoot_w_${width}_h_${height}_q_${quality}
        // 本地视频截帧暂不支持（需引入 ffmpeg），直接返回原文件兜底
        if (paramsStr.startsWith('video_snapshoot')) {
            console.warn('[FileCacheManager] Local video thumbnail not supported, returning raw file:', filePath);
            return net.fetch('file://' + filePath);
        }

        // 未知参数，兜底返回原文件
        return net.fetch('file://' + filePath);
    }
}

export const fileCacheManager = new FileCacheManager();
