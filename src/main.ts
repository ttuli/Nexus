import { createApp } from 'vue'
import App from './App.vue'
import router from '@/router/router'
import Elementpuls from 'element-plus'
import 'element-plus/dist/index.css'
import './style/themes.scss'
import './style/CusElmessage.css'
import './style/global.scss'

import { createPinia } from 'pinia'
import { initTheme } from '@/utils/themeManager'

const app = createApp(App)

initTheme()

app.use(router)
app.use(Elementpuls)
app.use(createPinia())
app.mount('#app')
