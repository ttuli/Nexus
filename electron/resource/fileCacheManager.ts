// import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { storage } from '../utils/storage';

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
