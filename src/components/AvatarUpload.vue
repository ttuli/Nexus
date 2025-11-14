<template>
  <div class="avatar-upload" :class="{ 'is-preview-open': previewVisible }" @click="onContainerClick" :title="title">
    <Avatar :source="avatarUrl" />
    <div class="avatar-overlay">
      <svg viewBox="0 0 24 24" class="camera-icon">
        <path
          d="M12 15.5c1.93 0 3.5-1.57 3.5-3.5s-1.57-3.5-3.5-3.5-3.5 1.57-3.5 3.5 1.57 3.5 3.5 3.5zM17.5 9c.28 0 .5-.22.5-.5s-.22-.5-.5-.5-.5.22-.5.5.22.5.5.5zM20 4h-3.17l-1.24-1.35c-.37-.41-.91-.65-1.47-.65H9.88c-.56 0-1.1.24-1.47.65L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 13c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" />
      </svg>
    </div>
    <input ref="avatarInput" type="file" accept="image/*" @change="handleAvatarChange" style="display: none" />

    <!-- 头像预览弹窗 -->
    <div v-if="previewVisible" class="modal-overlay">
      <div class="modal-card avatar-preview-modal" @click.stop>
        <div class="modal-header">修改头像</div>
        <div class="modal-body">
          <div class="avatar-preview-container">
            <div class="preview-avatar" :class="{ processing }">
              <img :src="previewUrl" alt="头像预览" />
            </div>
            <div v-if="processing" class="processing-bar">
              <div class="bar"></div>
            </div>
            <div class="preview-info">
              <p>预览新头像</p>
              <p class="file-info">{{ selectedFile?.name }}</p>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" @click="closePreview" :disabled="uploading">取消</button>
          <button class="btn primary" :disabled="uploading" @click="confirmUpload">
            <span class="spinner" v-if="uploading"></span>
            <span>{{ uploading ? '上传中…' : '确认修改' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Avatar from '@/components/Avatar.vue'
import { getUploadSignature } from '@/apis/file'
import { computeFileMd5 } from '@/utils/md5'
import { ElMessage } from 'element-plus'

interface Props {
  avatarUrl?: string
  title?: string
  maxSize?: number // MB
}

interface Emits {
  (e: 'success', url: string): void
  (e: 'error', error: any): void
}

const props = withDefaults(defineProps<Props>(), {
  avatarUrl: '',
  title: '点击修改头像',
  maxSize: 10
})

const emit = defineEmits<Emits>()

// 响应式变量
const avatarInput = ref<HTMLInputElement>()
const previewVisible = ref(false)
const uploading = ref(false)
const selectedFile = ref<File | null>(null)
const previewUrl = ref('')
const processing = ref(false)

// 打开文件选择器
const openAvatarUpload = () => {
  avatarInput.value?.click()
}

// 容器点击：在预览打开时不触发文件选择
const onContainerClick = () => {
  if (previewVisible.value) return
  openAvatarUpload()
}

// 处理文件选择
const handleAvatarChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) return

  // 验证文件类型
  if (!file.type.startsWith('image/')) {
    ElMessage.error('请选择图片文件')
    return
  }

  // 验证文件大小
  const maxSizeBytes = props.maxSize * 1024 * 1024
  if (file.size > maxSizeBytes) {
    ElMessage.error(`图片大小不能超过${props.maxSize}MB`)
    return
  }
  selectedFile.value = file

  previewUrl.value = URL.createObjectURL(file)
  previewVisible.value = true
}

// 关闭预览
const closePreview = () => {
  previewVisible.value = false
  selectedFile.value = null
  previewUrl.value = ''
  if (avatarInput.value) {
    avatarInput.value.value = ''
  }
}

// 确认上传
const confirmUpload = async () => {
  if (!selectedFile.value) return

  uploading.value = true
  processing.value = true
  try {
    const response = await getUploadSignature()
    const md5 = await computeFileMd5(selectedFile.value)

    let formData = new FormData();
    formData.append("success_action_status", "200");
    formData.append("policy", response.data.policy);
    formData.append("x-oss-signature", response.data.signature);
    formData.append("x-oss-signature-version", "OSS4-HMAC-SHA256");
    formData.append("x-oss-credential", response.data.x_oss_credential);
    formData.append("x-oss-date", response.data.x_oss_date);
    formData.append("key", response.data.dir + 'avatar/' + md5);
    formData.append("x-oss-security-token", response.data.security_token);
    formData.append("callback", response.data.callback);
    formData.append("file", selectedFile.value);

    let res = await fetch(response.data.host, {
      method: "POST",
      body: formData
    });

    ElMessage.success('头像修改成功')
    emit('success',response.data.dir + md5)
    closePreview()
  } catch (error) {
    console.error('头像上传失败:', error)
    ElMessage.error('头像上传失败，请重试')
  } finally {
    uploading.value = false
    processing.value = false
  }
}
</script>

<style scoped>
.avatar-upload {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  cursor: pointer;
  border-radius: 50%;
  overflow: hidden;
  /* 避免尺寸变化导致鼠标移入/移出抖动 */
  transition: opacity 0.2s ease;
}

.avatar-upload.is-preview-open {
  cursor: default;
}

.avatar-upload:hover .avatar-overlay {
  opacity: 1;
}

.avatar-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s ease;
  border-radius: 50%;
  /* 防止覆盖层拦截鼠标事件造成hover状态抖动 */
  pointer-events: none;
}

.camera-icon {
  width: 24px;
  height: 24px;
  fill: white;
}

/* 弹窗样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  -webkit-app-region: no-drag;
}

.modal-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  max-width: 90vw;
  max-height: 90vh;
}

.modal-header {
  padding: 16px 20px;
  background: #f8fafc;
  border-bottom: 1px solid #eef3f7;
  font-weight: 600;
  color: #2c3e50;
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid #eef3f7;
}

.avatar-preview-modal {
  width: 400px;
}

.avatar-preview-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 20px 0;
}

.preview-avatar {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid #e1e8ed;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.preview-avatar.processing {
  animation: pulse 0.8s ease-in-out infinite;
}

.preview-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-info {
  text-align: center;
}

.preview-info p {
  margin: 4px 0;
  color: #2c3e50;
}

.file-info {
  font-size: 12px;
  color: #95a5a6;
  word-break: break-all;
}

.btn {
  -webkit-app-region: no-drag;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #d0dae5;
  background: #fff;
  color: #2c3e50;
  cursor: pointer;
}

.btn.primary {
  background: #409eff;
  color: #fff;
  border-color: #409eff;
}

.btn:hover {
  background: #f5f8fb;
}

.btn.primary:hover {
  background: #3a8ee6;
}

.btn[disabled] {
  opacity: 0.7;
  cursor: not-allowed;
}

.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: 8px;
  border: 2px solid #ffffff;
  border-top-color: rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  animation: spin .8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 执行动画条 */
.processing-bar {
  width: 140px;
  height: 4px;
  background: #e9eef5;
  border-radius: 999px;
  overflow: hidden;
}

.processing-bar .bar {
  width: 40%;
  height: 100%;
  background: linear-gradient(90deg, rgba(64, 158, 255, 0.2), #409eff, rgba(64, 158, 255, 0.2));
  animation: loading 1.2s ease-in-out infinite;
}

@keyframes loading {
  0% {
    transform: translateX(-100%);
  }

  50% {
    transform: translateX(20%);
  }

  100% {
    transform: translateX(200%);
  }
}

@keyframes pulse {
  0% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.03);
  }

  100% {
    transform: scale(1);
  }
}
</style>