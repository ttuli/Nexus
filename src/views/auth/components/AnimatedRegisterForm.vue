<template>

  <div class="register-form">
    <!-- 昵称输入框 -->
    <BoxReveal width="100%" :duration="0.5" :delay="0.1">
      <div class="input-group">
        <label>名称 <span class="required">*</span></label>
        <CusInput v-model="form.nickname" placeholder="请输入昵称" @keydown.enter.prevent="focusPhoneInput">
          <template #left-area>
            <img :src="NameIcon" class="input-icon" />
          </template>
          <template #right-area>
            <span v-if="form.nickname" class="input-count">{{ form.nickname.length }}/20</span>
          </template>
        </CusInput>
      </div>
    </BoxReveal>

    <!-- 手机号输入框 -->
    <BoxReveal width="100%" :duration="0.5" :delay="0.2">
      <div class="input-group">
        <label>手机号 <span class="required">*</span></label>
        <CusInput ref="phoneInput" v-model="form.phone" placeholder="请输入手机号" @keydown.enter.prevent="focusCodeInput">
          <template #left-area>
            <img :src="PhoneIcon" class="input-icon" />
          </template>
          <template #right-area>
            <div class="phone-input-area">
              <button type="button" class="send-code-btn" @click="sendAuthCode" :disabled="codeCD !== 0 || isLoading">
                <span v-if="codeCD !== 0">({{ codeCD }}s)验证码已发送</span>
                <span v-else>发送验证码</span>
              </button>
            </div>
          </template>
        </CusInput>
      </div>
    </BoxReveal>

    <!-- 验证码输入框 -->
    <BoxReveal width="100%" :duration="0.5" :delay="0.3">
      <div class="input-group">
        <label>验证码 <span class="required">*</span></label>
        <CusInput ref="codeInput" v-model="form.code" placeholder="请输入验证码" @keydown.enter.prevent="focusPasswordInput">
          <template #left-area>
            <img :src="CodeIcon" class="input-icon" />
          </template>
        </CusInput>
      </div>
    </BoxReveal>

    <!-- 密码输入框 -->
    <BoxReveal width="100%" :duration="0.5" :delay="0.4">
      <div class="input-group relative-group">
        <label>密码 <span class="required">*</span></label>
        <CusInput ref="passwordInput" v-model="form.password" type="password" :visible="passwordVisible"
          placeholder="请输入密码 (至少8位)" @keydown.enter.prevent="focusConfirmPasswordInput" @focus="handlePasswordFocus"
          @blur="handlePasswordBlur">
          <template #left-area>
            <img :src="PasswordIcon" class="input-icon" />
          </template>
          <template #right-area>
            <button type="button" class="password-toggle" @click="passwordVisible = !passwordVisible"
              :aria-label="passwordVisible ? '隐藏密码' : '显示密码'">
              <img v-if="passwordVisible" :src="EyeOpenIcon" class="icon" />
              <img v-else :src="EyeClosedIcon" class="icon" />
            </button>
          </template>
        </CusInput>
        <CusInputHint :visible="passwordFocused" :targetRef="passwordInput">
          <p>密码要求：</p>
          <p>请输入至少 8 个字符，</p>
          可包含大小写字母、数字和特殊符号
          <PasswordStrenth :password="form.password" />
        </CusInputHint>
      </div>
    </BoxReveal>

    <!-- 确认密码输入框 -->
    <BoxReveal width="100%" :duration="0.5" :delay="0.5">
      <div class="input-group">
        <label>确认密码 <span class="required">*</span></label>
        <CusInput ref="confirmPasswordInput" v-model="form.confirmPassword" type="password"
          :visible="confirmPasswordVisible" placeholder="请再次输入密码" @keydown.enter.prevent="handleRegister">
          <template #left-area>
            <img :src="PasswordIcon" class="input-icon" />
          </template>
          <template #right-area>
            <span v-if="form.confirmPassword" :class="['status-icon', passwordMatch ? 'valid' : 'invalid']">
              <img v-if="passwordMatch" :src="CheckValidIcon" class="icon" />
              <img v-else :src="CheckInvalidIcon" class="icon" />
            </span>
          </template>
        </CusInput>
      </div>
    </BoxReveal>

    <!-- 同意协议复选框 -->
    <BoxReveal width="100%" :duration="0.5" :delay="0.6">
      <CusCheckBox v-model="form.agreeTerms" class="check-box">
        我已阅读并同意
        <button type="button" class="link-text" @click="showTerms" :disabled="isLoading">《用户服务协议》</button>
        和
        <button type="button" class="link-text" @click="showPrivacy" :disabled="isLoading">《隐私政策》</button>
      </CusCheckBox>
    </BoxReveal>

    <BoxReveal width="100%" :duration="0.5" :delay="0.7" style="margin-top: 1rem;" overflow="visible">
      <CusButton @click="handleRegister" :loading="isLoading" :showIcon="false">
        注 册
      </CusButton>
    </BoxReveal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, h, defineComponent } from 'vue'
import { ElMessage } from 'element-plus'
import { authService } from '@/src/services'
import BoxReveal from '@/src/components/BoxReveal.vue'
import CusInputHint from '@/src/components/CusInputHint.vue'
import PasswordStrenth from '@/src/components/PasswordStrenth.vue'

import NameIcon from '@/src/assets/input/input_name.svg?url'
import PhoneIcon from '@/src/assets/input/input_phone.svg?url'
import PasswordIcon from '@/src/assets/input/input_password.svg?url'
import EyeOpenIcon from '@/src/assets/input/eye_open.svg?url'
import EyeClosedIcon from '@/src/assets/input/eye_closed.svg?url'
import CheckValidIcon from '@/src/assets/input/check_valid.svg?url'
import CheckInvalidIcon from '@/src/assets/input/check_invalid.svg?url'
import CodeIcon from '@/src/assets/input/input_code.svg?url'
import CusDialog from '@/src/components/CusDialog/CusDialog'

const emit = defineEmits<{
  (e: 'switchView', view: 'login'): void
  (e: 'update:loading', value: boolean): void
}>()

interface RegisterForm {
  nickname: string
  phone: string
  code: string
  password: string
  confirmPassword: string
  agreeTerms: boolean
}

const CopyButtonComponent = defineComponent({
  props: { text: String },
  setup(props) {
    const copied = ref(false)
    return () => h('button', {
      type: 'button',
      class: 'custom-copy-btn',
      onClick: async () => {
        if (copied.value) return;
        try {
          await navigator.clipboard.writeText(props.text || '');
        } catch (e) {
          console.error('Clipboard error:', e);
        }
        copied.value = true;
        setTimeout(() => { copied.value = false }, 2000);
      }
    }, [
      copied.value
        ? h('svg', { key: 'check', viewBox: '0 0 24 24', width: '20', height: '20', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
          h('circle', { cx: '12', cy: '12', r: '10' }),
          h('polyline', { points: '16 8 10 14 8 12' })
        ])
        : h('svg', { key: 'copy', viewBox: '0 0 24 24', width: '20', height: '20', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
          h('rect', { x: '9', y: '9', width: '13', height: '13', rx: '2', ry: '2' }),
          h('path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' })
        ])
    ])
  }
})

const form = ref<RegisterForm>({
  nickname: '',
  phone: '',
  code: '',
  password: '',
  confirmPassword: '',
  agreeTerms: false,
})

const passwordVisible = ref(false)
const confirmPasswordVisible = ref(false)
const isLoading = ref(false)
const codeCD = ref(0)
const phoneInput = ref<any>()
const passwordInput = ref<any>()
const confirmPasswordInput = ref<any>()
const codeInput = ref<any>()

watch(isLoading, (val) => {
  emit('update:loading', val)
})

let finish = false

// 输入框聚焦状态
const passwordFocused = ref(false)

// 手机号状态
const phoneStatus = computed(() => {
  if (!form.value.phone) return null
  return /^1[3-9]\d{9}$/.test(form.value.phone) ? 'valid' : 'invalid'
})

// 密码是否匹配
const passwordMatch = computed(() => {
  return form.value.password === form.value.confirmPassword && form.value.password !== ''
})

// 是否可以注册
const canRegister = computed(() => {
  return (
    form.value.nickname.trim() !== '' &&
    phoneStatus.value === 'valid' &&
    form.value.password.length >= 8 &&
    passwordMatch.value &&
    form.value.agreeTerms
  )
})

// 聚焦事件
const focusPhoneInput = (): void => {
  phoneInput.value?.focus()
}

const focusCodeInput = (): void => {
  codeInput.value?.focus()
}

const focusPasswordInput = (): void => {
  passwordInput.value?.focus()
}

const focusConfirmPasswordInput = (): void => {
  confirmPasswordInput.value?.focus()
}

// 处理密码输入框聚焦/失焦事件
const handlePasswordFocus = () => {
  passwordFocused.value = true
}
const handlePasswordBlur = () => {
  passwordFocused.value = false
}

//验证码发送
const sendAuthCode = async () => {
  codeCD.value = 60
  if (phoneStatus.value !== 'valid') {
    ElMessage.error('请输入正确的手机号')
    codeCD.value = 0
    return
  }

  try {
    await authService.sendCode(form.value.phone)
    ElMessage.success('验证码发送成功')
    const timer = setInterval(() => {
      codeCD.value--
      if (codeCD.value === 0) {
        clearInterval(timer)
      }
    }, 1000)
  } catch (error) {
    codeCD.value = 0
  }
}

// 注册处理
const handleRegister = async (): Promise<void> => {
  if (finish) return
  if (!canRegister.value) {
    ElMessage.warning('请完成所有必填项')
    return
  }

  isLoading.value = true

  try {
    let res = await authService.register({
      phone: form.value.phone,
      name: form.value.nickname,
      password: form.value.password,
      auth_code: form.value.code
    })
    res.data.id

    finish = true

    // 使用自定义对话框
    await CusDialog.open({
      title: '注册成功',
      showCancel: false,
      confirmText: '去登录',
      content: () => h('div', { style: 'text-align: center;' }, [
        h('p', { style: 'margin-bottom: 12px; color: var(--color-text-secondary);' }, '请记住您的账号'),
        h('div', { style: 'display: flex; align-items: center; justify-content: center; gap: 8px;' }, [
          h('span', { style: 'font-weight: 600; font-size: 24px; color: var(--color-text-primary); letter-spacing: 1px;' }, String(res.data.id)),
          h(CopyButtonComponent, { text: String(res.data.id) })
        ])
      ]),
      status: 'success'
    })
    goToLogin();
  } catch (error) {
    console.error(error)
  } finally {
    isLoading.value = false
  }
}

// 返回登录
const goToLogin = (): void => {
  emit('switchView', 'login')
}

// 显示服务协议
const showTerms = (e: Event): void => {
  e.preventDefault()
  console.log('显示服务协议')
}

// 显示隐私政策
const showPrivacy = (e: Event): void => {
  e.preventDefault()
  console.log('显示隐私政策')
}

</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;
@use "@/src/style/_mixins.scss" as *;

.register-form {
  @include form-layout;
  gap: 8px; // Overriding form-layout gap

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    label {
      @include form-label;
    }

    &.relative-group {
      position: relative;
    }

    .input-icon {
      @include input-icon;
    }

    .password-toggle {
      @include icon-button(36px);

      .icon {
        width: 18px;
        height: 18px;
      }
    }

    .input-count {
      font-size: 12px;
      color: $color-text-placeholder;
      margin-right: 8px;
    }

    .status-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 8px;

      .icon {
        width: 18px;
        height: 18px;
      }
    }

    .phone-input-area {
      display: flex;
      align-items: center;
      width: 100%;
      height: 100%;

      .send-code-btn {
        height: 100%;
        padding: 0 10px;
        border: none;
        border-left: 1px solid $color-border-divider;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: $color-primary;
        color: #fff;
        font-size: 0.9rem;
        font-weight: 500;
        transition: background-color 0.3s ease;
        cursor: pointer;
        white-space: nowrap;

        &:disabled {
          color: $color-text-placeholder;
          background-color: var(--surface-subtle, #f8fafc);
          cursor: not-allowed;
        }

        &:hover:not(:disabled) {
          background-color: $color-primary-light;
        }
      }
    }
  }

  .check-box {
    margin-left: 5px;
    font-size: 0.9rem;
    color: $color-text-secondary;
  }

  .link-text {
    @include link-button;
    padding: 0;
    font-size: 0.9rem;
  }
}
</style>

<style lang="scss">
.custom-copy-btn {
  background: transparent;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
  border-radius: 50%;
  margin-left: 4px;

  &:hover {
    transform: scale(1.1);
    background-color: rgba(150, 150, 150, 0.15);
    color: var(--color-text-primary);
  }

  &:active {
    transform: scale(0.95);
    background-color: rgba(150, 150, 150, 0.25);
  }
}
</style>
