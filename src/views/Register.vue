<template>
    <div class="register-container">
        <TitleBar :needMin="false" />
        <!-- 右侧注册面板 -->
        <div class="register-panel">
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
                <h2>创建账户</h2>
                <p>加入ChatHub，开始聊天</p>
            </div>

            <!-- 注册表单 -->
            <form @submit.prevent="handleRegister" class="register-form">
                <!-- 昵称输入框 -->
                <div class="form-group">
                    <label for="nickname">昵称</label>
                    <div class="input-wrapper">
                        <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                        <input v-model="form.nickname" type="text" id="nickname" placeholder="请输入昵称" maxlength="20"
                            @keydown.enter="focusPhoneInput" />
                        <span v-if="form.nickname" class="input-count">{{ form.nickname.length }}/20</span>
                    </div>
                </div>

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
                            maxlength="11" @keydown.enter="focusPasswordInput" />
                        <span v-if="phoneStatus" :class="['status-icon', phoneStatus]">
                            <svg v-if="phoneStatus === 'valid'" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                stroke-width="2">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="15" y1="9" x2="9" y2="15"></line>
                                <line x1="9" y1="9" x2="15" y2="15"></line>
                            </svg>
                        </span>
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
                            id="password" placeholder="请输入密码 (至少8位)" @keydown.enter="focusConfirmPasswordInput" />
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
                    <div v-if="form.password" class="password-strength">
                        <div class="strength-bar">
                            <div class="strength-fill" :class="passwordStrength.level"
                                :style="{ width: passwordStrength.percent + '%' }"></div>
                        </div>
                        <span class="strength-text" :class="passwordStrength.level">{{ passwordStrength.text }}</span>
                    </div>
                </div>

                <!-- 确认密码输入框 -->
                <div class="form-group">
                    <label for="confirmPassword">确认密码</label>
                    <div class="input-wrapper">
                        <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                        <input ref="confirmPasswordInput" v-model="form.confirmPassword"
                            :type="confirmPasswordVisible ? 'text' : 'password'" id="confirmPassword"
                            placeholder="请再次输入密码" @keydown.enter="handleRegister" />
                        <span v-if="form.confirmPassword" :class="['status-icon', passwordMatch ? 'valid' : 'invalid']">
                            <svg v-if="passwordMatch" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                stroke-width="2">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="15" y1="9" x2="9" y2="15"></line>
                                <line x1="9" y1="9" x2="15" y2="15"></line>
                            </svg>
                        </span>
                    </div>
                </div>

                <!-- 同意协议复选框 -->
                <label class="agreement-checkbox">
                    <input v-model="form.agreeTerms" type="checkbox" />
                    <span class="checkbox-custom"></span>
                    <span class="checkbox-label">
                        我已阅读并同意
                        <button type="button" class="link-text" @click="showTerms">《用户服务协议》</button>
                        和
                        <button type="button" class="link-text" @click="showPrivacy">《隐私政策》</button>
                    </span>
                </label>

                <!-- 注册按钮 -->
                <button type="submit" class="register-btn" :disabled="isLoading || !canRegister">
                    <span v-if="!isLoading">注册</span>
                    <span v-else class="loading-spinner">
                        <span></span>
                        <span></span>
                        <span></span>
                    </span>
                </button>
            </form>

            <!-- 底部链接 -->
            <div class="footer-text">
                <span>已有账户?</span>
                <button type="button" class="link-btn" @click="goToLogin">返回登录</button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import TitleBar from '@/components/TitleBar.vue'
import { ElMessage } from 'element-plus'
import { register } from '@/apis/user'

interface RegisterForm {
    nickname: string
    phone: string
    password: string
    confirmPassword: string
    agreeTerms: boolean
}

const form = ref<RegisterForm>({
    nickname: '',
    phone: '',
    password: '',
    confirmPassword: '',
    agreeTerms: false,
})

const passwordVisible = ref(false)
const confirmPasswordVisible = ref(false)
const isLoading = ref(false)
const phoneInput = ref<HTMLInputElement>()
const passwordInput = ref<HTMLInputElement>()
const confirmPasswordInput = ref<HTMLInputElement>()

let finish = false;

// 手机号状态
const phoneStatus = computed(() => {
    if (!form.value.phone) return null
    return /^1[3-9]\d{9}$/.test(form.value.phone) ? 'valid' : 'invalid'
})

// 密码强度计算
const passwordStrength = computed(() => {
    const pwd = form.value.password
    if (pwd.length < 8) {
        return { level: 'weak', percent: 33, text: '弱' }
    }

    let strength = 0
    // 包含大小写
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) strength++
    // 包含数字
    if (/\d/.test(pwd)) strength++
    // 包含特殊字符
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd)) strength++

    const levels = [
        { level: 'weak', percent: 33, text: '弱' },
        { level: 'medium', percent: 66, text: '中等' },
        { level: 'strong', percent: 100, text: '强' },
    ]

    return levels[Math.min(strength, 2)]
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

// 注册处理
const handleRegister = async (): Promise<void> => {
    if (finish) return
    if (!canRegister.value) {
        ElMessage.warning('请完成所有必填项')
        return
    }

    isLoading.value = true

    try {
        await register({
            phone:form.value.phone,
            username:form.value.nickname,
            password:form.value.password
        })

        finish = true;
        ElMessage.success('注册成功！')
        const timer = setInterval(() => {
            clearInterval(timer);
            window.close();
        }, 1200);
    } finally {
        isLoading.value = false
    }
}

// 返回登录
const goToLogin = (): void => {
    window.close()
}

// 显示服务协议
const showTerms = (e: Event): void => {
    e.preventDefault()
    console.log('显示服务协议')
    // 可以打开模态框显示服务协议
}

// 显示隐私政策
const showPrivacy = (e: Event): void => {
    e.preventDefault()
    console.log('显示隐私政策')
    // 可以打开模态框显示隐私政策
}
</script>

<style scoped lang="scss">
.register-container {
    display: flex;
    width: 100%;
    min-height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu',
        'Cantarell', sans-serif;
    overflow-x: hidden;

    .register-panel {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        padding: 40px 20px;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(10px);
    }
}

.logo-area {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 20px;
    margin-bottom: 12px;

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
    margin-bottom: 24px;

    h2 {
        font-size: 28px;
        font-weight: 600;
        color: #1a1a1a;
        margin: 0 0 6px 0;
    }

    p {
        font-size: 14px;
        color: #666;
        margin: 0;
    }
}

.register-form {
    width: 100%;
    max-width: 380px;
}

.form-group {
    margin-bottom: 18px;

    label {
        display: block;
        font-size: 14px;
        font-weight: 500;
        color: #333;
        margin-bottom: 8px;
    }

    .input-wrapper {
        position: relative;
        display: flex;
        align-items: center;
        -webkit-app-region: no-drag;

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
            height: 44px;
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

        .status-icon {
            position: absolute;
            right: 12px;
            width: 18px;
            height: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: color 0.3s ease;

            &.valid {
                color: #4caf50;
            }

            &.invalid {
                color: #f44336;
            }

            svg {
                width: 18px;
                height: 18px;
            }
        }

        .input-count {
            position: absolute;
            right: 12px;
            font-size: 12px;
            color: #999;
        }
    }

    .password-strength {
        margin-top: 8px;

        .strength-bar {
            height: 4px;
            background: #e0e0e0;
            border-radius: 2px;
            overflow: hidden;
            margin-bottom: 4px;

            .strength-fill {
                height: 100%;
                transition: all 0.3s ease;

                &.weak {
                    background: #f44336;
                }

                &.medium {
                    background: #ff9800;
                }

                &.strong {
                    background: #4caf50;
                }
            }
        }

        .strength-text {
            font-size: 12px;
            font-weight: 500;
            transition: color 0.3s ease;

            &.weak {
                color: #f44336;
            }

            &.medium {
                color: #ff9800;
            }

            &.strong {
                color: #4caf50;
            }
        }
    }
}

.agreement-checkbox {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 20px;
    cursor: pointer;
    user-select: none;
    -webkit-app-region: no-drag;

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
        margin-top: 2px;

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
        line-height: 1.4;

        .link-text {
            background: none;
            border: none;
            color: #667eea;
            cursor: pointer;
            padding: 0;
            font-size: 13px;
            font-weight: 600;
            transition: all 0.3s ease;

            &:hover {
                color: #764ba2;
                text-decoration: underline;
            }
        }
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

.register-btn {
    width: 100%;
    height: 44px;
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
    margin-bottom: 16px;
    -webkit-app-region: no-drag;

    &:hover:not(:disabled) {
        box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
        transform: translateY(-2px);
    }

    &:active:not(:disabled) {
        transform: translateY(0);
    }

    &:disabled {
        opacity: 0.5;
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

.footer-text {
    text-align: center;
    font-size: 14px;
    color: #666;
    -webkit-app-region: no-drag;

    span {
        margin-right: 4px;
    }

    .link-btn {
        background: none;
        border: none;
        color: #667eea;
        cursor: pointer;
        transition: all 0.3s ease;
        font-weight: 600;
        padding: 0;

        &:hover {
            color: #764ba2;
            text-decoration: underline;
        }
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