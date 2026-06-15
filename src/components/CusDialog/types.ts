import { VNode } from 'vue';

export enum DialogResult {
    Confirm = 'confirm',
    Cancel = 'cancel',
    Close = 'close'
}

export type DialogStatus = 'accent' | 'success' | 'warning' | 'danger' | 'info';

export interface DialogOptions {
    title?: string;
    content?: string | VNode | (() => VNode);
    showCancel?: boolean;
    showClose?: boolean;
    confirmText?: string;
    cancelText?: string;
    status?: DialogStatus;
}
