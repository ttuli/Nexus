import { h, render, ComponentPublicInstance } from 'vue';
import CusDialogComponent from '@/src/components/CusDialog/CusDialog.vue';
import { DialogOptions, DialogResult } from './types';

interface CusDialogInstance extends ComponentPublicInstance {
    open: () => Promise<DialogResult>;
}

const CusDialog = {
    open(options: string | DialogOptions) {
        // Handle overload
        const config: DialogOptions = typeof options === 'string'
            ? { content: options }
            : options;

        // Create container
        const container = document.createElement('div');

        // Create vnode
        const vnode = h(CusDialogComponent, {
            ...config,
            // Pass props directly
            title: config.title,
            showCancel: config.showCancel,
            showClose: config.showClose,
            confirmText: config.confirmText,
            cancelText: config.cancelText,
            status: config.status,
        }, {
            default: () => {
                if (!config.content) return null;
                if (typeof config.content === 'string') {
                    return h('p', { class: 'content' }, config.content);
                }
                if (typeof config.content === 'function') {
                    return config.content();
                }
                return config.content;
            }
        });

        // Mount to DOM
        render(vnode, container);
        document.body.appendChild(container);

        // Call open method on component instance
        const instance = vnode.component?.exposed as CusDialogInstance;

        if (!instance) {
            throw new Error('CusDialog component instance not found');
        }

        return instance.open().then((result: DialogResult) => {
            // Cleanup after animations
            setTimeout(() => {
                render(null, container);
                document.body.removeChild(container);
            }, 500); // Wait for transition out
            return result;
        });
    }
};

export { DialogResult };
export default CusDialog;
