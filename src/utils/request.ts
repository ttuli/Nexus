import axios from 'axios'
import { useUserStore } from '@/store/user'
import { ElMessage } from 'element-plus'
import JSONbig from 'json-bigint';
import { jwtDecode } from 'jwt-decode';
import { refreshToken } from '@/apis/user';
import { getRefreshToken } from './keytar';

const isTokenExpired = (token: string) => {
  if (token === '') return false
  try {
    const decoded = jwtDecode(token);
    
    return decoded.exp? decoded.exp <= Date.now(): true;
  } catch (error) {
    console.error('Token解析失败:', error);
    return true; // 解析失败视为过期
  }
};

const instance = axios.create({
  timeout: 10000,
  transformResponse: [function (data, header) {
    if (header['content-type'] && header['content-type'].includes('application/json')) {
      try {
        // const JSONbigNative = JSONbig({ useNativeBigInt: true })
        return JSONbig.parse(data); // 用 json-bigint 解析响应
      } catch (e) {
        return JSON.parse(data);
      }
    }
    return data;
  }],
  transformRequest: [function (data, header) {
    header['Content-Type'] = 'application/json'
    const d = JSONbig.stringify(data);
    return d
  }],
})

instance.interceptors.request.use(
  async (config) => {
    if (isTokenExpired(useUserStore().getToken())) {
      let rtoken = await getRefreshToken()
      useUserStore().setToken(rtoken || '')
      let res = await refreshToken()
      useUserStore().setToken(res.data.token)
    }
    config.headers['Authorization'] = 'Bearer ' + useUserStore().getToken()
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

instance.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error) => {
    console.dir(error)
    if (error.response != undefined && error.response.data != undefined
      && error.response.data.info !== undefined
    ) {
      const message = error.response.data.info
      const result = message.substring(message.lastIndexOf(" ") + 1)
      ElMessage.error(result)
    } else if (error.message !== undefined) {
      ElMessage.error(error.message)
    } else {
      ElMessage.error('未知错误')
    }
    return Promise.reject(error)
  }
)

export default instance