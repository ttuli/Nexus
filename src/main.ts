import { createApp } from 'vue'
import App from './App.vue'
import router from '@/router/router'
import Elementpuls from 'element-plus'
import 'element-plus/dist/index.css'
import './style/CusElmessage.css'

import { createPinia } from 'pinia'

const app = createApp(App)
app.use(router)
app.use(Elementpuls)
app.use(createPinia())
app.mount('#app')
