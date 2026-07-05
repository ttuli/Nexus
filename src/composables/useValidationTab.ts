import { ref } from 'vue'
import { ValidationType } from '@/src/types'

/**
 * 模块级单例 ref，跨组件共享当前 validation 页面的 active tab
 * 替代原 useAppStore().currentValidationTab，无需 Pinia
 */
export const currentValidationTab = ref<ValidationType>(ValidationType.Friend)
