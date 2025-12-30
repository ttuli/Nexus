import axios from 'axios'
import { useUserStore } from '@/store/user'
import { ElMessage } from 'element-plus'
import { refreshToken } from '@/apis/user';
import { getRefreshToken } from './keytar';

const instance = axios.create({
  timeout: 10000,
})

instance.interceptors.request.use(
  async (config) => {
    config.headers['Authorization'] = 'Bearer ' + useUserStore().getToken()
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

instance.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    if (error.response != undefined && error.response.data != undefined
      && error.response.data.message !== undefined
    ) {
      ElMessage.error(error.response.data.message)
    } else if (error.message !== undefined) {
      ElMessage.error(error.message)
    } else {
      ElMessage.error('未知错误')
    }
    return Promise.reject(error)
  }
)

export default instance