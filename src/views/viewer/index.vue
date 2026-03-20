<template>
    <div class="photo-viewer" @wheel="handleWheel" @mousedown="handleMouseDown">
        <!-- Title Bar Region (Hidden visual, but used for drag region via IPC if needed, or rely on custom frame) -->
        <TitleBar class="title-bar" :title="currentTitle" :need-max="true" theme="dark" />

        <!-- Image Container -->
        <div class="image-container" ref="containerRef">
            <img v-if="currentUrl" ref="imgRef" :src="currentUrl" class="viewer-image" :style="imageStyle"
                draggable="false" @load="handleImageLoad" />
        </div>

        <!-- Toolbar -->
        <div class="toolbar" @mousedown.stop>
            <div class="tool-btn" @click="rotate(-90)" title="向左旋转">
                <img :src="LeftRotate" alt="Left" />
            </div>
            <div class="tool-btn right-rotate" @click="rotate(90)" title="向右旋转">
                <img :src="LeftRotate" alt="Right" />
            </div>
            <div class="divider"></div>
            <div class="tool-btn" @click="zoom(-0.1)" title="缩小">
                <img :src="ZoomOut" alt="Out" />
            </div>
            <div class="tool-btn" @click="zoom(0.1)" title="放大">
                <img :src="ZoomIn" alt="In" />
            </div>
            <div class="divider"></div>
            <div class="tool-btn" @click="downloadImage" title="保存图片">
                <img :src="Download" alt="Save" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import LeftRotate from '@/assets/photoView/left-rotate.svg?url';
import ZoomIn from '@/assets/photoView/zoom-in.svg?url';
import ZoomOut from '@/assets/photoView/zoom-out.svg?url';
import Download from '@/assets/photoView/download.svg?url';
import { signalWindowReady } from '@/utils/windowReady';
import { ElMessage } from 'element-plus';

// State
const route = useRoute();
const urls = ref<string[]>([]);
const currentIndex = ref(0);
const scale = ref(1);
const rotation = ref(0);
const position = ref({ x: 0, y: 0 });
const isDragging = ref(false);
const lastMousePos = ref({ x: 0, y: 0 });
// true during wheel/drag: suppresses CSS transition to avoid tile-memory exhaustion
const isContinuous = ref(false);

// Refs
const containerRef = ref<HTMLElement | null>(null);
const imgRef = ref<HTMLImageElement | null>(null);

// Computed
const currentUrl = computed(() => urls.value[currentIndex.value] || '');
const currentTitle = computed(() => {
    const url = currentUrl.value;
    if (!url) return 'Photo Viewer';
    const name = url.split('/').pop() || 'Image';
    return `图片查看 - ${name}`;
});

const imageStyle = computed(() => ({
    transform: `translate(${position.value.x}px, ${position.value.y}px) scale(${scale.value}) rotate(${rotation.value}deg)`,
    cursor: isDragging.value ? 'grabbing' : (scale.value > 1 ? 'grab' : 'default'),
    // Suppress transition during wheel/drag to avoid Chromium tile-memory exhaustion
    transition: isContinuous.value ? 'none' : 'transform 0.15s ease-out'
}));

// Lifecycle
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
const debouncedFitToWindow = () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fitToWindow, 100);
};

onMounted(() => {
    const queryUrls = route.query.urls as string;
    const queryIndex = route.query.index as string;

    if (queryUrls) {
        try {
            urls.value = JSON.parse(queryUrls);
        } catch (e) {
            console.error('Failed to parse urls', e);
            urls.value = [queryUrls];
        }
    }

    if (queryIndex) {
        currentIndex.value = parseInt(queryIndex) || 0;
    }

    window.addEventListener('resize', debouncedFitToWindow);
    signalWindowReady();
});

onUnmounted(() => {
    window.removeEventListener('resize', debouncedFitToWindow);
    if (resizeTimer) clearTimeout(resizeTimer);
});

// Methods

const handleImageLoad = () => {
    fitToWindow();
};

const fitToWindow = () => {
    if (!imgRef.value || !containerRef.value) return;

    const containerW = containerRef.value.clientWidth;
    const containerH = containerRef.value.clientHeight;
    const imgW = imgRef.value.naturalWidth;
    const imgH = imgRef.value.naturalHeight;

    // Reset state
    rotation.value = 0;
    position.value = { x: 0, y: 0 };

    // Calc fit scale
    const scaleW = containerW / imgW;
    const scaleH = containerH / imgH;
    scale.value = Math.min(scaleW, scaleH, 1) * 0.9; // 90% fit
};

const rotate = (deg: number) => {
    rotation.value = (rotation.value + deg) % 360;
    // Reset position on rotate to avoid confusion
    // position.value = { x: 0, y: 0 }; 
};

const zoom = (delta: number) => {
    const newScale = Math.max(0.1, Math.min(5, scale.value + delta));
    scale.value = newScale;
    checkBoundary();
};

// requestAnimationFrame throttle for wheel zoom
let rafPending = false;
let pendingDelta = 0;

const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    pendingDelta += e.deltaY;
    if (rafPending) return;
    rafPending = true;
    isContinuous.value = true;

    requestAnimationFrame(() => {
        const zoomFactor = -0.001 * pendingDelta;
        const newScale = Math.max(0.1, Math.min(5, scale.value * (1 + zoomFactor)));
        scale.value = newScale;
        pendingDelta = 0;
        rafPending = false;
        checkBoundary();
        // Re-enable transition after wheel stops (300ms idle)
        clearTimeout(wheelEndTimer);
        wheelEndTimer = setTimeout(() => { isContinuous.value = false; }, 300);
    });
};
let wheelEndTimer: ReturnType<typeof setTimeout>;

const checkBoundary = () => {
    if (!imgRef.value || !containerRef.value) return;

    const containerW = containerRef.value.clientWidth;
    const containerH = containerRef.value.clientHeight;
    const currentW = imgRef.value.naturalWidth * scale.value;
    const currentH = imgRef.value.naturalHeight * scale.value;

    // Early exit when image fits inside container
    if (currentW <= containerW && currentH <= containerH) {
        position.value.x = 0;
        position.value.y = 0;
        return;
    }

    // X Axis
    if (currentW <= containerW) {
        position.value.x = 0;
    } else {
        const maxOffset = (currentW - containerW) / 2;
        position.value.x = Math.max(-maxOffset, Math.min(maxOffset, position.value.x));
    }

    // Y Axis
    if (currentH <= containerH) {
        position.value.y = 0;
    } else {
        const maxOffset = (currentH - containerH) / 2;
        position.value.y = Math.max(-maxOffset, Math.min(maxOffset, position.value.y));
    }
};

const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;

    isDragging.value = true;
    isContinuous.value = true;
    lastMousePos.value = { x: e.clientX, y: e.clientY };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
};

const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.value) return;

    const dx = e.clientX - lastMousePos.value.x;
    const dy = e.clientY - lastMousePos.value.y;

    lastMousePos.value = { x: e.clientX, y: e.clientY };

    position.value.x += dx;
    position.value.y += dy;

    checkBoundary();
};

const handleMouseUp = () => {
    isDragging.value = false;
    isContinuous.value = false;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
};

const downloadImage = () => {
    const link = document.createElement('a');
    link.href = currentUrl.value;
    link.download = `image-${Date.now()}.png`; // or extract extension
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    ElMessage.success("保存成功")
};

</script>

<style scoped lang="scss">
.photo-viewer {
    width: 100%;
    height: 100vh;
    background-color: #121212;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    user-select: none;

    .title-bar {
        z-index: 100;
        width: 100%;
        background-color: #1E1E1E;
    }

    .image-container {
        -webkit-app-region: no-drag;
        // margin-top: 35px;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;

        .viewer-image {
            max-width: none; // Allow scaling beyond container
            max-height: none;
            will-change: transform;
            pointer-events: auto;
        }
    }

    .toolbar {
        -webkit-app-region: no-drag;
        position: absolute;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        height: 50px;
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        border-radius: 25px;
        display: flex;
        align-items: center;
        padding: 0 20px;
        gap: 15px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        z-index: 100;
        border: 1px solid rgba(255, 255, 255, 0.1);

        .tool-btn {
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            border-radius: 50%;
            transition: all 0.2s;

            &.right-rotate {
                transform: rotate(270deg);
            }

            &:hover {
                background: rgba(255, 255, 255, 0.2);
                transform: scale(1.1);
            }

            img {
                width: 18px;
                height: 18px;
                filter: invert(1); // White icons
                opacity: 0.8;
            }
        }

        .divider {
            width: 1px;
            height: 20px;
            background: rgba(255, 255, 255, 0.2);
        }
    }
}
</style>
