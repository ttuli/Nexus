<template>
  <BoxReveal width="100%" :duration="0.5" :delay="0" style="margin-bottom: 0.5rem;" v-if="!autologin">
    <h2 class="title" style="margin: 0;">欢迎回来</h2>
  </BoxReveal>
  
  <BoxReveal width="100%" :duration="0.5" :delay="0.1" style="margin-bottom: 2.5rem;" v-if="!autologin">
    <p class="subtitle" style="margin: 0;">登录您的账号</p>
  </BoxReveal>

  <form class="login-form" @submit.prevent="handleLogin" v-if="!autologin">
    <BoxReveal width="100%" :duration="0.5" :delay="0.2" overflow="visible" style="z-index: 10;">
      <div class="input-group">
        <label>账号 <span class="required">*</span></label>
        <AccountSelector
          v-model="form.account"
          :options="accountOptions"
          placeholder="请输入账号"
          @keydown.enter.prevent="setPasswordInputFocus"
        >
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
            placeholder="请输入密码(至少8位)" @keydown.enter.prevent="handleLogin">
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
      <CusCheckBox v-model="form.rememberMe" label="记住密码" class="check-box"/>
    </BoxReveal>

    <BoxReveal width="100%" :duration="0.5" :delay="0.5" style="margin-top: 1rem;" overflow="visible">
      <CusButton html-type="submit" :loading="isLoading" :showIcon="false" class="submit-btn-new" style="margin-top: 0;">
        登录
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
              登录
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
import { signalWindowReady } from '@/src/utils/window'
import AccountSelector, { AccountOption } from './AccountSelector.vue';
import { toResourceUrl } from '@/src/utils/resourceUrl';
import { CacheOptionType } from '@shared/types/resourceCache.ts';
import defaultImg from '@/src/assets/avatar/default.png'

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

const setPasswordInputFocus = () => {
    passwordInput.value?.focus?.()
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
            }) || defaultImg,
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
@use "@/src/style/_constant.scss" as *;
@use "@/src/style/_mixins.scss" as *;

.title {
  font-size: 2.2rem;
  font-weight: 800;
  color: $color-text-title;
  margin: 0 0 0.5rem 0;
}

.subtitle {
  font-size: 0.95rem;
  color: $color-text-secondary;
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
    background: var(--surface-default, #fff);
    border-radius: 50%;
    box-shadow: var(--shadow-sm);

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
    color: $color-text-title;
  }

  .user-info {
    text-align: center;
    margin-bottom: 0.5rem;

    h3 {
      font-size: 1.5rem;
      font-weight: 800;
      color: $color-text-title;
      margin: 0 0 4px 0;
    }

    p {
      font-size: 0.95rem;
      color: $color-text-secondary;
      margin: 0;
    }
  }
}

.login-form {
  @include form-layout;

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    label {
      @include form-label;
    }

    .check-box {
      margin-left: 5px;
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
  }
}

.submit-btn-new, .auto-login-btn {
  @include primary-button;
  width: 100%;
  height: 3rem;
  // margin-top: 1rem;
}

.forgot-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 0.5rem;
  gap: 16px;

  .divider {
    color: $color-border-divider;
  }

  .forgot-btn {
    @include link-button;
    -webkit-app-region: no-drag;
    font-size: 0.95rem;
  }
}
</style>
