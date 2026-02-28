import { defineStore } from 'pinia';
import { CurrentRoute, ValidationType } from '@/types';

export const useAppStore = defineStore('app', {
    state: () => ({
        currentRoute: CurrentRoute.Chat,
        currentValidationTab: ValidationType.Friend, // 当前 validation 页面的 active tab 标记
    }),
});
