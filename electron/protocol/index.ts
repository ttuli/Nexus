import { protocol } from 'electron'
import { fileCacheManager } from '@/electron/resource/fileCacheManager'
import { LOCAL_CACHE_SCHEME } from '@/src/config/constants'

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
}
