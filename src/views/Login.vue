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
            <form @submit.prevent="handleLogin" class="login-form">
                <!-- 手机号输入框 -->
                <div class="form-group">
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
                <div class="form-group">
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

                <!-- 记住密码和自动登录 -->
                <div class="checkbox-group">
                    <label class="checkbox-item">
                        <input v-model="form.rememberPassword" type="checkbox" />
                        <span class="checkbox-custom"></span>
                        <span class="checkbox-label">记住密码</span>
                    </label>
                    <label class="checkbox-item">
                        <input v-model="form.autoLogin" type="checkbox" />
                        <span class="checkbox-custom"></span>
                        <span class="checkbox-label">自动登录</span>
                    </label>
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

interface LoginForm {
    phone: string
    password: string
    rememberPassword: boolean
    autoLogin: boolean
}

const form = ref<LoginForm>({
    phone: '',
    password: '',
    rememberPassword: false,
    autoLogin: false,
})

const passwordVisible = ref(false)
const isLoading = ref(false)
const phoneInput = ref<HTMLInputElement>()
const passwordInput = ref<HTMLInputElement>()

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
        const data = await login(form.value)
        window.ipcRenderer.send('window:new-window', {
            key: 'home',
            data: {
                token: data.data.token
            }
        })
        window.close()
    } finally {
        isLoading.value = false
    }
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

</script>

<style scoped lang="scss">
.login-container {
    display: flex;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu',
        'Cantarell', sans-serif;
    flex-direction: column;

    .login-panel {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        padding: 30px 35px;
        background: rgba(255, 255, 255, 0.95);
        // background-color: #667eea;
        backdrop-filter: blur(10px);
    }
}

.logo-area {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 20px;
    margin-bottom: 55px;
    // background-color: #667eea;

    .logo-icon {
        width: 48px;
        height: 48px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;

        svg {
            width: 28px;
            height: 28px;
        }
    }

    .logo-text {
        font-size: 32px;
        font-weight: 700;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        margin: 0;
    }
}

.welcome-text {
    text-align: center;
    margin-bottom: 32px;

    h2 {
        font-size: 28px;
        font-weight: 600;
        color: #1a1a1a;
        margin: 0 0 8px 0;
    }

    p {
        font-size: 14px;
        color: #666;
        margin: 0;
    }
}

.login-form {
    width: 100%;
    max-width: 360px;
}

.form-group {
    margin-bottom: 20px;

    label {
        display: block;
        font-size: 14px;
        font-weight: 500;
        color: #333;
        margin-bottom: 8px;
    }

    .input-wrapper {
        -webkit-app-region: no-drag;
        position: relative;
        display: flex;
        align-items: center;

        .input-icon {
            position: absolute;
            left: 14px;
            width: 18px;
            height: 18px;
            color: #999;
            pointer-events: none;
        }

        input {
            width: 100%;
            height: 48px;
            padding: 0 14px 0 44px;
            border: 1.5px solid #e0e0e0;
            border-radius: 8px;
            font-size: 14px;
            transition: all 0.3s ease;
            background: #fafafa;

            &:focus {
                outline: none;
                border-color: #667eea;
                background: white;
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
            }

            &::placeholder {
                color: #bbb;
            }
        }

        .password-toggle {
            position: absolute;
            right: 12px;
            background: none;
            border: none;
            cursor: pointer;
            padding: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #999;
            transition: color 0.3s ease;

            &:hover {
                color: #667eea;
            }

            svg {
                width: 18px;
                height: 18px;
            }
        }
    }
}

.checkbox-group {
    display: flex;
    gap: 20px;
    margin-bottom: 24px;
    justify-content: space-between;

    .checkbox-item {
        -webkit-app-region: no-drag;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        user-select: none;

        input[type='checkbox'] {
            display: none;
        }

        .checkbox-custom {
            width: 18px;
            height: 18px;
            border: 1.5px solid #e0e0e0;
            border-radius: 4px;
            transition: all 0.3s ease;
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
                transition: transform 0.3s ease;
            }
        }

        .checkbox-label {
            font-size: 13px;
            color: #666;
            font-weight: 500;
        }

        input[type='checkbox']:checked~.checkbox-custom {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-color: transparent;

            &::after {
                transform: rotate(45deg) scale(1);
            }
        }

        &:hover .checkbox-custom {
            border-color: #667eea;
        }
    }
}

.login-btn {
    -webkit-app-region: no-drag;
    width: 100%;
    height: 48px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 20px;

    &:hover:not(:disabled) {
        box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
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
            background: white;
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
    gap: 12px;

    .link-btn {
        -webkit-app-region: no-drag;
        background: none;
        border: none;
        color: #667eea;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.3s ease;
        font-weight: 500;
        padding: 0;

        &:hover {
            color: #764ba2;
            text-decoration: underline;
        }
    }

    .divider {
        color: #e0e0e0;
    }
}

@keyframes float {

    0%,
    100% {
        transform: translateY(0px);
    }

    50% {
        transform: translateY(-30px);
    }
}

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