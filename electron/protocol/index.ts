import { protocol, net } from 'electron'
import * as fs from 'fs'
import { fileCacheManager } from '../resource/fileCacheManager'
import { IMCACHE_SCHEME, IMLOCAL_SCHEME, IMLOCALRAW_SCHEME, LOCA_CACHE_SCHEME } from '../../src/config/constants'

export function registerProtocols() {

    protocol.handle(LOCA_CACHE_SCHEME, async (request) => {
        try {
            const withoutScheme = request.url.replace(`${LOCA_CACHE_SCHEME}://`, '');
            const [encodedPart, queryString] = withoutScheme.split('?');
            
            // 1. 解码出原始路径或 URL
            const encodedPath = encodedPart.replace(/-/g, '+').replace(/_/g, '/');
            const pathOrUrl = decodeURIComponent(atob(encodedPath).split('').map((c) =>
                '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
            
            // 2. 解码缓存标识 (cacheKey)
            const params = new URLSearchParams(queryString || '');
            const ckBase64 = params.get('ck');
            let cacheKey = pathOrUrl;
            if (ckBase64) {
                const encodedCk = ckBase64.replace(/-/g, '+').replace(/_/g, '/');
                cacheKey = decodeURIComponent(atob(encodedCk).split('').map((c) =>
                    '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
            }

            // 3. 网络资源处理逻辑 (类似 imcache)
            if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
                const localPath = fileCacheManager.getLocalPath(cacheKey);
                if (fs.existsSync(localPath)) {
                    return net.fetch('file://' + localPath);
                }
                
                // 本地无缓存则异步触发下载，当次先返回真实网络图
                fileCacheManager.prefetch(pathOrUrl, cacheKey);
                return net.fetch(pathOrUrl);
            }

            // 4. 本地文件处理逻辑 (类似 imlocal / imlocalraw)
            let width = 0;
            let height = 0;
            if (cacheKey.includes('image/resize')) {
                const wMatch = cacheKey.match(/w_(\d+)/);
                const hMatch = cacheKey.match(/h_(\d+)/);
                if (wMatch) width = parseInt(wMatch[1], 10);
                if (hMatch) height = parseInt(hMatch[1], 10);
            }

            if (width > 0 || height > 0) {
                // 有缩放需求，借用 handleLocalRequest 缩放图片并缓存
                const mockParams = new URLSearchParams();
                if (width > 0) mockParams.append('width', width.toString());
                if (height > 0) mockParams.append('height', height.toString());
                const mockUrl = `${IMLOCAL_SCHEME}://${encodedPart}?${mockParams.toString()}`;
                
                const result = fileCacheManager.handleLocalRequest(mockUrl);
                if (result.status) return new Response(null, { status: result.status });
                if (result.buffer) {
                    return new Response(Buffer.from(result.buffer), {
                        headers: {
                            'Content-Type': 'image/jpeg',
                            'Cache-Control': 'max-age=31536000',
                        }
                    });
                }
                if (result.cachePath) return net.fetch('file://' + result.cachePath);
            } else {
                // 无缩放需求，直接返回本地文件原图
                if (fs.existsSync(pathOrUrl)) {
                    return net.fetch('file://' + pathOrUrl);
                }
                return new Response(null, { status: 404 });
            }
        } catch (e) {
            console.error('[Protocol] localcache handler error:', e);
            return new Response(null, { status: 500 });
        }
        return new Response(null, { status: 500 });
    });
    // 注册 imcache:// 自定义协议：将网络图片请求映射到本地磁盘缓存
    protocol.handle(IMCACHE_SCHEME, async (request) => {
        const localPath = await fileCacheManager.handleProtocolRequest(request.url);
        if (localPath) {
            // 本地缓存命中，通过 Electron 的 net.fetch 读取本地文件（ESM 安全）
            return net.fetch('file://' + localPath);
        }
        // 本地缓存 miss，解码出原始 URL 并重定向到网络图片（兜底）
        const encoded = request.url.replace(`${IMCACHE_SCHEME}://`, '').split('?')[0];
        try {
            const originalUrl = Buffer.from(encoded, 'base64url').toString('utf-8');
            return net.fetch(originalUrl);
        } catch {
            return new Response(null, { status: 404 });
        }
    });

    // 注册 imlocal:// 自定义协议：将本地文件路径裁剪缩放后返回给渲染进程
    protocol.handle(IMLOCAL_SCHEME, (request) => {
        const result = fileCacheManager.handleLocalRequest(request.url);

        if (result.status) {
            return new Response(null, { status: result.status });
        }

        if (result.buffer) {
            return new Response(Buffer.from(result.buffer), {
                headers: {
                    'Content-Type': 'image/jpeg',
                    'Cache-Control': 'max-age=31536000',
                }
            });
        }

        if (result.cachePath) {
            return net.fetch('file://' + result.cachePath);
        }

        return new Response(null, { status: 500 });
    });

    // 注册 imlocalraw:// 自定义协议：原样返回本地图片，不裁剪不缩放
    protocol.handle(IMLOCALRAW_SCHEME, (request) => {
        const result = fileCacheManager.handleLocalRequestRaw(request.url);
        if (result.status) {
            return new Response(null, { status: result.status });
        }
        if (result.filePath) {
            return net.fetch('file://' + result.filePath);
        }
        return new Response(null, { status: 500 });
    });
}
