export enum DialogResult {
    Confirm = 'confirm',
    Cancel = 'cancel',
    Close = 'close'
}

export interface DialogOptions {
    title?: string;
    content: string;
    showCancel?: boolean;
    showClose?: boolean;
    confirmText?: string;
    cancelText?: string;
}
