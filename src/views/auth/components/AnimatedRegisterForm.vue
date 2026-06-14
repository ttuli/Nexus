<template>
  <BoxReveal width="100%" :duration="0.5" :delay="0" style="margin-bottom: 2.5rem;">
    <h2 class="title" style="margin: 0;">创建账户</h2>
  </BoxReveal>

  <form @submit.prevent="handleRegister" class="register-form">
    <!-- 昵称输入框 -->
    <BoxReveal width="100%" :duration="0.5" :delay="0.1">
      <div class="input-group">
        <label>名称 <span class="required">*</span></label>
        <CusInput v-model="form.nickname" placeholder="请输入昵称" @submit="focusPhoneInput">
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
        <CusInput ref="phoneInput" v-model="form.phone" placeholder="请输入手机号" @submit="focusPasswordInput">
          <template #left-area>
            <img :src="PhoneIcon" class="input-icon" />
          </template>
          <template #right-area>
            <div class="phone-input-area">
              <span v-if="phoneStatus" :class="['status-icon', phoneStatus]">
                <img v-if="phoneStatus === 'valid'" :src="CheckValidIcon" class="icon" />
                <img v-else :src="CheckInvalidIcon" class="icon" />
              </span>
              <button type="button" class="send-code-btn" @click="sendAuthCode"
                  :disabled="codeCD !== 0 || isLoading">
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
        <CusInput ref="codeInput" v-model="form.code" placeholder="请输入验证码" @submit="focusPasswordInput">
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
            placeholder="请输入密码 (至少8位)" @submit="focusConfirmPasswordInput" @focus="handlePasswordFocus"
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
            :visible="confirmPasswordVisible" placeholder="请再次输入密码" @submit="handleRegister">
          <template #left-area>
            <img :src="PasswordIcon" class="input-icon" />
          </template>
          <template #right-area>
            <span v-if="form.confirmPassword"
                :class="['status-icon', passwordMatch ? 'valid' : 'invalid']">
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
        <button type="button" class="link-text" @click="showTerms">《用户服务协议》</button>
        和
        <button type="button" class="link-text" @click="showPrivacy">《隐私政策》</button>
      </CusCheckBox>
    </BoxReveal>

    <BoxReveal width="100%" :duration="0.5" :delay="0.7" style="margin-top: 1rem;" overflow="visible">
      <CusButton html-type="submit" :loading="isLoading" :showIcon="false" class="submit-btn-new" style="margin-top: 0;">
        注 册
      </CusButton>
    </BoxReveal>


  </form>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
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

const emit = defineEmits<{
    (e: 'switchView', view: 'login'): void
}>()

interface RegisterForm {
    nickname: string
    phone: string
    code: string
    password: string
    confirmPassword: string
    agreeTerms: boolean
}

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
        await authService.register({
            phone: form.value.phone,
            name: form.value.nickname,
            password: form.value.password,
            auth_code: form.value.code
        })

        finish = true
        ElMessage.success('注册成功！')
        setTimeout(() => {
            goToLogin()
        }, 1200)
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
.title {
  font-size: 2.2rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 0.5rem 0;
}

.register-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    label {
      font-size: 0.9rem;
      font-weight: 600;
      color: #1e293b;

      .required {
        color: #1890ff;
      }
    }

    &.relative-group {
        position: relative;
    }

    .input-icon {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      box-sizing: border-box;
      padding: 4px;
    }

    .password-toggle {
      background: none;
      border: none;
      cursor: pointer;
      padding: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #94a3b8;
      transition: color 0.3s ease;

      &:hover {
          color: #1890ff;
      }

      .icon {
          width: 18px;
          height: 18px;
      }
    }

    .input-count {
      font-size: 12px;
      color: #94a3b8;
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
      height: 100%;
      // background-color: #1890ff;

      .send-code-btn {
        // width: min-content;
        height: 100%;
        border: none;
        border-left: 1px solid #e5e7eb;
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        color: #1890ff;
        font-size: 0.9rem;
        font-weight: 500;
        transition: background-color 0.3s ease;
        cursor: pointer;
        white-space: nowrap;

        &:disabled {
            color: #94a3b8;
            cursor: not-allowed;
        }

        &:hover:not(:disabled) {
            background-color: #f8fafc;
        }
      }
    }
  }

  .check-box {
    margin-left: 5px;
    font-size: 0.9rem;
    color: #64748b;
  }

  .link-text {
    background: none;
    border: none;
    color: #1890ff;
    cursor: pointer;
    padding: 0;
    font-size: 0.9rem;
    font-weight: 500;

    &:hover {
        text-decoration: underline;
    }
  }

  .submit-btn-new {
    width: 100%;
    height: 3rem;
    background: linear-gradient(90deg, #40a9ff, #1890ff);
    color: #fff;
    border: none;
    border-radius: 0.5rem;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    justify-content: center;
    align-items: center;
    margin-top: 1rem;
    box-shadow: 0 4px 12px rgba(24, 144, 255, 0.2);

    &:hover {
      opacity: 0.9;
      box-shadow: 0 6px 16px rgba(24, 144, 255, 0.3);
    }
  }
}


</style>
