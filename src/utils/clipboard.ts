import { ElMessage } from 'element-plus';

export interface CopyToastOptions {
    successMsg?: string;
    errorMsg?: string;
}

/**
 * 复制文本到剪贴板并给出统一 Toast 提示
 */
export async function copyToClipboard(
    text: string,
    options: CopyToastOptions = {}
): Promise<boolean> {
    const { successMsg = '复制成功', errorMsg = '复制失败' } = options;
    if (!text) return false;
    try {
        await navigator.clipboard.writeText(text);
        if (successMsg) ElMessage.success(successMsg);
        return true;
    } catch (err) {
        console.error('[clipboard] copy failed:', err);
        if (errorMsg) ElMessage.error(errorMsg);
        return false;
    }
}
