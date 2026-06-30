<template>
    <div class="login-container">
        <TitleBar :onClose="closeLogic" class="title-bar" />
        <div class="logo-container">
            <Logo />
        </div>
        <div class="login-panel" v-if="!autologin">
            <!-- 欢迎文字 -->
            <div class="welcome-text">
                <h2>欢迎回来</h2>
                <p>登录你的账户继续聊天</p>
            </div>

            <!-- 登录表单 -->
            <form @submit.prevent="handleLogin" class="login-form">
                <!-- 手机号输入框 -->
                <!-- 账号输入框 (下拉选择) -->
                <AccountSelector v-model="form.account" :options="accountOptions" placeholder="请输入账号"
                    @change="handleAccountChange" @keydown.enter.prevent="setPasswordInputFocus">
                    <template #left-area>
                        <img :src="AccountIcon" class="input-icon" />
                    </template>
                </AccountSelector>
                <!-- 密码输入框 -->
                <CusInput ref="passwordInput" v-model="form.password" type="password" :visible="passwordVisible"
                    placeholder="请输入密码" @keydown.enter.prevent="handleLogin">
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

                <!-- 复选框区域 -->
                <CusCheckBox v-model="form.rememberMe" label="记住我" class="check-box"/>

                <!-- 登录按钮 -->
                <CusButton html-type="submit" :loading="isLoading" :showIcon="false">
                    登录
                </CusButton>
            </form>

            <!-- 底部链接 -->
            <div class="footer-links">
                <button type="button" class="link-btn" @click="goToForgotPassword">忘记密码?</button>
                <span class="divider">|</span>
                <button type="button" class="link-btn" @click="goToRegister">注册账户</button>
            </div>
        </div>
        <div class="auto-login-panel" v-else>
            <div class="avatar-wrapper">
                <img :src="autoLoginInfo?.avatar" class="avatar" alt="User Avatar"
                    @error="error => console.log(error)" />
            </div>
            <span class="name">{{ autoLoginInfo?.name }}</span>
            <!-- <span class="spacer"></span> -->
            <div class="user-info">
                <h3>欢迎回来</h3>
                <p>点击下方按钮登录</p>
            </div>
            <CusButton class="auto-login-btn" :loading="isLoading" :showIcon="false" @click="handleAutoLogin">
                登录
            </CusButton>
            <button type="button" class="switch-account-btn" @click="autologin = !autologin">切换账号</button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { windowService, authService, userService, tokenService } from '@/src/services'
import AccountIcon from '@/src/assets/input/input_name.svg?url'
import PasswordIcon from '@/src/assets/input/input_password.svg?url'
import EyeOpenIcon from '@/src/assets/input/eye_open.svg?url'
import EyeClosedIcon from '@/src/assets/input/eye_closed.svg?url'
import { signalWindowReady } from '@/src/utils/windowReady'
import AccountSelector, { AccountOption } from './components/AccountSelector.vue';
import { toResourceUrl } from '@/src/utils/resourceUrl';
import { CacheOptionType } from '@/src/types/resourceCache.ts'

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

const handleAccountChange = (_val: string) => {
    // Optional: Auto-fill password if remembered? (Not implemented here, but typically desired)
}

const closeLogic = () => {
    windowService.quit()
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

// 忘记密码
const goToForgotPassword = (): void => {
}

// 注册账户
const goToRegister = (): void => {
    if (isLoading.value) {
        return
    }
    windowService.createWindow('register')
}

onMounted(async () => {
    autologin.value = await tokenService.ableToAutoLogin()
    let history = await userService.getLoginHistory()

    accountOptions.value = history.map((item) => ({
        account: item.account || item.userId?.toString() || '',
        name: item.name,
        avatar: toResourceUrl(item.avatarUrl || '', { cacheType: CacheOptionType.AVATAR })
    }));

    // Default select first account if available and not empty
    if (accountOptions.value.length > 0 && !form.value.account) {
        form.value.account = accountOptions.value[0].account;
    }

    if (history.length > 0 && autologin.value) {
        autoLoginInfo.value = {
            avatar: toResourceUrl(history[0].avatarUrl || '', { cacheType: CacheOptionType.AVATAR }),
            name: history[0].name
        }
    }
    nextTick(() => {
        signalWindowReady()
    })
})
</script>

<style scoped lang="scss">
.login-container {
    width: 100%;
    height: 100%;
    display: flex;
    background: $bg-auth;
    font-family: $font-family-base;
    flex-direction: column;

    .title-bar {
        position: fixed;
        z-index: 1000;
        top: 0;
    }

    .logo-container {
        width: 100%;
        height: 120px;
        background-color: $bg-card;
        display: flex;
        justify-content: center;
        box-sizing: border-box;
        align-items: center;
        border-bottom-right-radius: 16px;
        border-bottom-left-radius: 16px;
    }

    // 公共样式
    .link-btn {
        -webkit-app-region: no-drag;
        background: none;
        border: none;
        color: $color-primary;
        font-size: $font-size-sm;
        cursor: pointer;
        transition: all $transition-base;
        font-weight: $font-weight-medium;
        padding: 0;
        line-height: $line-height-normal;

        &:hover {
            color: $color-primary-dark;
            text-decoration: underline;
        }
    }

    .login-panel {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: $spacing-lg $spacing-xl;
        gap: 8px;

        .welcome-text {
            text-align: center;
            margin-bottom: $spacing-lg;

            h2 {
                font-size: $font-size-2xl;
                font-weight: $font-weight-semibold;
                color: $color-text-primary;
                margin: 0 0 $spacing-xs 0;
                line-height: $line-height-tight;
            }

            p {
                font-size: $font-size-base;
                color: $color-text-secondary;
                margin: 0;
                line-height: $line-height-normal;
            }
        }

        .login-form {
            display: flex;
            flex-direction: column;
            gap: 24px;
            width: 100%;

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
                color: $color-text-placeholder;
                transition: color 0.3s ease;

                &:hover {
                    color: $color-primary;
                }

                .icon {
                    width: 18px;
                    height: 18px;
                }
            }
        }

        .footer-links {
            position: fixed;
            bottom: 10px;
            text-align: center;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 16px;

            .divider {
                color: $color-border;
            }
        }
    }

    .auto-login-panel {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: $spacing-lg;
        gap: 24px;
        width: 100%;
        box-sizing: border-box;

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
            // padding-top: -5px;
            margin-top: -5px;
            padding-bottom: 30px;
        }

        .spacer {
            height: 40px;
        }

        .user-info {
            text-align: center;

            h3 {
                font-size: 18px;
                font-weight: 600;
                color: $color-text-primary;
                margin: 0 0 4px 0;
            }

            p {
                font-size: 14px;
                color: $color-text-secondary;
                margin: 0;
            }
        }

        .auto-login-btn {
            width: 100%;
            max-width: 200px;
        }

        .switch-account-btn {
            @extend .link-btn;
            font-size: 14px;
            margin-top: 8px;
        }
    }
}

// 动画
@keyframes pulse {

    0%,
    100% {
        opacity: 0.4;
    }

    50% {
        opacity: 1;
    }
}
</style>