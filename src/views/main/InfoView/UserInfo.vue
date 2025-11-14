<template>
  <div class="user-info">
    <div class="hero">
      <div class="avatar-center">
        <AvatarUpload :avatar-url="store.avatar || info.avatar" @success="handleAvatarSuccess" />
      </div>
      <div class="basic-centered">
        <div class="name">{{ store.userName || info.user_name || '未命名用户' }}</div>
        <div class="uid">
          ID：{{ store.userId || info.user_id }}
          <button class="icon-btn" title="复制ID"
            @click="copyToClipboard(store.userId || (info.user_id?.toString() || ''))">
            <svg viewBox="0 0 24 24">
              <path
                d="M16 1H4c-1.1 0-2 .9-2 2v12h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
            </svg>
          </button>
        </div>
        <div class="signature-line" v-if="info.personal_signature" :title="info.personal_signature">
          {{ info.personal_signature }}
        </div>
        <button class="edit-btn" @click="openEdit">编辑信息</button>
      </div>
    </div>

    <div class="details">
      <div class="row">
        <span class="icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v2h20v-2c0-3.33-6.67-5-10-5z" />
          </svg>
        </span>
        <span class="label">性别</span>
        <span class="chip" :class="genderClass(info.gender)">{{ genderText(info.gender) }}</span>
      </div>
      <div class="row">
        <span class="icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              d="M6.62 10.79a15.053 15.053 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.25c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V21a1 1 0 0 1-1 1C10.07 22 2 13.93 2 3a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2z" />
          </svg>
        </span>
        <span class="label">手机号</span>
        <span class="chip phone">{{ store.phone || info.phone || '未绑定' }}</span>
        <button class="icon-btn" title="复制手机号" @click="copyToClipboard(store.phone || info.phone || '')">
          <svg viewBox="0 0 24 24">
            <path
              d="M16 1H4c-1.1 0-2 .9-2 2v12h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
          </svg>
        </button>
      </div>
      <div class="row">
        <span class="icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.67 0-8 1.34-8 4v2h14v-2c0-2.66-5.33-4-8-4zm8 0c-.33 0-.68.02-1.03.06 2.52.38 5.03 1.47 5.03 3.94V19h6v-2c0-2.66-5.33-4-8-4z" />
          </svg>
        </span>
        <span class="label">加入类型</span>
        <span class="value">{{ joinTypeText(info.join_type) }}</span>
      </div>

    </div>

    <div v-if="editVisible" class="modal-overlay" @click.self="closeEdit">
      <div class="modal-card">
        <div class="modal-header">编辑信息</div>
        <div class="modal-body">
          <div class="form-item">
            <label>昵称</label>
            <input v-model="editForm.name" type="text" maxlength="20" placeholder="输入昵称" :disabled="saving" />
          </div>
          <div class="form-item">
            <label>性别</label>
            <select v-model.number="editForm.sex" :disabled="saving">
              <option :value="1">男</option>
              <option :value="2">女</option>
            </select>
          </div>
          <div class="form-item">
            <label>加入类型</label>
            <select v-model.number="editForm.joinType" :disabled="saving">
              <option :value="1">直接加入</option>
              <option :value="2">同意后加好友</option>
            </select>
          </div>
          <div class="form-item">
            <label>个性签名</label>
            <textarea v-model="editForm.personalSignature" maxlength="80" placeholder="填写你的个性签名" rows="3"
              :disabled="saving"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" @click="closeEdit" :disabled="saving">取消</button>
          <button class="btn primary" :disabled="saving" @click="saveEdit">
            <span class="spinner" v-if="saving"></span>
            <span>{{ saving ? '保存中…' : '保存' }}</span>
          </button>
        </div>
      </div>
    </div>


  </div>
  <TitleBar />
</template>

<script setup lang="ts">
import { computed, ref, reactive } from 'vue'
import { getUserInfo } from '@/apis/user'
import AvatarUpload from '@/components/AvatarUpload.vue'
import TitleBar from '@/components/TitleBar.vue'
import { useUserStore } from '@/store/user'
import type { UserInfo } from '@/models/user'
import { ElMessage } from 'element-plus'
import { updateUserInfo } from '@/apis/user'
import { updateAllInfo } from '@/utils/window'

const store = useUserStore()
const info = computed<UserInfo>(() => store.userInfo || ({} as UserInfo))

const genderText = (g: number | undefined) => {
  if (g === 1) return '男'
  if (g === 2) return '女'
  return '未知'
}
const joinTypeText = (t: number | undefined) => {
  console.log(t)
  if (t === 1) return '直接加入'
  if (t === 2) return '同意后加好友'
  return '未知'
}

const genderClass = (g: number | undefined) => {
  if (g === 1) return 'male'
  if (g === 2) return 'female'
  return 'unknown'
}

const copyToClipboard = async (text: string) => {
  if (!text) return
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    ElMessage.success('复制成功')
  } catch (e) {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } finally { document.body.removeChild(ta) }
  }
}

// 编辑信息弹窗
const editVisible = ref(false)
const saving = ref(false)
const editForm = reactive<{ name: string; sex: number; joinType: number; personalSignature: string }>({
  name: '',
  sex: 0,
  joinType: 0,
  personalSignature: ''
})
const openEdit = () => {
  editForm.name = store.userName || info.value.user_name || ''
  editForm.sex = (info.value.gender ?? 0) as number
  editForm.joinType = (info.value.join_type ?? 0) as number
  editForm.personalSignature = info.value.personal_signature || ''
  editVisible.value = true
}
const closeEdit = () => { editVisible.value = false }

// 头像上传成功处理
const handleAvatarSuccess = async (url:string) => {
  // 更新用户信息中的头像
  let res = await getUserInfo([])
  res = res.data
  if (Array.isArray(res.data) && res.data.length > 0) {
    store.setUserInfo({
      user_id: BigInt(res.data[0].user_id),
      avatar: (res.data[0].avatar === '' || res.data[0].avatar === undefined) ? '@/assets/default.png' : res.data[0].avatar,
      user_name: res.data[0].user_name,
      phone: res.data[0].phone,
      gender: res.data[0].gender,
      personal_signature: res.data[0].personal_signature,
      join_type: res.data[0].join_type,
    })
  }

  // 通知主窗口更新用户信息
  updateAllInfo()
}

const saveEdit = async () => {
  if (!editForm.name.trim()) {
    ElMessage.error('请输入昵称')
    return
  }
  const newInfo: UserInfo = {
    ...info.value,
    user_name: editForm.name.trim(),
    gender: editForm.sex,
    join_type: editForm.joinType,
    personal_signature: editForm.personalSignature.trim()
  }

  saving.value = true
  try {
    await updateUserInfo({
      id: 0,
      user_name: newInfo.user_name,
      gender: newInfo.gender,
      join_type: newInfo.join_type,
      personal_signature: newInfo.personal_signature
    })

    store.setUserInfo(newInfo)
    ElMessage.success('保存成功')
    // 通知主窗口更新所有信息
    updateAllInfo()
    editVisible.value = false
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.hero {
  position: relative;
  height: 270px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: 8px;
  background:
    linear-gradient(135deg, #eaf4ff 0%, #ffffff 100%),
    radial-gradient(60px at 20% 30%, rgba(52, 152, 219, 0.12), transparent 70%),
    radial-gradient(80px at 80% 20%, rgba(46, 204, 113, 0.10), transparent 70%),
    radial-gradient(70px at 30% 80%, rgba(241, 196, 15, 0.12), transparent 70%);
  border-bottom: 1px solid #e1e8ed;
}

.avatar-center {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100px;
  height: 100px;
}

.basic-centered {
  text-align: center;
  margin-top: 8px;
}

.basic-centered .name {
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
}

.basic-centered .uid {
  margin-top: 4px;
  font-size: 13px;
  color: #95a5a6;
}

.basic-centered .signature-line {
  margin-top: 6px;
  font-size: 13px;
  color: #6c757d;
  max-width: 80%;
  margin-left: auto;
  margin-right: auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.details {
  margin-top: 12px;
  padding: 16px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e9eef3;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.row .icon {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.row .icon svg {
  width: 18px;
  height: 18px;
  fill: #95a5a6;
}

.row .label {
  width: 80px;
  font-size: 13px;
  color: #6c757d;
}

.row .value {
  font-size: 14px;
  color: #2c3e50;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 9999px;
  background: #f1f5f9;
  color: #2c3e50;
}

.chip svg {
  width: 16px;
  height: 16px;
  fill: currentColor;
  opacity: .8;
}

.chip.male {
  background: #e8f2ff;
  color: #1b6fd3;
}

.chip.female {
  background: #ffeaf2;
  color: #d81b60;
}

.chip.unknown {
  background: #edf2f7;
  color: #6c757d;
}

.chip.phone {
  background: #e8f6ef;
  color: #27ae60;
}

.icon-btn {
  -webkit-app-region: no-drag;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  margin-left: 6px;
}

.icon-btn svg {
  width: 16px;
  height: 16px;
  fill: #95a5a6;
}

.icon-btn:hover {
  background: #eef3f7;
}

.icon-btn:hover svg {
  fill: #2c3e50;
}

.signature .value.one-line {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.edit-btn {
  -webkit-app-region: no-drag;
  margin-top: 10px;
  padding: 6px 12px;
  font-size: 13px;
  border-radius: 6px;
  border: 1px solid #d0dae5;
  background: #ffffff;
  color: #2c3e50;
  cursor: pointer;
}

.edit-btn:hover {
  background: #f5f8fb;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-card {
  width: 420px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
  border: 1px solid #e9eef3;
}

.modal-header {
  padding: 12px 16px;
  font-weight: 600;
  border-bottom: 1px solid #eef3f7;
}

.modal-body {
  padding: 14px 16px;
}

.form-item {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  -webkit-app-region: no-drag;
}

.form-item label {
  width: 80px;
  color: #6c757d;
  font-size: 13px;
}

.form-item input,
.form-item select {
  flex: 1;
  height: 32px;
  padding: 6px 10px;
  border: 1px solid #d0dae5;
  border-radius: 6px;
  outline: none;
}

.form-item textarea {
  flex: 1;
  min-height: 70px;
  padding: 8px 10px;
  border: 1px solid #d0dae5;
  border-radius: 6px;
  outline: none;
  resize: none;
}

.form-item input:focus,
.form-item select:focus {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.15);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid #eef3f7;
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
</style>