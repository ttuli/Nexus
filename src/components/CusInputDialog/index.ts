import { h, render, ComponentPublicInstance } from 'vue';
import CusInputDialogComponent from './CusInputDialog.vue';
import { InputDialogOptions } from './types';

interface CusInputDialogInstance extends ComponentPublicInstance {
    open: () => Promise<string | undefined>;
}

const CusInputDialog = {
    open(options: InputDialogOptions) {
        // Create container
        const container = document.createElement('div');

        // Create vnode
        const vnode = h(CusInputDialogComponent, {
            ...options
        });

        // Mount to DOM
        render(vnode, container);
        document.body.appendChild(container);

        // Call open method on component instance
        const instance = vnode.component?.exposed as CusInputDialogInstance;

        if (!instance) {
            throw new Error('CusInputDialog component instance not found');
        }

        return instance.open().then((result: string | undefined) => {
            // Cleanup after animations
            setTimeout(() => {
                render(null, container);
                document.body.removeChild(container);
            }, 300); // Wait for transition out
            return result;
        });
    }
};

export default CusInputDialog;
