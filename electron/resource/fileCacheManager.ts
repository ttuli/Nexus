// import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { nativeImage, net } from 'electron';

import { tokenManager } from './tokenManager';
import { settingManager } from './settingManager';
import { APP_CONSTANTS, Main_Config as config, IMCACHE_SCHEME, IMLOCAL_SCHEME, IMLOCALRAW_SCHEME, Main_Config } from '@/src/config/constants';
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
    // 正在进行的下载，防止同一 URL 并发重复下载
    private downloading = new Set<string>();
    private initialized = false;

    constructor() {

    }

    public init(): void {
        if (this.initialized) return;
        this.initialized = true;

        // 使用用户配置的（或默认的）大文件资源统一存储路径
        this.cacheDir = path.join(settingManager.getStoragePath(), 'media-cache');

        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    public setCacheDir(dir: string): void {
        this.cacheDir = dir;
    }
    /**
     * 将网络 URL 转换为 imcache:// 协议地址供前端使用
     */
    public toProtocolUrl(url: string): string {
        if (!url) return url;
        // 已经是协议地址了，直接返回
        if (url.startsWith(`${IMCACHE_SCHEME}://`)) return url;
        // 将原始 URL base64 编码作为协议地址的路径部分
        const encoded = Buffer.from(url).toString('base64url');
        return `${IMCACHE_SCHEME}://${encoded}`;
    }

    /**
     * 处理渲染进程对 imcache:// 协议的请求
     * 如果本地缓存存在，则直接返回本地文件路径；否则触发后台下载并返回 null（调用方应 fallback）
     */
    public async handleProtocolRequest(protocolUrl: string, method: string = 'async'): Promise<string | null> {
        const encoded = protocolUrl.replace(`${IMCACHE_SCHEME}://`, '').split('?')[0]; // 去掉 ? 之后的查询参数
        let originalUrl: string;
        try {
            originalUrl = Buffer.from(encoded, 'base64url').toString('utf-8');
        } catch {
            return null;
        }

        const localPath = this.getLocalPath(originalUrl);
        if (fs.existsSync(localPath)) {
            console.log('[FileCacheManager] Cache hit:', originalUrl, '->', localPath);
            return localPath;
        }

        // 本地没有，触发异步下载，本次请求返回 null 让前端 fallback 到网络图
        switch (method) {
            case 'sync':
                return await this.prefetch(originalUrl);
            default:
                this.prefetch(originalUrl);
                return null;
        }
    }

    /**
     * 处理渲染进程对 imlocal:// 协议的请求
     * 解析本地图片地址，缩放，并生成缓存返回
     */
    public handleLocalRequest(protocolUrl: string, defaultMaxWidth: number = config.FileCacheManagerConfig.maxWidth): { buffer?: Uint8Array, cachePath?: string, status?: number } {
        // 手动解析 URL，避免 new URL() 把 hostname 小写化（会破坏 base64 编码）
        const withoutScheme = protocolUrl.replace(`${IMLOCAL_SCHEME}://`, '');
        const [encodedPart, queryString] = withoutScheme.split('?');
        const encoded = encodedPart.replace(/-/g, '+').replace(/_/g, '/');

        let filePath: string;
        try {
            filePath = decodeURIComponent(atob(encoded).split('').map((c) =>
                '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
        } catch {
            return { status: 400 };
        }

        const params = new URLSearchParams(queryString || '');
        const maxWidth = parseInt(params.get('width') ?? defaultMaxWidth.toString(), 10);
        const maxHeight = params.get('height') ? parseInt(params.get('height')!, 10) : 0;

        // 生成本地缓存路径（含 width 和 height 以区分不同尺寸的缓存）
        const cacheKey = `imlocal_${filePath}_${maxWidth}_${maxHeight}`;
        const cachePath = this.getLocalPath(cacheKey);

        // 如果已经裁剪并缓存过，直接返回缓存的文件路径
        if (fs.existsSync(cachePath)) {
            return { cachePath };
        }

        try {
            const img = nativeImage.createFromPath(filePath);
            if (img.isEmpty()) return { status: 404 };
            const size = img.getSize();

            // 等比缩放：根据 width 和 height 约束计算目标宽度
            let targetWidth = Math.min(maxWidth, size.width);
            if (maxHeight > 0 && size.height > 0) {
                // 如果高度也有约束，取宽高比例中较小的那个
                const ratioW = maxWidth / size.width;
                const ratioH = maxHeight / size.height;
                const ratio = Math.min(ratioW, ratioH, 1); // 不放大
                targetWidth = Math.round(size.width * ratio);
            }

            const resized = img.resize({ width: targetWidth });
            const buffer = resized.toJPEG(config.FileCacheManagerConfig.quality);

            // 存入本地缓存
            fs.writeFileSync(cachePath, buffer);

            return { buffer: new Uint8Array(buffer), cachePath };
        } catch (e) {
            console.error('[FileCacheManager] Failed to serve local image:', filePath, e);
            return { status: 500 };
        }
    }

    /**
     * 处理 imlocalraw:// 协议：原样返回本地文件，不裁剪不缩放
     */
    public handleLocalRequestRaw(protocolUrl: string): { filePath?: string; status?: number } {
        const withoutScheme = protocolUrl.replace(`${IMLOCALRAW_SCHEME}://`, '');
        const encodedPart = withoutScheme.split('?')[0].replace(/-/g, '+').replace(/_/g, '/');

        let filePath: string;
        try {
            filePath = decodeURIComponent(atob(encodedPart).split('').map((c) =>
                '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
        } catch {
            return { status: 400 };
        }

        if (!fs.existsSync(filePath)) {
            return { status: 404 };
        }
        return { filePath };
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
                    const process = `image/resize,m_lfit,w_${width},h_${height}/image/compress,q_${quality}`;
                    cacheKey += `|${process}`;
                    ft = ApiTypes.file.FileType.FileTypeChatImage;
                    break;
                case CacheOptionType.VIDEO_THUMB:
                    const videoProcess = `video/snapshot,t_0,f_jpg,q_${quality}`;
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
                default:
            }
            const localPath = this.getLocalPath(cacheKey);
            if (fs.existsSync(localPath)) {
                return net.fetch('file://' + localPath);
            }
            // 本地无缓存则异步触发下载，当次先返回真实网络图
            this.doFetch(pathOrUrl, cacheKey, ft);
            return net.fetch(pathOrUrl);
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
     * 预先在后台下载并缓存一张图片
     * 如果已经下载过则跳过
     */
    public async prefetch(url: string, customCacheKey?: string): Promise<string | null> {
        if (!url || !url.startsWith('http')) return null;
        const localPath = this.getLocalPath(customCacheKey || url);
        if (fs.existsSync(localPath)) return localPath;
        if (this.downloading.has(url)) return null;

        this.downloading.add(url);
        try {
            await this.downloadFile(url, localPath);
        } catch (err) {
            console.error('[FileCacheManager] prefetch error:', url, err);
        } finally {
            this.downloading.delete(url);
        }
        return localPath;
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

        let ext = '';
        try {
            const pathname = new URL(url).pathname;
            ext = path.extname(pathname) || '.bin';
        } catch {
            ext = '.bin';
        }

        const userId = tokenManager.getCurrentUserID() || 'anonymous';
        const category = this.getFileCategory(ext);
        const now = new Date();
        const yearMonth = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;

        const dir = path.join(this.cacheDir, String(userId), category, yearMonth);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        return path.join(dir, `${hash}${ext}`);
    }

    /**
     * 根据文件扩展名返回文件分类
     * @param ext 文件扩展名（含点，如 ".jpg"）
     * @returns 文件分类字符串
     */
    private getFileCategory(ext: string): 'picture' | 'video' | 'document' | 'other' {
        const e = ext.toLowerCase();
        const PICTURE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.tiff', '.heic', '.heif', '.avif']);
        const VIDEO_EXTS = new Set(['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.m4v', '.3gp']);
        const DOCUMENT_EXTS = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.md', '.zip', '.rar', '.7z']);

        if (PICTURE_EXTS.has(e)) return 'picture';
        if (VIDEO_EXTS.has(e)) return 'video';
        if (DOCUMENT_EXTS.has(e)) return 'document';
        return 'other';
    }

    /**
     * 实际执行下载的私有方法
     */
    private async downloadFile(url: string, localPath: string): Promise<void> {
        const response = await net.fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} for ${url}`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(localPath, buffer);
        console.log('[FileCacheManager] Cached:', url, '->', localPath);
    }

    private async doFetch(url: string, cacheKey: string, ft: ApiTypes.file.FileType) {
        const process = cacheKey.split('|')[1] || '';
        try {
            const res = await fileManager.getAccessUrl({
                file_key: cacheKey.split('|')[0],
                oss_process: process,
                method: ApiTypes.file.GetMethod.MethodGet,
                file_type: ft
            });
            const accessUrl = res.data?.access_url;
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
            const width  = wMatch ? parseInt(wMatch[1], 10) : 0;
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
