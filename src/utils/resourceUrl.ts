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

/**
 * public/ 目录下静态资源（图标、提示音等）的 URL
 *
 * 不能直接写 '/icon/xxx.png' 这样的根路径：打包后页面经 file:// 加载，根路径会解析到磁盘根目录
 * （file:///C:/icon/xxx.png）导致加载失败，而开发时有 dev server 兜着，发现不了。
 * BASE_URL 开发时是 '/'，打包后是 './'（vite-plugin-electron-renderer 设的相对 base），两种环境都能指到 public/。
 * @param path 相对 public/ 的路径，如 'icon/icon.png'
 */
export function publicUrl(path: string): string {
    return import.meta.env.BASE_URL + path;
}
