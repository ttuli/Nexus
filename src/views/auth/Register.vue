<template>
    <div class="register-container">
        <TitleBar :needMin="false" class="title-bar" />
        <div class="logo-container">
            <Logo />
        </div>
        <div class="register-panel">
            <!-- 欢迎文字 -->
            <div class="welcome-text">
                <h2>创建账户</h2>
            </div>

            <!-- 注册表单 -->
            <form @submit.prevent="handleRegister" class="register-form">
                <!-- 昵称输入框 -->
                <div class="form-group">
                    <CusInput v-model="form.nickname" placeholder="请输入昵称" @submit="focusPhoneInput">
                        <template #left-area>
                            <img :src="NameIcon" class="input-icon" />
                        </template>
                        <template #right-area>
                            <span v-if="form.nickname" class="input-count">{{ form.nickname.length }}/20</span>
                        </template>
                    </CusInput>
                </div>

                <!-- 密码输入框 -->
                <div class="form-group">
                    <CusInput ref="passwordInput" v-model="form.password" type="password" :visible="passwordVisible"
                        placeholder="请输入密码 (至少8位)" @submit="focusConfirmPasswordInput" @focus="handlePasswordFocus"
                        @blur="handlePasswordBlur">
                        <template #left-area>
                            <img :src="PasswordIcon" class="input-icon" />
                        </template>
                        <template #right-area>
                            <button type="button" class="password-toggle" @click="passwordVisible = !passwordVisible"
                                :aria-label="passwordVisible ? '隐藏密码' : '显示密码'">
                                <img v-if="passwordVisible" :src="EyeOpenIcon" class="input-icon" />
                                <img v-else :src="EyeClosedIcon" class="input-icon" />
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

                <!-- 确认密码输入框 -->
                <div class="form-group">
                    <CusInput ref="confirmPasswordInput" v-model="form.confirmPassword" type="password"
                        :visible="confirmPasswordVisible" placeholder="请再次输入密码" @submit="handleRegister">
                        <template #left-area>
                            <img :src="PasswordIcon" class="input-icon" />
                        </template>
                        <template #right-area>
                            <span v-if="form.confirmPassword"
                                :class="['status-icon', passwordMatch ? 'valid' : 'invalid']">
                                <img v-if="passwordMatch" :src="CheckValidIcon" class="input-icon" />
                                <img v-else :src="CheckInvalidIcon" class="input-icon" />
                            </span>
                        </template>
                    </CusInput>
                </div>

                <!-- 手机号输入框 -->
                <div class="form-group">
                    <CusInput ref="phoneInput" v-model="form.phone" placeholder="请输入手机号" @submit="focusPasswordInput">
                        <template #left-area>
                            <img :src="PhoneIcon" class="input-icon" />
                        </template>
                        <template #right-area>
                            <span v-if="phoneStatus" :class="['status-icon', phoneStatus]">
                                <img v-if="phoneStatus === 'valid'" :src="CheckValidIcon" class="icon" />
                                <img v-else :src="CheckInvalidIcon" class="icon" />
                            </span>
                            <button type="button" class="send-code-btn" @click="sendAuthCode"
                                :disabled="codeCD !== 0 || isLoading">
                                <span v-if="codeCD !== 0">({{ codeCD }}s)验证码已发送</span>
                                <span v-else>发送验证码</span>
                            </button>
                        </template>
                    </CusInput>
                </div>

                <!-- 验证码输入框 -->
                <div class="form-group">
                    <CusInput ref="codeInput" v-model="form.code" placeholder="请输入验证码">
                        <template #left-area>
                            <img :src="CodeIcon" class="input-icon" />
                        </template>
                    </CusInput>
                </div>

                <!-- 同意协议复选框 -->
                <CusCheckBox v-model="form.agreeTerms">
                    我已阅读并同意
                    <button type="button" class="link-text" @click="showTerms">《用户服务协议》</button>
                    和
                    <button type="button" class="link-text" @click="showPrivacy">《隐私政策》</button>
                </CusCheckBox>
                <span style="width: 100%; height: 12px;"></span>
                <CusButton html-type="submit" :loading="isLoading" :showIcon="false">
                    注册
                </CusButton>
            </form>

            <!-- 底部链接 -->
            <div class="footer-text">
                <span>已有账户?</span>
                <CusButton type="normal" :showIcon="false" @click="goToLogin">
                    返回登录
                </CusButton>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { authService } from '@/services'

import NameIcon from '@/assets/input/input_name.svg?url'
import PhoneIcon from '@/assets/input/input_phone.svg?url'
import PasswordIcon from '@/assets/input/input_password.svg?url'
import EyeOpenIcon from '@/assets/input/eye_open.svg?url'
import EyeClosedIcon from '@/assets/input/eye_closed.svg?url'
import CheckValidIcon from '@/assets/input/check_valid.svg?url'
import CheckInvalidIcon from '@/assets/input/check_invalid.svg?url'
import CodeIcon from '@/assets/input/input_code.svg?url'

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
const phoneInput = ref<{ focus: () => void }>()
const passwordInput = ref<{ focus: () => void }>()
const confirmPasswordInput = ref<{ focus: () => void }>()

let finish = false;

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
        let res = await authService.register({
            phone: form.value.phone,
            name: form.value.nickname,
            password: form.value.password,
            auth_code: form.value.code
        })
        console.log(res)

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
    flex-direction: column;
    width: 100%;
    min-height: 100vh;
    background: $bg-auth;
    font-family: $font-family-base;

    .title-bar {
        position: fixed;
        top: 0;
        z-index: 1000;
    }

    .logo-container {
        width: 100%;
        height: 120px;
        background-color: $bg-card;
        display: flex;
        justify-content: center;
        align-items: center;
        border-bottom-right-radius: 16px;
        border-bottom-left-radius: 16px;
    }

    .register-panel {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 40px 20px;
        padding-top: 20px;
        background-color: $bg-auth;
        backdrop-filter: blur(10px);

        .welcome-text {
            text-align: center;
            margin-bottom: 20px;

            h2 {
                font-size: 28px;
                font-weight: 600;
                color: $color-text-primary;
                margin: 0 0 6px 0;
            }

            p {
                font-size: 14px;
                color: $color-text-secondary;
                margin: 0;
            }
        }

        .register-form {
            width: 100%;
            max-width: 380px;
            display: flex;
            flex-direction: column;

            .form-group {
                margin-bottom: 18px;

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
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .input-count {
                    font-size: 12px;
                    color: $color-text-placeholder;
                }

                .send-code-btn {
                    position: absolute;
                    top: 0;
                    right: 0;
                    bottom: 0;
                    border: none;
                    border-left: 1px solid $color-border;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0 12px;
                    background-color: $bg-card;
                    transition: background-color 0.3s ease;
                    cursor: pointer;

                    &:disabled {
                        background-color: $bg-disabled;
                        cursor: not-allowed;
                    }

                    &:hover:not(:disabled) {
                        background-color: $bg-active;
                    }

                    &:active:not(:disabled) {
                        background-color: $bg-active;
                    }
                }
            }
        }

        .link-text {
            background: none;
            border: none;
            color: $color-primary;
            cursor: pointer;
            padding: 0;
            font-size: 13px;
            font-weight: 600;
            transition: all 0.3s ease;

            &:hover {
                color: $color-primary-dark;
                text-decoration: underline;
            }
        }

        .footer-text {
            position: fixed;
            bottom: 20px;
            width: 300px;
            text-align: center;
            font-size: 14px;
            color: $color-text-secondary;
            -webkit-app-region: no-drag;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
    }
}
</style>