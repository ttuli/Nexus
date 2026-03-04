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
            component: () => import('@/views/auth/Login.vue')
        },
        {
            path: '/register',
            name: '注册',
            component: () => import('@/views/auth/Register.vue')
        },
        {
            path: '/home',
            name: '主界面',
            component: () => import('@/views/home/index.vue'),
            redirect: '/home/chat',
            children: [
                {
                    path: 'chat',
                    name: '消息',
                    components: {
                        list: () => import('@/views/home/chat/ChatList.vue'),
                        default: () => import('@/views/home/chat/ChatContent.vue')
                    }
                },
                {
                    path: 'contacts',
                    name: '联系人',
                    redirect: '/home/contacts/empty',
                    children: [
                        {
                            path: 'empty',
                            name: 'ContactEmpty',
                            components: {
                                list: () => import('@/views/home/contact/components/ContactSidebar.vue'),
                                default: () => import('@/components/BlankPage.vue')
                            }
                        },
                        {
                            path: 'validation',
                            name: 'ValidationMessages',
                            components: {
                                list: () => import('@/views/home/contact/components/ContactSidebar.vue'),
                                default: () => import('@/views/home/contact/ValidationMessages.vue')
                            },
                            meta: {
                                preload: true
                            }
                        },
                        {
                            path: 'friend',
                            name: 'FriendDetail',
                            components: {
                                list: () => import('@/views/home/contact/components/ContactSidebar.vue'),
                                default: () => import('@/views/home/contact/FriendDetail.vue')
                            }
                        },
                        {
                            path: 'group',
                            name: 'GroupDetail',
                            components: {
                                list: () => import('@/views/home/contact/components/ContactSidebar.vue'),
                                default: () => import('@/views/home/contact/GroupDetail.vue')
                            }
                        }
                    ]
                },
            ]
        },
        {
            path: '/addFriend',
            name: '添加好友',
            component: () => import('@/views/search/AddFriend.vue')
        },
        {
            path: '/userInfo',
            name: '用户信息',
            component: () => import('@/views/infos/index.vue')
        },
        {
            path: '/settings',
            name: '设置',
            component: () => import('@/views/settings/SettingsLayout.vue')
        },
        {
            path: '/photoViewer',
            name: '图片查看',
            component: () => import('@/views/viewer/index.vue')
        },
        {
            path: '/videoViewer',
            name: '视频播放',
            component: () => import('@/views/viewer/video.vue')
        }
    ]
})

export default router