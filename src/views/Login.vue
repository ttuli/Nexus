<template>
    <div class="login-container">
        <TitleBar :onClose="closeLogic" />
        <div class="login-panel">
            <!-- 顶部Logo区域 -->
            <div class="logo-area">
                <div class="logo-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                </div>
                <h1 class="logo-text">ChatHub</h1>
            </div>

            <!-- 欢迎文字 -->
            <div class="welcome-text">
                <h2>欢迎回来</h2>
                <p>登录你的账户继续聊天</p>
            </div>

            <!-- 登录表单 -->
            <form @submit.prevent="handleSubmit" class="login-form">
                <!-- 手机号输入框 -->
                <div class="form-group" v-if="showPasswordLogin || !autoLoginReady">
                    <label for="phone">手机号</label>
                    <div class="input-wrapper">
                        <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path
                                d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z">
                            </path>
                        </svg>
                        <input ref="phoneInput" v-model="form.phone" type="text" id="phone" placeholder="请输入手机号"
                            @keydown.enter.prevent="handlePhoneEnter" maxlength="11" />
                    </div>
                </div>

                <!-- 密码输入框 -->
                <div class="form-group" v-if="showPasswordLogin || !autoLoginReady">
                    <label for="password">密码</label>
                    <div class="input-wrapper">
                        <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                        <input ref="passwordInput" v-model="form.password" :type="passwordVisible ? 'text' : 'password'"
                            id="password" placeholder="请输入密码" @keydown.enter.prevent="handleLogin" />
                        <button type="button" class="password-toggle" @click="passwordVisible = !passwordVisible"
                            :aria-label="passwordVisible ? '隐藏密码' : '显示密码'">
                            <svg v-if="passwordVisible" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path
                                    d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24">
                                </path>
                                <line x1="1" y1="1" x2="23" y2="23"></line>
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- 自动登录 -->
                <div class="checkbox-group" v-if="!autoLoginReady || showPasswordLogin">
                    <label class="checkbox-item">
                        <input v-model="form.autoLogin" type="checkbox" />
                        <span class="checkbox-custom"></span>
                        <span class="checkbox-label">自动登录</span>
                    </label>
                </div>

                <div v-if="autoLoginReady && !showPasswordLogin" class="auto-login-tip">
                    <div class="tip-text">
                        <svg class="tip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12" y2="8"></line>
                        </svg>
                        <span>检测到可自动登录</span>
                    </div>
                    <button type="button" class="switch-btn" @click="switchToPasswordLogin">密码登录</button>
                </div>

                <!-- 登录按钮 -->
                <button type="submit" class="login-btn" :disabled="isLoading">
                    <span v-if="!isLoading">登录</span>
                    <span v-else class="loading-spinner">
                        <span></span>
                        <span></span>
                        <span></span>
                    </span>
                </button>
            </form>

            <!-- 底部链接 -->
            <div class="footer-links">
                <button type="button" class="link-btn" @click="goToForgotPassword">忘记密码?</button>
                <span class="divider">|</span>
                <button type="button" class="link-btn" @click="goToRegister">注册账户</button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import TitleBar from '@/components/TitleBar.vue'
import { login } from '@/apis/user'
import { ElMessage } from 'element-plus'
import { getRefreshToken, saveRefreshToken } from '@/utils/keytar'
import { onMounted } from 'vue'
import { resourceManager } from '@/utils/resourceManager'

interface LoginForm {
    phone: string
    password: string
    autoLogin: boolean
}

const form = ref<LoginForm>({
    phone: '',
    password: '',
    autoLogin: false,
})

const passwordVisible = ref(false)
const isLoading = ref(false)
const phoneInput = ref<HTMLInputElement>()
const passwordInput = ref<HTMLInputElement>()
const autoLoginReady = ref(false)
const showPasswordLogin = ref(false)
const savedRefreshToken = ref<string | null>(null)

const closeLogic = () => {
    window.ipcRenderer.send('quit')
}

// 手机号输入框回车事件
const handlePhoneEnter = (): void => {
    passwordInput.value?.focus()
}

// 登录处理
const handleLogin = async () => {
    if (!form.value.phone || !form.value.password) {
        ElMessage.error("请输入手机号和密码")
        return
    }

    if (!/^1[3-9]\d{9}$/.test(form.value.phone)) {
        ElMessage.error('请输入有效的手机号')
        return
    }

    isLoading.value = true
    // if ()
    try {
        const res = await login({ phone: form.value.phone, password: form.value.password })
        if (form.value.autoLogin) {
            await saveRefreshToken(res.data.refreshToken)
        } else {
            await saveRefreshToken('')
        }
        await resourceManager.updateRefreshToken(res.data.refreshToken)
        await resourceManager.updateToken(res.data.token)
        window.ipcRenderer.send('window:new-window', {
            key: 'home',
        })
        window.close()
    } finally {
        isLoading.value = false
    }
}

const handleAutoLogin = async () => {
    if (!autoLoginReady.value || !savedRefreshToken.value) {
        showPasswordLogin.value = true
        return
    }
    // try {
    //     isLoading.value = true
    //     useUserStore().setToken(await getRefreshToken() || '')
    //     let res = await loginR()
    //     window.ipcRenderer.send('window:new-window', {
    //         key: 'home',
    //         data: {
    //             token: res.data.token,
    //             refreshToken: savedRefreshToken.value
    //         }
    //     })
    //     window.close()
    // } catch (error) {
    //     ElMessage.error('自动登录失败')
    //     form.value.password = ''
    //     showPasswordLogin.value = true
    //     autoLoginReady.value = false
    // } finally {
    //     isLoading.value = false
    // }
}

const handleSubmit = async () => {
    if (autoLoginReady.value && !showPasswordLogin.value) {
        await handleAutoLogin()
    } else {
        await handleLogin()
    }
}

const switchToPasswordLogin = () => {
    showPasswordLogin.value = true
}

// 忘记密码
const goToForgotPassword = (): void => {
    console.log('跳转到忘记密码页面')
}

// 注册账户
const goToRegister = (): void => {
    if (isLoading.value) {
        return
    }
    window.ipcRenderer.send('window:new-window', {
        key: 'register'
    })
}
//
onMounted(async () => {
    const rToken = await getRefreshToken()
    if (rToken) {
        savedRefreshToken.value = rToken
        autoLoginReady.value = true
        showPasswordLogin.value = false
    } else {
        autoLoginReady.value = false
        showPasswordLogin.value = true
    }
})
</script>

<style scoped lang="scss">
.login-container {
    display: flex;
    background: $gradient-primary;
    font-family: $font-family-base;
    flex-direction: column;

    .login-panel {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        padding: $spacing-lg $spacing-xl;
        background: rgba($color-bg-primary, 0.95);
        backdrop-filter: blur(10px);
    }
}

.logo-area {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
    margin-top: $spacing-md;
    margin-bottom: $spacing-3xl;

    .logo-icon {
        width: $size-icon-xl;
        height: $size-icon-xl;
        background: $gradient-primary;
        border-radius: $radius-xl;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;

        svg {
            width: $size-icon-lg;
            height: $size-icon-lg;
        }
    }

    .logo-text {
        font-size: $font-size-3xl;
        font-weight: $font-weight-bold;
        background: $gradient-primary;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        margin: 0;
        line-height: $line-height-tight;
    }
}

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
    width: 100%;
    max-width: 360px;
}

.auto-login-tip {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: $spacing-3xl 0 $spacing-md 0; // 从 180px 改为 64px
    padding: $spacing-sm $spacing-sm + 2px;
    background: $color-bg-tertiary;
    border: 1px solid $color-border;
    border-radius: $radius-lg;

    .tip-text {
        display: flex;
        align-items: center;
        gap: $spacing-xs + 2px;
        color: $color-text-primary;
        font-size: $font-size-base;
        line-height: $line-height-normal;
    }

    .tip-icon {
        width: $size-icon-sm;
        height: $size-icon-sm;
        color: $color-info;
    }

    .switch-btn {
        -webkit-app-region: no-drag;
        border: none;
        background: $color-info;
        color: $color-bg-primary;
        border-radius: $radius-md;
        padding: $spacing-xs $spacing-sm;
        font-size: $font-size-sm;
        font-weight: $font-weight-medium;
        cursor: pointer;
        transition: background $transition-base;

        &:hover {
            background: $color-info-dark;
        }

        &:active {
            transform: scale(0.98);
        }
    }
}

.form-group {
    margin-bottom: $spacing-md;

    label {
        display: block;
        font-size: $font-size-base;
        font-weight: $font-weight-medium;
        color: $color-text-primary;
        margin-bottom: $spacing-xs;
        line-height: $line-height-normal;
    }

    .input-wrapper {
        -webkit-app-region: no-drag;
        position: relative;
        display: flex;
        align-items: center;

        .input-icon {
            position: absolute;
            left: 14px;
            width: $size-icon-sm;
            height: $size-icon-sm;
            color: $color-text-tertiary;
            pointer-events: none;
            transition: color $transition-base;
        }

        input {
            width: 100%;
            height: $size-input-height;
            padding: 0 14px 0 44px;
            border: 1.5px solid $color-border;
            border-radius: $radius-md;
            font-size: $font-size-base;
            line-height: $line-height-normal;
            transition: all $transition-base;
            background: $color-bg-secondary;
            color: $color-text-primary;

            &:focus {
                outline: none;
                border-color: $color-border-focus;
                background: $color-bg-primary;
                box-shadow: $shadow-focus;

                ~.input-icon {
                    color: $color-primary;
                }
            }

            &::placeholder {
                color: $color-text-placeholder;
            }
        }

        .password-toggle {
            position: absolute;
            right: $spacing-sm - 4px;
            background: none;
            border: none;
            cursor: pointer;
            padding: $spacing-xs;
            display: flex;
            align-items: center;
            justify-content: center;
            color: $color-text-tertiary;
            transition: color $transition-base;

            &:hover {
                color: $color-primary;
            }

            svg {
                width: $size-icon-sm;
                height: $size-icon-sm;
            }
        }
    }
}

.checkbox-group {
    display: flex;
    gap: $spacing-md;
    margin-bottom: $spacing-md;
    justify-content: space-between;

    .checkbox-item {
        -webkit-app-region: no-drag;
        display: flex;
        align-items: center;
        gap: $spacing-xs;
        cursor: pointer;
        user-select: none;

        input[type='checkbox'] {
            display: none;
        }

        .checkbox-custom {
            width: $size-icon-sm;
            height: $size-icon-sm;
            border: 1.5px solid $color-border;
            border-radius: 4px;
            transition: all $transition-base;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;

            &::after {
                content: '';
                width: 4px;
                height: 8px;
                border: solid white;
                border-width: 0 2px 2px 0;
                transform: rotate(45deg) scale(0);
                transition: transform $transition-base;
            }
        }

        .checkbox-label {
            font-size: $font-size-sm;
            color: $color-text-secondary;
            font-weight: $font-weight-medium;
            line-height: $line-height-normal;
        }

        input[type='checkbox']:checked~.checkbox-custom {
            background: $gradient-primary;
            border-color: transparent;

            &::after {
                transform: rotate(45deg) scale(1);
            }
        }

        &:hover .checkbox-custom {
            border-color: $color-border-hover;
        }
    }
}

.login-btn {
    -webkit-app-region: no-drag;
    width: 100%;
    height: $size-button-height;
    background: $gradient-primary;
    color: $color-bg-primary;
    border: none;
    border-radius: $radius-md;
    font-size: $font-size-lg;
    font-weight: $font-weight-semibold;
    line-height: $line-height-tight;
    cursor: pointer;
    transition: all $transition-base;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: $spacing-md;

    &:hover:not(:disabled) {
        box-shadow: $shadow-lg;
        transform: translateY(-2px);
    }

    &:active:not(:disabled) {
        transform: translateY(0);
    }

    &:disabled {
        opacity: 0.8;
        cursor: not-allowed;
    }

    .loading-spinner {
        display: flex;
        gap: 4px;

        span {
            width: 6px;
            height: 6px;
            background: $color-bg-primary;
            border-radius: 50%;
            animation: pulse 1.4s infinite;

            &:nth-child(1) {
                animation-delay: 0s;
            }

            &:nth-child(2) {
                animation-delay: 0.2s;
            }

            &:nth-child(3) {
                animation-delay: 0.4s;
            }
        }
    }
}

.footer-links {
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: $spacing-sm;

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

    .divider {
        color: $color-border;
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