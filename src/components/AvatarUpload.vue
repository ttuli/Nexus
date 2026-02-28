<template>
  <div class="avatar-upload" :class="{ 'is-preview-open': previewVisible }" @click.capture.stop="onContainerClick"
    :title="title">
    <Avatar :uid="uid" :width="'100%'" :height="'100%'" :radius="'50%'" />
    <div class="avatar-overlay">
      <svg viewBox="0 0 24 24" class="camera-icon">
        <path
          d="M12 15.5c1.93 0 3.5-1.57 3.5-3.5s-1.57-3.5-3.5-3.5-3.5 1.57-3.5 3.5 1.57 3.5 3.5 3.5zM17.5 9c.28 0 .5-.22.5-.5s-.22-.5-.5-.5-.5.22-.5.5.22.5.5.5zM20 4h-3.17l-1.24-1.35c-.37-.41-.91-.65-1.47-.65H9.88c-.56 0-1.1.24-1.47.65L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 13c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" />
      </svg>
    </div>
    <input ref="avatarInput" type="file" accept="image/*" @change="handleAvatarChange" style="display: none" />

    <!-- 头像预览弹窗 - Teleport ensure it's on top of everything -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="previewVisible" class="modal-overlay" @click="handleOverlayClick">
          <div class="modal-card avatar-preview-modal" @click.stop>
            <div class="modal-header">
              <span>修改头像</span>
              <button class="close-btn" @click="closePreview">×</button>
            </div>
            <div class="modal-body">
              <div class="avatar-crop-container" @mousedown="startDrag" @touchstart.prevent="startDrag"
                @wheel.prevent="handleWheel">
                <div class="crop-mask"></div>
                <img ref="previewImage" :src="previewUrl" alt="头像预览" class="crop-image" :style="imageStyle"
                  @load="onImageLoad" />
              </div>
              <div v-if="processing" class="processing-bar">
                <div class="bar"></div>
              </div>
              <div class="preview-info">
                <p class="preview-label">拖拽调整位置，滚轮缩放</p>
                <p class="file-info">{{ selectedFile?.name }}</p>
                <p class="file-size" v-if="selectedFile">{{ formatSize(selectedFile.size) }}</p>
              </div>
            </div>
            <div class="modal-footer">
              <CusButton class="footer-btn" type="normal" @click="closePreview" :disabled="uploading"
                :show-icon="false">
                取消</CusButton>
              <CusButton class="footer-btn" type="primary" :disabled="uploading" :loading="uploading"
                @click="confirmUpload" :show-icon="false">
                {{ uploading ? '上传中...' : '确认更换' }}
              </CusButton>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted, computed } from 'vue'
import Avatar from '@/components/Avatar.vue'
import CusButton from '@/components/CusButton.vue'
import { fileService } from '@/services/fileService'
import { ElMessage } from 'element-plus'
import { ApiTypes } from '@/types'

interface Props {
  uid: number
  title?: string
  maxSize?: number // MB
}

interface Emits {
  (e: 'success', url: string): void
  (e: 'error', error: any): void
}

const props = withDefaults(defineProps<Props>(), {
  title: '点击修改头像',
  maxSize: 5 // Default to 5MB, more reasonable
})

const emit = defineEmits<Emits>()

// 响应式变量
const avatarInput = ref<HTMLInputElement>()
const previewVisible = ref(false)
const uploading = ref(false)
const selectedFile = ref<File | null>(null)
const previewUrl = ref('')
const processing = ref(false)

// Crop state
const previewImage = ref<HTMLImageElement>()
const scale = ref(1)
const position = ref({ x: 0, y: 0 })
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const initialPosition = ref({ x: 0, y: 0 })

// Constants
const CONTAINER_SIZE = 280
const MAX_SCALE_MULTIPLIER = 5 // Max zoom relative to minScale

// Style for the image
const imageStyle = computed(() => ({
  transform: `translate(${position.value.x}px, ${position.value.y}px) scale(${scale.value})`
}))

// 打开文件选择器
const openAvatarUpload = () => {
  if (uploading.value) return
  avatarInput.value?.click()
}

// 容器点击
const onContainerClick = () => {
  if (previewVisible.value) return
  openAvatarUpload()
}

// 格式化文件大小
const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 处理文件选择
const handleAvatarChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) return

  // 验证文件类型
  if (!file.type.startsWith('image/')) {
    ElMessage.error('请选择图片文件')
    resetInput()
    return
  }

  // 验证文件大小
  const maxSizeBytes = props.maxSize * 1024 * 1024
  if (file.size > maxSizeBytes) {
    ElMessage.error(`图片大小不能超过 ${props.maxSize}MB`)
    resetInput()
    return
  }

  // 清理旧的 URL
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
  }

  selectedFile.value = file
  previewUrl.value = URL.createObjectURL(file)
  previewVisible.value = true

  // Reset crop state
  scale.value = 1
  position.value = { x: 0, y: 0 }
}

// Helper: Get strictly constrained scale and position
const getMinScale = () => {
  if (!previewImage.value) return 1
  const imgWidth = previewImage.value.naturalWidth
  const imgHeight = previewImage.value.naturalHeight
  // Image must cover the CONTAINER_SIZE x CONTAINER_SIZE area
  return Math.max(CONTAINER_SIZE / imgWidth, CONTAINER_SIZE / imgHeight)
}

const updateScale = (newScale: number) => {
  const minScale = getMinScale()
  const maxScale = minScale * MAX_SCALE_MULTIPLIER

  // Clamp scale
  const clampedScale = Math.min(Math.max(newScale, minScale), maxScale)
  scale.value = clampedScale

  // Re-verify position constraints with new scale
  updatePosition(position.value.x, position.value.y)
}

const updatePosition = (x: number, y: number) => {
  if (!previewImage.value) return

  const imgWidth = previewImage.value.naturalWidth
  const imgHeight = previewImage.value.naturalHeight
  const currentScale = scale.value

  // Constraints:
  // The image is drawn at (x, y) with size (w*s, h*s).
  // The viewing window is (0, 0) to (CONTAINER_SIZE, CONTAINER_SIZE).

  // Right edge of image (x + w*s) must be >= Right edge of container (CONTAINER_SIZE)
  // x >= CONTAINER_SIZE - w*s
  const minX = CONTAINER_SIZE - imgWidth * currentScale

  // Left edge of image (x) must be <= Left edge of container (0)
  // x <= 0
  const maxX = 0

  // Bottom edge of image (y + h*s) >= Bottom edge of container (CONTAINER_SIZE)
  // y >= CONTAINER_SIZE - h*s
  const minY = CONTAINER_SIZE - imgHeight * currentScale

  // Top edge of image (y) <= Top edge of container (0)
  // y <= 0
  const maxY = 0

  position.value = {
    x: Math.min(Math.max(x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY)
  }
}

const onImageLoad = () => {
  if (!previewImage.value) return

  const imgWidth = previewImage.value.naturalWidth
  const imgHeight = previewImage.value.naturalHeight

  // Calculate min scale to fill container
  const minScale = Math.max(CONTAINER_SIZE / imgWidth, CONTAINER_SIZE / imgHeight)

  // Set initial scale to minScale (fit perfectly)
  scale.value = minScale

  // Center image
  // The content width is imgWidth * scale. The container width is CONTAINER_SIZE.
  // We want (CONTAINER_SIZE - imgWidth * scale) / 2
  const initialX = (CONTAINER_SIZE - imgWidth * minScale) / 2
  const initialY = (CONTAINER_SIZE - imgHeight * minScale) / 2

  position.value = { x: initialX, y: initialY }
}

// Drag logic
const startDrag = (e: MouseEvent | TouchEvent) => {
  isDragging.value = true
  const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX
  const clientY = e instanceof MouseEvent ? e.clientY : e.touches[0].clientY

  dragStart.value = { x: clientX, y: clientY }
  initialPosition.value = { ...position.value }

  window.addEventListener('mousemove', onDrag)
  window.addEventListener('mouseup', stopDrag)
  window.addEventListener('touchmove', onDrag, { passive: false })
  window.addEventListener('touchend', stopDrag)
}

const onDrag = (e: MouseEvent | TouchEvent) => {
  if (!isDragging.value) return
  e.preventDefault() // Prevent scrolling on touch

  const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX
  const clientY = e instanceof MouseEvent ? e.clientY : e.touches[0].clientY

  const deltaX = clientX - dragStart.value.x
  const deltaY = clientY - dragStart.value.y

  updatePosition(
    initialPosition.value.x + deltaX,
    initialPosition.value.y + deltaY
  )
}

const stopDrag = () => {
  isDragging.value = false
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', stopDrag)
  window.removeEventListener('touchmove', onDrag)
  window.removeEventListener('touchend', stopDrag)
}

// Zoom logic
const handleWheel = (e: WheelEvent) => {
  const ZOOM_SPEED = 0.05 // Slower zoom for precision
  // Independent of direction, we want to scale up or down based on deltaY
  const delta = e.deltaY > 0 ? (1 - ZOOM_SPEED) : (1 + ZOOM_SPEED)
  updateScale(scale.value * delta)
}

const resetInput = () => {
  if (avatarInput.value) {
    avatarInput.value.value = ''
  }
}

// 点击遮罩层关闭
const handleOverlayClick = () => {
  if (!uploading.value) {
    closePreview()
  }
}

// 关闭预览
const closePreview = () => {
  previewVisible.value = false
  setTimeout(() => {
    // Wait for transition
    selectedFile.value = null
    if (previewUrl.value) {
      URL.revokeObjectURL(previewUrl.value)
      previewUrl.value = ''
    }
    resetInput()
  }, 300)
}

// 确认上传
const confirmUpload = async () => {
  if (!selectedFile.value || !previewImage.value) return

  uploading.value = true
  processing.value = true

  try {
    // Generate cropped image using Canvas
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to get canvas context')

    // Output size (200x200 standard for avatar)
    const OUTPUT_SIZE = 200
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE

    // We are simply mapping the "Visible Container Area" to the "Canvas Area".
    // 1. Visible Container is (0, 0) w:280, h:280. 
    // 2. Image is drawn at (position.x, position.y) relative to container, scaled by `scale`.
    // 3. We want to draw this into canvas (200x200).
    // So ratio = 200 / 280 = 0.714.
    const drawRatio = OUTPUT_SIZE / CONTAINER_SIZE

    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE)

    // Draw logic:
    // ctx.drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
    // Or just transform context.

    // Let's use transform on the output canvas to match container's coordinate system scaled down.
    // Origin of container (0,0) maps to Origin of canvas (0,0).
    ctx.scale(drawRatio, drawRatio) // Now 1 unit = 1 container pixel

    // Now draw image at exactly same props as in DOM
    ctx.translate(position.value.x, position.value.y)
    ctx.scale(scale.value, scale.value)

    ctx.drawImage(previewImage.value, 0, 0)

    // Convert to blob
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!blob) throw new Error('Failed to create blob')

    const croppedFile = new File([blob], selectedFile.value.name, { type: 'image/jpeg' })
    const { promise } = fileService.uploadFile(croppedFile, ApiTypes.file.FileType.FileTypeAvatar)
    const url = await promise;

    emit('success', url)
    closePreview()
  } catch (error) {
    ElMessage.error('头像上传失败，请重试')
  } finally {
    uploading.value = false
    processing.value = false
  }
}

// Cleanup
onUnmounted(() => {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
  }
})
</script>

<style scoped lang="scss">
@use "@/style/_constant.scss" as *;

.avatar-upload {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 90px;
  height: 90px;
  cursor: pointer;
  border-radius: 50%;
  overflow: hidden;
  transition: transform 0.2s ease;
  user-select: none;
  -webkit-user-drag: none;

  .current-avatar {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  }

  &.is-preview-open {
    cursor: default;
  }

  &:hover {
    .avatar-overlay {
      opacity: 1;
    }
  }
}

.avatar-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s ease;
  border-radius: 50%;
  pointer-events: none;

  .camera-icon {
    width: 24px;
    height: 24px;
    fill: #fff;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
  }
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: $bg-overlay;
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
  -webkit-app-region: no-drag;
}

.modal-card {
  background: $bg-card;
  border-radius: 16px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  width: 360px;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: modal-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-header {
  padding: $spacing-md $spacing-lg;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid $color-border;
  background-color: $bg-body;

  span {
    font-size: $font-size-lg;
    font-weight: $font-weight-semibold;
    color: $color-text-primary;
  }

  .close-btn {
    border: none;
    background: none;
    font-size: 24px;
    color: $color-text-placeholder;
    cursor: pointer;
    line-height: 1;
    padding: 0;
    transition: color $transition-base;

    &:hover {
      color: $color-text-secondary;
    }
  }
}

.modal-body {
  padding: $spacing-lg;
  background: $bg-card;
}

.avatar-crop-container {
  width: 280px;
  height: 280px;
  position: relative;
  overflow: hidden;
  background: #000;
  cursor: grab;
  border-radius: 8px;
  user-select: none;
  margin: 0 auto; // Center horizontally

  &:active {
    cursor: grabbing;
  }

  .crop-mask {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 10;
    // Inscribed circle mask: transparent in center, dark outside
    background: radial-gradient(circle closest-side, transparent 99%, rgba(0, 0, 0, 0.6) 100%);
  }

  .crop-image {
    position: absolute;
    transform-origin: 0 0; // Transform from top-left to make calculation easier
    max-width: none;
    max-height: none;
    pointer-events: none;
  }
}

.processing-bar {
  width: 100%;
  height: 4px;
  background: $bg-disabled;
  border-radius: 2px;
  overflow: hidden;
  margin-top: $spacing-md;

  .bar {
    width: 100%;
    height: 100%;
    background: $color-primary;
    transform-origin: left;
    animation: loading 1s infinite linear;
  }
}

.preview-info {
  text-align: center;
  margin-top: $spacing-md;

  .preview-label {
    font-size: $font-size-base;
    color: $color-text-primary;
    font-weight: $font-weight-medium;
    margin: 0 0 $spacing-xs;
  }

  .file-info {
    font-size: $font-size-sm;
    color: $color-text-secondary;
    margin: 0;
    max-width: 200px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin: 0 auto;
  }

  .file-size {
    font-size: 10px;
    color: $color-text-placeholder;
    margin-top: 2px;
  }
}

.modal-footer {
  padding: $spacing-md $spacing-lg;
  display: flex;
  justify-content: flex-end;
  gap: $spacing-md;
  border-top: 1px solid $color-border;
  background-color: $bg-body;

  .footer-btn {
    min-width: 80px;
    height: 36px !important;
    border-radius: 8px !important;
    font-size: 14px !important;
  }
}

// Animations
@keyframes loading {
  0% {
    transform: translateX(-100%);
  }

  50% {
    transform: translateX(0);
  }

  100% {
    transform: translateX(100%);
  }
}

@keyframes modal-in {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(10px);
  }

  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

// Vue Transition
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;

  .modal-card {
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;

  .modal-card {
    transform: scale(0.95);
  }
}
</style>