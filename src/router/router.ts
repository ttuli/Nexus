import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
    history: createWebHashHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '',
            redirect: '/login'
        },
        {
            path: '/login',
            name: '登录',
            component: () => import('@/views/Login.vue')
        },
        {
            path: '/register',
            name: '注册',
            component: () => import('@/views/Register.vue')
        },
        {
            path: '/home',
            name: '主界面',
            component: () => import('@/views/main/MainInterface.vue')
        },
        {
            path: '/addFriend',
            name: '添加好友',
            component: () => import('@/views/AddFriend.vue')
        },
        {
            path: '/userInfo',
            name: '用户信息',
            component: () => import('@/views/main/InfoView/UserInfo.vue')
        }
    ]
})

export default router