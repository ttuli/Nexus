<template>
    <div v-if="password" class="password-strength">
        <div class="strength-indicators">
            <div 
                v-for="(item, index) in 4" 
                :key="index"
                class="strength-dot"
                :class="{ 
                    'active': index < strengthLevel,
                    'weak': strengthLevel === 1,
                    'fair': strengthLevel === 2,
                    'good': strengthLevel === 3,
                    'strong': strengthLevel === 4
                }"
            ></div>
        </div>
        <span class="strength-text" :class="strengthClass">
            {{ strengthText }}
        </span>
    </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
    password: {
        type: String,
        required: true
    }
})

// 计算密码强度
const strengthLevel = computed(() => {
    const pwd = props.password
    if (!pwd) return 0
    
    let score = 0
    
    // 长度检查
    if (pwd.length >= 8) score++
    if (pwd.length >= 12) score++
    
    // 包含小写字母
    if (/[a-z]/.test(pwd)) score++
    
    // 包含大写字母
    if (/[A-Z]/.test(pwd)) score++
    
    // 包含数字
    if (/[0-9]/.test(pwd)) score++
    
    // 包含特殊符号
    if (/[^a-zA-Z0-9]/.test(pwd)) score++
    
    // 转换为 1-4 级别
    if (score <= 2) return 1
    if (score <= 3) return 2
    if (score <= 4) return 3
    return 4
})

const strengthText = computed(() => {
    const texts = ['', '弱', '一般', '良好', '强']
    return texts[strengthLevel.value]
})

const strengthClass = computed(() => {
    const classes = ['', 'weak', 'fair', 'good', 'strong']
    return classes[strengthLevel.value]
})
</script>

<style scoped>
.password-strength {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 8px;
}

.strength-indicators {
    display: flex;
    gap: 6px;
    flex: 1;
}

.strength-dot {
    height: 4px;
    flex: 1;
    background-color: #e5e7eb;
    border-radius: 2px;
    transition: all 0.3s ease;
}

.strength-dot.active {
    background-color: currentColor;
}

.strength-dot.active.weak {
    color: #ef4444;
}

.strength-dot.active.fair {
    color: #f59e0b;
}

.strength-dot.active.good {
    color: #3b82f6;
}

.strength-dot.active.strong {
    color: #10b981;
}

.strength-text {
    font-size: 12px;
    font-weight: 500;
    min-width: 32px;
    transition: color 0.3s ease;
}

.strength-text.weak {
    color: #ef4444;
}

.strength-text.fair {
    color: #f59e0b;
}

.strength-text.good {
    color: #3b82f6;
}

.strength-text.strong {
    color: #10b981;
}
</style>