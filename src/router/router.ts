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
            component: () => import('@/src/views/auth/Login.vue')
        },
        {
            path: '/register',
            name: '注册',
            component: () => import('@/src/views/auth/Register.vue')
        },
        {
            path: '/home',
            name: '主界面',
            component: () => import('@/src/views/home/index.vue'),
            redirect: '/home/chat',
            children: [
                {
                    path: 'chat',
                    name: '消息',
                    components: {
                        list: () => import('@/src/views/home/chat/ChatList.vue'),
                        default: () => import('@/src/views/home/chat/ChatContent.vue')
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
                                list: () => import('@/src/views/home/contact/components/ContactSidebar.vue'),
                                default: () => import('@/src/components/BlankPage.vue')
                            }
                        },
                        {
                            path: 'validation',
                            name: 'ValidationMessages',
                            components: {
                                list: () => import('@/src/views/home/contact/components/ContactSidebar.vue'),
                                default: () => import('@/src/views/home/contact/ValidationMessages.vue')
                            },
                            meta: {
                                preload: true
                            }
                        },
                        {
                            path: 'friend',
                            name: 'FriendDetail',
                            components: {
                                list: () => import('@/src/views/home/contact/components/ContactSidebar.vue'),
                                default: () => import('@/src/views/home/contact/FriendDetail.vue')
                            }
                        },
                        {
                            path: 'group',
                            name: 'GroupDetail',
                            components: {
                                list: () => import('@/src/views/home/contact/components/ContactSidebar.vue'),
                                default: () => import('@/src/views/home/contact/GroupDetail.vue')
                            }
                        }
                    ]
                },
            ]
        },
        {
            path: '/addFriend',
            name: '添加好友',
            component: () => import('@/src/views/search/AddFriend.vue')
        },
        {
            path: '/userInfo',
            name: '用户信息',
            component: () => import('@/src/views/infos/index.vue')
        },
        {
            path: '/settings',
            name: '设置',
            component: () => import('@/src/views/settings/SettingsLayout.vue')
        },
        {
            path: '/photoViewer',
            name: '图片查看',
            component: () => import('@/src/views/viewer/index.vue')
        },
        {
            path: '/videoViewer',
            name: '视频播放',
            component: () => import('@/src/views/viewer/video.vue')
        },
        {
            path: '/call',
            name: '通话',
            component: () => import('@/src/views/call/CallWindow.vue')
        }
    ]
})

export default router