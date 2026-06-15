<template>
  <BoxReveal width="100%" :duration="0.5" :delay="0" style="margin-bottom: 0.5rem;" v-if="!autologin">
    <h2 class="title" style="margin: 0;">欢迎回来</h2>
  </BoxReveal>
  
  <BoxReveal width="100%" :duration="0.5" :delay="0.1" style="margin-bottom: 2.5rem;" v-if="!autologin">
    <p class="subtitle" style="margin: 0;">登录您的账号</p>
  </BoxReveal>

  <form class="login-form" @submit.prevent="handleLogin" v-if="!autologin">
    <BoxReveal width="100%" :duration="0.5" :delay="0.2">
      <div class="input-group">
        <label>账号 <span class="required">*</span></label>
        <AccountSelector v-model="form.account" :options="accountOptions" placeholder="请输入账号"
            @change="handleAccountChange" @keydown.enter.prevent="setPasswordInputFocus">
            <template #left-area>
                <img :src="AccountIcon" class="input-icon" />
            </template>
        </AccountSelector>
      </div>
    </BoxReveal>

    <BoxReveal width="100%" :duration="0.5" :delay="0.3">
      <div class="input-group">
        <label>密码 <span class="required">*</span></label>
        <CusInput ref="passwordInput" v-model="form.password" type="password" :visible="passwordVisible"
            placeholder="请输入密码" @keydown.enter.prevent="handleLogin">
            <template #left-area>
                <img :src="PasswordIcon" class="input-icon" />
            </template>
            <template #right-area>
                <button type="button" class="password-toggle" @click="passwordVisible = !passwordVisible"
                    :aria-label="passwordVisible ? '隐藏密码' : '显示密码'">
                    <img v-show="passwordVisible" :src="EyeOpenIcon" class="icon" />
                    <img v-show="!passwordVisible" :src="EyeClosedIcon" class="icon" />
                </button>
            </template>
        </CusInput>
      </div>
    </BoxReveal>

    <BoxReveal width="100%" :duration="0.5" :delay="0.4">
      <CusCheckBox v-model="form.rememberMe" label="记住我" class="check-box"/>
    </BoxReveal>

    <BoxReveal width="100%" :duration="0.5" :delay="0.5" style="margin-top: 1rem;" overflow="visible">
      <CusButton html-type="submit" :loading="isLoading" :showIcon="false" class="submit-btn-new" style="margin-top: 0;">
        登 录
      </CusButton>
    </BoxReveal>

    <BoxReveal width="100%" :duration="0.5" :delay="0.6" style="margin-top: 0.5rem;">
      <div class="forgot-wrapper" style="margin-top: 0;">
        <button class="forgot-btn" type="button" @click="goToRegister" :disabled="isLoading">注册账户</button>
      </div>
    </BoxReveal>
  </form>

  <div class="auto-login-panel" v-else>
      <BoxReveal :duration="0.5" :delay="0" overflow="visible">
          <div class="avatar-wrapper">
              <img :src="autoLoginInfo?.avatar" class="avatar" alt="User Avatar"
                  @error="error => console.log(error)" />
          </div>
      </BoxReveal>
      
      <BoxReveal :duration="0.5" :delay="0.1" style="margin-top: -10px;">
          <span class="name" style="margin-top: 0;">{{ autoLoginInfo?.name }}</span>
      </BoxReveal>

      <BoxReveal :duration="0.5" :delay="0.2" style="margin-bottom: 0.5rem;">
          <div class="user-info" style="margin-bottom: 0;">
              <h3>欢迎回来</h3>
              <p>点击下方按钮登录</p>
          </div>
      </BoxReveal>

      <BoxReveal width="100%" :duration="0.5" :delay="0.3" style="margin-top: 1rem;" overflow="visible">
          <CusButton class="auto-login-btn submit-btn-new" :loading="isLoading" :showIcon="false" @click="handleAutoLogin" style="margin-top: 0;">
              登 录
          </CusButton>
      </BoxReveal>

      <BoxReveal :duration="0.5" :delay="0.4" style="margin-top: 0.5rem;">
          <div class="forgot-wrapper" style="margin-top: 0;">
              <button type="button" class="forgot-btn switch-account-btn" @click="autologin = !autologin" :disabled="isLoading">切换账号</button>
          </div>
      </BoxReveal>
  </div>
</template>

<script setup lang="ts">
import BoxReveal from '@/src/components/BoxReveal.vue';
import { nextTick, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { windowService, authService, userService, tokenService } from '@/src/services'
import AccountIcon from '@/src/assets/input/input_name.svg?url'
import PasswordIcon from '@/src/assets/input/input_password.svg?url'
import EyeOpenIcon from '@/src/assets/input/eye_open.svg?url'
import EyeClosedIcon from '@/src/assets/input/eye_closed.svg?url'
import { signalWindowReady } from '@/src/utils/windowReady'
import AccountSelector, { AccountOption } from './AccountSelector.vue';
import { toResourceUrl } from '@/src/utils/chat.ts'
import { CacheOptionType } from '@/src/types/resourceCache.ts';

const emit = defineEmits<{
    (e: 'switchView', view: 'register'): void
    (e: 'update:loading', value: boolean): void
}>()

interface LoginForm {
    account: string
    password: string
    rememberMe: boolean
}
interface AutoLoginInfo {
    avatar: string
    name: string
}
const form = ref<LoginForm>({
    account: '',
    password: '',
    rememberMe: false
})

const passwordVisible = ref(false)
const isLoading = ref(false)
const passwordInput = ref<HTMLInputElement>()
const autologin = ref(false)
const autoLoginInfo = ref<AutoLoginInfo | null>(null)
const accountOptions = ref<AccountOption[]>([])

watch(isLoading, (val) => {
    emit('update:loading', val)
})

const handleAccountChange = (_val: string) => {
    // Optional: Auto-fill password if remembered?
}

const setPasswordInputFocus = () => {
    passwordInput.value?.focus()
}

// 登录处理
const handleLogin = async () => {
    if (isLoading.value) {
        return
    }
    isLoading.value = true
    if (!form.value.account || !form.value.password) {
        ElMessage.error("请输入账号和密码")
        isLoading.value = false
        return
    }

    if (!/^\d{10}$/.test(form.value.account)) {
        ElMessage.error('请输入有效的账号')
        isLoading.value = false
        return
    }

    try {
        const res = await authService.login(form.value.account, form.value.password, form.value.rememberMe)
        if (res.success) {
            windowService.createWindow('home')
            window.close()
        } else {
            ElMessage.error(res.error || '登录失败')
        }
    } catch (error) {
        ElMessage.error('登录失败')
    } finally {
        isLoading.value = false
    }
}

const handleAutoLogin = async () => {
    if (isLoading.value) {
        return
    }
    isLoading.value = true
    try {
        const res = await tokenService.requestTokenRefresh()
        if (res.success === true) {
            windowService.createWindow('home')
            window.close()
        } else {
            ElMessage.error("登录失败")
            autologin.value = false
        }
    } catch (error) {
        ElMessage.error("登录失败")
        autologin.value = false
    } finally {
        isLoading.value = false
    }
}

// 注册账户
const goToRegister = (): void => {
    if (isLoading.value) {
        return
    }
    emit('switchView', 'register')
}

onMounted(async () => {
    autologin.value = await tokenService.ableToAutoLogin()
    let history = await userService.getLoginHistory()

    accountOptions.value = history.map((item) => ({
        account: item.account || item.userId?.toString() || '',
        name: item.name,
        avatar: toResourceUrl(item.avatarUrl || '',{
            cacheType:CacheOptionType.AVATAR
        })
    }));

    // Default select first account if available and not empty
    if (accountOptions.value.length > 0 && !form.value.account) {
        form.value.account = accountOptions.value[0].account;
    }

    if (history.length > 0 && autologin.value) {
        autoLoginInfo.value = {
            avatar: toResourceUrl(history[0].avatarUrl || '',{
                cacheType:CacheOptionType.AVATAR
            }),
            name: history[0].name
        }
    }
    nextTick(() => {
        setTimeout(() => {
            signalWindowReady();
        }, 100);
    })
})
</script>

<style scoped lang="scss">
.title {
  font-size: 2.2rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 0.5rem 0;
}

.subtitle {
  font-size: 0.95rem;
  color: #64748b;
  margin: 0 0 2.5rem 0;
}

.auto-login-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1rem 0;
  gap: 1.5rem;
  width: 100%;

  .avatar-wrapper {
    padding: 4px;
    background: #fff;
    border-radius: 50%;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);

    .avatar {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      object-fit: cover;
      display: block;
    }
  }

  .name {
    margin-top: -10px;
    font-weight: 600;
    font-size: 1.2rem;
    color: #0f172a;
  }

  .user-info {
    text-align: center;
    margin-bottom: 0.5rem;

    h3 {
      font-size: 1.5rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 4px 0;
    }

    p {
      font-size: 0.95rem;
      color: #64748b;
      margin: 0;
    }
  }
}

.login-form {
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

    .check-box {
      margin-left: 5px;
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
  }
}

.submit-btn-new, .auto-login-btn {
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

.forgot-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 0.5rem;
  gap: 16px;

  .divider {
    color: #e5e7eb;
  }

  .forgot-btn {
    background: none;
    border: none;
    color: #1890ff;
    font-size: 0.95rem;
    font-weight: 500;
    cursor: pointer;
    -webkit-app-region: no-drag;

    &:not(:disabled):hover {
      text-decoration: underline;
    }

    &:disabled {
      color: #94a3b8;
      cursor: not-allowed;
    }
  }
}
</style>
