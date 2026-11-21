/**
 * 文件名 / 大小 / 扩展名配色与图片扩展名等通用格式化工具
 */

export const ALLOWED_IMAGE_EXTS: readonly string[] = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];

export interface FileIconTheme {
    color1: string;
    color2: string;
}

const DEFAULT_FILE_THEME: FileIconTheme = { color1: '#38bdf8', color2: '#2563eb' };

const FILE_THEME_GROUPS: Array<{ exts: string[]; theme: FileIconTheme }> = [
    { exts: ['pdf'], theme: { color1: '#f87171', color2: '#ef4444' } },
    { exts: ['doc', 'docx', 'wps'], theme: { color1: '#60a5fa', color2: '#2563eb' } },
    { exts: ['xls', 'xlsx', 'csv', 'et'], theme: { color1: '#4ade80', color2: '#16a34a' } },
    { exts: ['ppt', 'pptx', 'dps', 'key'], theme: { color1: '#fb923c', color2: '#ea580c' } },
    { exts: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'dmg'], theme: { color1: '#a78bfa', color2: '#7c3aed' } },
    { exts: ['txt', 'md', 'log', 'rtf'], theme: { color1: '#94a3b8', color2: '#64748b' } },
    { exts: ['js'], theme: { color1: '#facc15', color2: '#ca8a04' } },
    { exts: ['json', 'yaml', 'yml', 'xml'], theme: { color1: '#facc15', color2: '#d97706' } },
    { exts: ['ts', 'env', 'conf', 'ini'], theme: { color1: '#38bdf8', color2: '#0284c7' } },
    { exts: ['vue'], theme: { color1: '#34d399', color2: '#059669' } },
    { exts: ['py'], theme: { color1: '#34d399', color2: '#0d9488' } },
    { exts: ['java'], theme: { color1: '#f87171', color2: '#dc2626' } },
    { exts: ['c', 'cpp'], theme: { color1: '#60a5fa', color2: '#1d4ed8' } },
    { exts: ['go'], theme: { color1: '#38bdf8', color2: '#0891b2' } },
    { exts: ['rs'], theme: { color1: '#fb923c', color2: '#c2410c' } },
    { exts: ['sql'], theme: { color1: '#06b6d4', color2: '#0e7490' } },
    { exts: ['sh', 'bat'], theme: { color1: '#818cf8', color2: '#4f46e5' } },
    { exts: ['html'], theme: { color1: '#fb7185', color2: '#e11d48' } },
    { exts: ['css'], theme: { color1: '#38bdf8', color2: '#4f46e5' } },
    { exts: ['scss', 'mp3', 'wav', 'flac', 'aac', 'm4a'], theme: { color1: '#f472b6', color2: '#db2777' } },
    { exts: ['mp4', 'mov', 'avi', 'mkv'], theme: { color1: '#fb7185', color2: '#e11d48' } },
    { exts: ['psd'], theme: { color1: '#38bdf8', color2: '#1d4ed8' } },
    { exts: ['ai'], theme: { color1: '#fb923c', color2: '#b45309' } },
    { exts: ['exe', 'msi'], theme: { color1: '#64748b', color2: '#334155' } },
    { exts: ['apk'], theme: { color1: '#4ade80', color2: '#15803d' } },
];

const FILE_THEME_MAP: Record<string, FileIconTheme> = Object.fromEntries(
    FILE_THEME_GROUPS.flatMap(({ exts, theme }) => exts.map((ext) => [ext, theme]))
);

/** 格式化文件大小（如 1.2 MB） */
export function formatFileSize(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(1))} ${units[i]}`;
}

/** 提取用于文档图标角标的 1~4 位大写扩展名 */
export function getFileExtension(fileName?: string, format?: string): string {
    if (format) return format.slice(0, 4).toUpperCase();
    const name = fileName || '';
    const lastDotIndex = name.lastIndexOf('.');
    if (lastDotIndex !== -1 && lastDotIndex < name.length - 1) {
        return name.slice(lastDotIndex + 1).toUpperCase().slice(0, 4);
    }
    return name.slice(0, 4).toUpperCase() || 'FILE';
}

/** 根据扩展名返回文档图标渐变起止色 */
export function getFileTheme(ext: string): FileIconTheme {
    return FILE_THEME_MAP[ext.toLowerCase()] || DEFAULT_FILE_THEME;
}

/** 返回文档图标的 CSS 线性渐变背景 */
export function getFileGradient(ext: string): string {
    const { color1, color2 } = getFileTheme(ext);
    return `linear-gradient(135deg, ${color1}, ${color2})`;
}
