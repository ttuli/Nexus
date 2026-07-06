import { LOCAL_CACHE_SCHEME } from '@shared/config/constants';
import { CacheOption } from '@shared/types';

/**
 * 统一的本地/网络资源 URL 转换器
 * @param pathOrUrl 资源的本地绝对路径，或是网络 http(s) URL
 * @param opts      缓存选项，格式如 { key: 'fileKey', ossProcess: '...' }
 */
export function toResourceUrl(pathOrUrl: string, opts: CacheOption): string {
    if (!pathOrUrl) return '';

    // 如果已经是 localcache 协议了，就直接返回
    if (pathOrUrl.startsWith(`${LOCAL_CACHE_SCHEME}://`)) return pathOrUrl;

    // URL-safe Base64 编码路径或 URL
    const encoded = btoa(encodeURIComponent(pathOrUrl).replace(/%([0-9A-F]{2})/g, (_, p1) =>
        String.fromCharCode(parseInt(p1, 16))
    )).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    let result = `${LOCAL_CACHE_SCHEME}://${encoded}`;

    // 将 opts 打包并进行 URL-safe Base64 编码拼接
    if (opts && Object.keys(opts).length > 0) {
        const encodedOpts = btoa(encodeURIComponent(JSON.stringify(opts)).replace(/%([0-9A-F]{2})/g, (_, p1) =>
            String.fromCharCode(parseInt(p1, 16))
        )).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        result += `?opts=${encodedOpts}`;
    }

    return result;
}
