import { h, render, ComponentPublicInstance } from 'vue';
import GlobalLoadingComponent from '@/src/components/GlobalLoading/GlobalLoading.vue';

interface LoadingInstance extends ComponentPublicInstance {
    open: (text?: string) => Promise<void>;
    close: () => void;
}

// Singleton state
let container: HTMLElement | null = null;
let instance: LoadingInstance | null = null;

const GlobalLoading = {
    show(text?: string) {
        if (!container) {
            // Create container
            container = document.createElement('div');
            container.className = 'global-loading-container';

            // Create vnode
            const vnode = h(GlobalLoadingComponent);

            // Mount to DOM
            render(vnode, container);
            document.body.appendChild(container);

            // Get instance
            instance = vnode.component?.exposed as LoadingInstance;

            if (!instance) {
                console.error('GlobalLoading component instance not found');
                return;
            }
        }

        // Show loading
        instance?.open(text);
    },

    close() {
        if (instance) {
            instance.close();

            // Optional: Remove from DOM after transition if strictly following ephemeral pattern
            // But for GlobalLoading, keeping it mounted might be better for performance if used frequently.
            // For now, we just hide it (visible.value = false).

            // If we want to completely remove it from DOM to match CusDialog behavior:
            /*
            setTimeout(() => {
                if (container) {
                    render(null, container);
                    document.body.removeChild(container);
                    container = null;
                    instance = null;
                }
            }, 300);
            */
        }
    }
};

export default GlobalLoading;
