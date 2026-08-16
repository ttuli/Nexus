<template>
    <div 
        class="rich-editor-container" 
        :class="{ 'is-dragging': isDragging }"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
        @click="focus"
    >
        <!-- 拖拽提示遮罩 -->
        <div class="drag-mask" v-if="isDragging">
            <span class="drag-tip">松开鼠标添加图片 / 发送文件</span>
        </div>

        <!-- contenteditable 可编辑输入框 -->
        <div 
            ref="editorRef" 
            class="rich-editor-field" 
            contenteditable="true"
            spellcheck="false"
            :data-placeholder="placeholder"
            @keydown="handleKeyDown"
            @paste="handlePaste"
            @keyup="saveSelection"
            @mouseup="saveSelection"
            @focus="saveSelection"
            @compositionstart="isComposing = true"
            @compositionend="isComposing = false"
        ></div>
    </div>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount, nextTick } from 'vue';

type MessageSegment =
    | { type: 'text'; content: string }
    | { type: 'image'; file: File; url: string; fileId: string };

withDefaults(defineProps<{
    placeholder?: string;
    disabled?: boolean;
}>(), {
    placeholder: '发送消息...'
});

const emit = defineEmits<{
    (e: 'sendText', text: string): void;
    (e: 'sendImage', file: File): void;
    (e: 'sendFile', file: File): void;
}>();

const editorRef = ref<HTMLDivElement | null>(null);
const isDragging = ref(false);
const isComposing = ref(false);
const imageFileMap = new Map<string, { file: File; url: string }>();
let lastRange: Range | null = null;

const ALLOWED_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];

// 1. 光标选区管理
const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.value) {
        const range = sel.getRangeAt(0);
        if (editorRef.value.contains(range.commonAncestorContainer)) {
            lastRange = range.cloneRange();
        }
    }
};

const getEffectiveRange = (): Range => {
    if (lastRange && editorRef.value?.contains(lastRange.commonAncestorContainer)) {
        return lastRange;
    }
    const range = document.createRange();
    if (editorRef.value) {
        range.selectNodeContents(editorRef.value);
        range.collapse(false);
    }
    return range;
};

// 2. 内容插入方法
const insertText = (text: string) => {
    if (!editorRef.value) return;
    const sel = window.getSelection();
    if (!sel) return;

    const range = getEffectiveRange();
    range.deleteContents();

    const textNode = document.createTextNode(text);
    range.insertNode(textNode);

    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    sel.removeAllRanges();
    sel.addRange(range);
    saveSelection();
};

const insertImage = (file: File) => {
    if (!editorRef.value) return;
    const sel = window.getSelection();
    if (!sel) return;

    const url = URL.createObjectURL(file);
    const fileId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    imageFileMap.set(fileId, { file, url });

    const img = document.createElement('img');
    img.src = url;
    img.className = 'rich-editor-image';
    img.contentEditable = 'false';
    img.dataset.fileId = fileId;
    img.alt = file.name || '图片';

    const range = getEffectiveRange();
    range.deleteContents();
    range.insertNode(img);

    range.setStartAfter(img);
    range.setEndAfter(img);
    sel.removeAllRanges();
    sel.addRange(range);
    saveSelection();
};

// 3. 事件处理（粘贴、拖拽、回车）
const handlePaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;

    let hasImage = false;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) {
                insertImage(file);
                hasImage = true;
            }
            break;
        }
    }

    if (!hasImage) {
        e.preventDefault();
        const text = e.clipboardData?.getData('text/plain') || '';
        if (text) document.execCommand('insertText', false, text);
    }
};

const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.value = true;
};

const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.value = false;
};

const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.value = false;

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        if (file.type.startsWith('image/') || ALLOWED_IMAGE_EXTS.includes(ext)) {
            insertImage(file);
        } else {
            emit('sendFile', file);
        }
    }
};

const handleKeyDown = (e: KeyboardEvent) => {
    if (isComposing.value || e.isComposing) return;

    if (e.key === 'Enter') {
        if (e.ctrlKey) {
            e.preventDefault();
            insertText('\n');
        } else if (!e.shiftKey) {
            e.preventDefault();
            submit();
        }
    }
};

// 4. 解析与提交
const parseContent = (): MessageSegment[] => {
    if (!editorRef.value) return [];
    const segments: MessageSegment[] = [];
    const childNodes = Array.from(editorRef.value.childNodes);

    for (const node of childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent;
            if (text) segments.push({ type: 'text', content: text });
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.tagName === 'IMG' && el.dataset.fileId) {
                const imgInfo = imageFileMap.get(el.dataset.fileId);
                if (imgInfo) {
                    segments.push({
                        type: 'image',
                        file: imgInfo.file,
                        url: imgInfo.url,
                        fileId: el.dataset.fileId
                    });
                }
            } else if (el.tagName === 'BR') {
                segments.push({ type: 'text', content: '\n' });
            } else if (el.innerText) {
                segments.push({ type: 'text', content: el.innerText });
            }
        }
    }

    const merged: MessageSegment[] = [];
    for (const seg of segments) {
        const prev = merged[merged.length - 1];
        if (seg.type === 'text' && prev && prev.type === 'text') {
            prev.content += seg.content;
        } else {
            merged.push({ ...seg });
        }
    }

    return merged;
};

const submit = () => {
    const segments = parseContent();
    if (segments.length === 0) return;

    for (const seg of segments) {
        if (seg.type === 'text') {
            const trimmed = seg.content.trim();
            if (trimmed) emit('sendText', trimmed);
        } else if (seg.type === 'image') {
            emit('sendImage', seg.file);
        }
    }
    clear();
};

const clear = () => {
    if (editorRef.value) editorRef.value.innerHTML = '';
    imageFileMap.forEach(({ url }) => URL.revokeObjectURL(url));
    imageFileMap.clear();
    lastRange = null;
};

const focus = () => {
    nextTick(() => {
        if (editorRef.value) {
            editorRef.value.focus();
            saveSelection();
        }
    });
};

onBeforeUnmount(() => {
    imageFileMap.forEach(({ url }) => URL.revokeObjectURL(url));
    imageFileMap.clear();
});

defineExpose({
    insertText,
    insertImage,
    clear,
    focus,
    submit
});
</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

.rich-editor-container {
    width: 100%;
    height: 100%;
    position: relative;
    display: flex;
    overflow-y: auto;
    cursor: text;

    &.is-dragging {
        background-color: rgba(var(--color-primary-rgb, 64, 158, 255), 0.04);
    }

    .drag-mask {
        position: absolute;
        inset: 2px;
        z-index: 20;
        background: rgba(var(--color-primary-rgb, 64, 158, 255), 0.08);
        border: 2px dashed $color-primary;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        backdrop-filter: blur(1px);

        .drag-tip {
            color: $color-primary;
            font-size: 13px;
            font-weight: 500;
        }
    }

    .rich-editor-field {
        width: 100%;
        min-height: 100%;
        border: none;
        outline: none;
        font-size: 14px;
        font-family: inherit;
        color: $color-text-primary;
        background: transparent;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;

        &:empty::before {
            content: attr(data-placeholder);
            color: $color-text-placeholder;
            pointer-events: none;
        }

        :deep(.rich-editor-image) {
            max-width: 120px;
            max-height: 120px;
            border-radius: 6px;
            margin: 2px 4px;
            vertical-align: bottom;
            display: inline-block;
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
            border: 1px solid rgba(0, 0, 0, 0.08);
            user-select: none;
        }
    }
}
</style>
