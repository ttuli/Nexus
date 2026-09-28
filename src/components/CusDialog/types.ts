import { VNode } from 'vue';

export enum DialogResult {
    Confirm = 'confirm',
    Cancel = 'cancel',
    Close = 'close',
    /** 底栏左侧的附加操作（extraText） */
    Extra = 'extra'
}

export type DialogStatus = 'accent' | 'success' | 'warning' | 'danger' | 'info';

export interface DialogOptions {
    title?: string;
    content?: string | VNode | (() => VNode);
    showCancel?: boolean;
    showClose?: boolean;
    confirmText?: string;
    cancelText?: string;
    /** 底栏左侧的弱化文字按钮（如「跳过此版本」），点击后以 DialogResult.Extra 关闭；不传则不显示 */
    extraText?: string;
    status?: DialogStatus;
}
