import { protocol, net } from 'electron'
import { fileCacheManager, IMCACHE_SCHEME, IMLOCAL_SCHEME } from '../resource/fileCacheManager'

export function registerProtocols() {
    // 注册 imcache:// 自定义协议：将网络图片请求映射到本地磁盘缓存
    protocol.handle(IMCACHE_SCHEME, (request) => {
        const localPath = fileCacheManager.handleProtocolRequest(request.url);
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
        const result = fileCacheManager.handleLocalRequest(request.url, 250); // 宽度默认设为 250

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
}
