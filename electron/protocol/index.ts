import { protocol, net } from 'electron'
import { fileCacheManager } from '@/electron/resource/fileCacheManager'
import { IMCACHE_SCHEME, LOCAL_CACHE_SCHEME } from '@/src/config/constants'

export function registerProtocols() {

    protocol.handle(LOCAL_CACHE_SCHEME, async (request) => {
        try {
            const withoutScheme = request.url.replace(`${LOCAL_CACHE_SCHEME}://`, '');
            const [encodedPart, queryString] = withoutScheme.split('?');
            
            // 1. 解码出原始路径或 URL
            const encodedPath = encodedPart.replace(/-/g, '+').replace(/_/g, '/');
            const pathOrUrl = decodeURIComponent(atob(encodedPath).split('').map((c) =>
                '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
            
            // 2. 解码打包的 opts 参数
            const params = new URLSearchParams(queryString || '');
            const optsBase64 = params.get('opts');
            let opts: any = {};
            if (optsBase64) {
                try {
                    const encodedOpts = optsBase64.replace(/-/g, '+').replace(/_/g, '/');
                    const jsonStr = decodeURIComponent(atob(encodedOpts).split('').map((c) =>
                        '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
                    opts = JSON.parse(jsonStr);
                } catch (err) {
                    console.error('[Protocol] Failed to parse opts:', err);
                }
            }

            // 3. 将核心处理逻辑委托给 fileCacheManager
            const response = await fileCacheManager.handleLocalCacheRequest(pathOrUrl, opts);
            if (response) return response;
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
}
