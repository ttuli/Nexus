// import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { nativeImage } from 'electron';
import { storage } from '../utils/storage';
import { config } from '../config';

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

export const IMCACHE_SCHEME = 'imcache';
export const IMLOCAL_SCHEME = 'imlocal';
export const IMLOCALRAW_SCHEME = 'imlocalraw';

class FileCacheManager {
    private cacheDir: string = '';
    // 正在进行的下载，防止同一 URL 并发重复下载
    private downloading = new Set<string>();
    private initialized = false;

    constructor() {
        // Delay resolution of cacheDir until init() is called so storage is ready.
    }

    public init(): void {
        if (this.initialized) return;
        this.initialized = true;

        // 使用用户配置的（或默认的）大文件资源统一存储路径
        this.cacheDir = path.join(storage.getResourcePath(), 'media-cache');

        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
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
    public handleProtocolRequest(protocolUrl: string): string | null {
        const encoded = protocolUrl.replace(`${IMCACHE_SCHEME}://`, '').split('?')[0]; // 去掉 ? 之后的查询参数
        let originalUrl: string;
        try {
            originalUrl = Buffer.from(encoded, 'base64url').toString('utf-8');
        } catch {
            return null;
        }

        const localPath = this.getLocalPath(originalUrl);
        if (fs.existsSync(localPath)) {
            return localPath;
        }

        // 本地没有，触发异步下载，本次请求返回 null 让前端 fallback 到网络图
        this.prefetch(originalUrl);
        return null;
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

        // 生成本地缓存路径
        const cacheKey = `imlocal_${filePath}_${maxWidth}`;
        const cachePath = this.getLocalPath(cacheKey);

        // 如果已经裁剪并缓存过，直接返回缓存的文件路径
        if (fs.existsSync(cachePath)) {
            return { cachePath };
        }

        try {
            const img = nativeImage.createFromPath(filePath);
            if (img.isEmpty()) return { status: 404 };
            const size = img.getSize();
            // 等比缩放：只在原图宽度超出时才缩，避免放大模糊
            const targetWidth = Math.min(maxWidth, size.width);
            const resized = img.resize({ width: targetWidth });
            const buffer = resized.toJPEG(85);

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
     * 预先在后台下载并缓存一张图片
     * 如果已经下载过则跳过
     */
    public prefetch(url: string): void {
        if (!url || !url.startsWith('http')) return;
        const localPath = this.getLocalPath(url);
        if (fs.existsSync(localPath)) return;
        if (this.downloading.has(url)) return;

        this.downloading.add(url);
        this.downloadFile(url, localPath)
            .catch(err => console.error('[FileCacheManager] prefetch failed:', url, err))
            .finally(() => this.downloading.delete(url));
    }

    /**
     * 获取某个网络 URL 对应的本地缓存文件路径
     * 使用 SHA256 哈希作为文件名（保留扩展名）
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
        return path.join(this.cacheDir, `${hash}${ext}`);
    }

    /**
     * 实际执行下载的私有方法
     */
    private async downloadFile(url: string, localPath: string): Promise<void> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} for ${url}`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(localPath, buffer);
        console.log('[FileCacheManager] Cached:', url, '->', localPath);
    }
}

export const fileCacheManager = new FileCacheManager();
