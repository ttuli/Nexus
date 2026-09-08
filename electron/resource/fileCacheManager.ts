import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { nativeImage, net, app } from 'electron';

import { tokenManager } from './tokenManager';
import { settingManager } from './settingManager';
import { APP_CONSTANTS, Main_Config as config } from '@shared/config/constants';
import { CacheOptionType, CacheOption } from '@shared/types/resourceCache';
import { fileManager } from './fileManager';
import { ApiTypes } from '@shared/types';

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
                    const videoProcess = `video/snapshot,t_0,f_jpg,w_${width},h_${height},m_fast`;
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
            const isShared = opts.cacheType === CacheOptionType.AVATAR;
            const localPath = this.getLocalPath(cacheKey, isShared);
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
            await this.doFetch(pathOrUrl, cacheKey, ft, isShared);

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
        return this.doFetchLocal(cacheKey, opts.cacheType);
    }

    /**
     * 获取某个资源对应的本地缓存文件路径
     *
     * 目录结构：
     *   共享资源（头像等公开数据）: cacheDir/shared/cache/{sha256hash}.bin
     *   私有资源（聊天文件等）    : cacheDir/{userId}/cache/{sha256hash}.bin
     *
     * @param url      原始 URL 或 cacheKey，用于生成唯一哈希
     * @param isShared 是否为多账户共享资源（默认 false）
     */
    public getLocalPath(url: string, isShared: boolean = false): string {
        const hash = crypto.createHash('sha256').update(url).digest('hex');

        let dir: string;
        if (isShared) {
            // 公共资源（头像、他人名片等）：所有账户共享同一份缓存
            dir = path.join(this.cacheDir, 'shared', 'cache');
        } else {
            // 私有资源（聊天图片、文件等）：按登录账户隔离
            const userId = tokenManager.getCurrentUserID() || 'anonymous';
            dir = path.join(this.cacheDir, String(userId), 'cache');
        }

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        return path.join(dir, `${hash}.bin`);
    }

    /**
     * 把一段内存中的图片字节写进当前账户的私有缓存，返回本地绝对路径。
     *
     * 用于渲染进程就地生成的图片（如发送视频前用 canvas 抓的首帧封面）。
     * 走 getLocalPath 落盘意味着：
     *   1. 文件名是 {sha256}.bin，资源管理器不会渲染缩略图预览
     *   2. 按 userId 分目录，与其它聊天缓存的隔离约定一致
     *   3. 调用方给的名字只参与哈希、不拼进路径，天然免疫路径穿越
     */
    public saveImageBuffer(buffer: Uint8Array, fileName?: string): string {
        // 每次调用都要落一个新文件，因此 cacheKey 必须唯一（内容相同也不复用）
        const cacheKey = `generated:${fileName || ''}:${Date.now()}:${crypto.randomBytes(8).toString('hex')}`;
        const localPath = this.getLocalPath(cacheKey);
        fs.writeFileSync(localPath, buffer);
        return localPath;
    }

    private async doFetch(url: string, cacheKey: string, ft: ApiTypes.file.FileType, isShared: boolean = false) {
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
            const localPath = this.getLocalPath(cacheKey, isShared);
            const bytes = await net.fetch(accessUrl);
            const buffer = Buffer.from(await bytes.arrayBuffer());
            fs.writeFileSync(localPath, buffer);
            console.log('[FileCacheManager] Cached:', url, '->', localPath);
        } catch (err) {
            console.error('[FileCacheManager] doFetch error:', url, err);
        }
    }

    private getFileResponse(filePath: string, cacheType?: CacheOptionType): Response {
        try {
            const buffer = fs.readFileSync(filePath);
            let contentType = 'application/octet-stream';

            if (cacheType) {
                if (cacheType === CacheOptionType.IMAGE_THUMB ||
                    cacheType === CacheOptionType.IMAGE ||
                    cacheType === CacheOptionType.AVATAR) {
                    contentType = 'image/jpeg';
                } else if (cacheType === CacheOptionType.VIDEO ||
                           cacheType === CacheOptionType.VIDEO_THUMB) {
                    contentType = 'video/mp4';
                } else if (cacheType === CacheOptionType.AUDIO) {
                    contentType = 'audio/mpeg';
                }
            }

            // 如果 cacheType 推断不出，则通过后缀进行一次兜底
            if (contentType === 'application/octet-stream') {
                const ext = path.extname(filePath).toLowerCase();
                switch (ext) {
                    case '.jpg':
                    case '.jpeg':
                        contentType = 'image/jpeg';
                        break;
                    case '.png':
                        contentType = 'image/png';
                        break;
                    case '.gif':
                        contentType = 'image/gif';
                        break;
                    case '.webp':
                        contentType = 'image/webp';
                        break;
                    case '.bmp':
                        contentType = 'image/bmp';
                        break;
                    case '.mp4':
                        contentType = 'video/mp4';
                        break;
                    case '.webm':
                        contentType = 'video/webm';
                        break;
                    case '.ogg':
                        contentType = 'video/ogg';
                        break;
                    case '.mp3':
                        contentType = 'audio/mpeg';
                        break;
                    case '.wav':
                        contentType = 'audio/wav';
                        break;
                    case '.m4a':
                        contentType = 'audio/mp4';
                        break;
                }
            }

            return new Response(buffer, {
                status: 200,
                headers: {
                    'Content-Type': contentType,
                    'Cache-Control': 'max-age=31536000',
                }
            });
        } catch (e) {
            console.error('[FileCacheManager] getFileResponse error:', filePath, e);
            return new Response(null, { status: 500 });
        }
    }

    private isPathSafe(filePath: string): boolean {
        if (!filePath || !path.isAbsolute(filePath)) {
            return false;
        }

        const resolvedPath = path.resolve(filePath).toLowerCase();

        // 1. 允许位于 App 资源存储根目录（缓存目录）的所有文件
        const cacheDir = this.cacheDir.toLowerCase();
        if (resolvedPath.startsWith(cacheDir)) {
            return true;
        }

        // 2. 如果在缓存目录外，禁止访问关键系统目录
        if (process.platform === 'win32') {
            const systemRoot = (process.env.SystemRoot || 'C:\\Windows').toLowerCase();
            const winDir = (process.env.windir || 'C:\\Windows').toLowerCase();
            const programFiles = (process.env.ProgramFiles || 'C:\\Program Files').toLowerCase();
            const programFilesX86 = (process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)').toLowerCase();

            if (resolvedPath.startsWith(systemRoot) || 
                resolvedPath.startsWith(winDir) || 
                resolvedPath.startsWith(programFiles) || 
                resolvedPath.startsWith(programFilesX86)) {
                return false;
            }

            // 禁止访问其他 App 的 AppData（排除自身）
            const selfUserData = app.getPath('userData').toLowerCase();
            if ((resolvedPath.includes('\\appdata\\roaming\\') || resolvedPath.includes('\\appdata\\local\\')) && 
                !resolvedPath.startsWith(selfUserData)) {
                return false;
            }
        } else {
            // macOS / Linux 平台
            const forbiddenPrefixes = [
                '/etc/', '/var/', '/usr/', '/bin/', '/sbin/', '/lib/', '/sys/', '/proc/', '/dev/', '/root/'
            ];
            for (const prefix of forbiddenPrefixes) {
                if (resolvedPath.startsWith(prefix)) {
                    return false;
                }
            }
        }

        return true;
    }

    private async doFetchLocal(cacheKey: string, cacheType?: CacheOptionType): Promise<Response> {
        // cacheKey 格式：
        //   filePath                                          （无处理）
        //   filePath|image_w_{w}_h_{h}_q_{q}                 （图片缩略图）
        //   filePath|video_snapshoot_w_{w}_h_{h}_q_{q}       （视频缩略图）
        const [filePath, paramsStr] = cacheKey.split('|');
        if (!this.isPathSafe(filePath)) {
            console.warn('[FileCacheManager] Blocked unsafe file path request:', filePath);
            return new Response(null, { status: 403 });
        }

        if (!fs.existsSync(filePath)) {
            return new Response(null, { status: 404 });
        }

        // 无附加参数：直接返回原文件
        if (!paramsStr) {
            return this.getFileResponse(filePath, cacheType);
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
                return this.getFileResponse(cachePath, cacheType);
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
            return this.getFileResponse(filePath, cacheType);
        }

        // 未知参数，兜底返回原文件
        return this.getFileResponse(filePath, cacheType);
    }
}

export const fileCacheManager = new FileCacheManager();
