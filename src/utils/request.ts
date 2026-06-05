import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/store/user'
import { tokenService, windowService, LogoutType } from '@/services'
import { ImTypes } from '@/types'

/** 通用 HTTP 响应包装（泛型覆盖 im.proto ApiResponse 的 data 字段） */
export type ApiResponse<T> = Omit<ImTypes.ApiResponse, 'data'> & { data: T }

const instance = axios.create({
  timeout: 10000,
  responseType: 'arraybuffer',
})

// Token 刷新状态（本地窗口内的请求队列）
let isRefreshing = false
// 等待刷新的请求队列
let pendingRequests: Array<(token: string) => void> = []

// 扩展 config 类型以支持 _retry 标记
interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
}

instance.interceptors.request.use(
  (config) => {
    config.headers['Authorization'] = 'Bearer ' + useUserStore().getToken()
    config.headers['Accept'] = "application/x-protobuf"
    config.headers['Content-Type'] = 'application/json'
    if (config.data instanceof Uint8Array || config.data instanceof ArrayBuffer) {
      config.headers['Content-Type'] = 'application/x-protobuf'
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

/**
 * 解析 ArrayBuffer 响应数据
 * - Content-Type 为 application/x-protobuf 时，返回 Uint8Array 供调用方自行 decode
 * - 否则当作 JSON 文本解析
 */
function parseResponseData(response: import('axios').AxiosResponse): any {
  const contentType = response.headers['content-type'] || ''
  const data = response.data

  if (contentType.toString().includes('application/x-protobuf')) {
    try {
      const apiResp = ImTypes.ApiResponse.decode(new Uint8Array(data))
      return {
        code: apiResp.code,
        message: apiResp.message,
        data: apiResp.data,
      }
    } catch (e) {
      console.error('Failed to decode ApiResponse', e)
      return data
    }
  }

  // 非 protobuf：将 ArrayBuffer 解码为 JSON
  if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
    try {
      const text = new TextDecoder('utf-8').decode(data)
      return JSON.parse(text)
    } catch {
      return data
    }
  }

  return data
}

instance.interceptors.response.use(
  (response) => {
    response.data = parseResponseData(response)
    return response
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as CustomAxiosRequestConfig

    // 如果 error.response.data 是 ArrayBuffer，先解析
    if (error.response && (error.response.data instanceof ArrayBuffer || error.response.data instanceof Uint8Array)) {
      const contentType = error.response.headers?.['content-type'] || ''
      if (contentType.toString().includes('application/x-protobuf')) {
        try {
          const apiResp = ImTypes.ApiResponse.decode(new Uint8Array(error.response.data as ArrayBuffer))

          // 拆分更方便查看
          error.response.data = {
            code: apiResp.code,
            message: apiResp.message,
            data: apiResp.data,
          }
        } catch (e) {
          console.error('Failed to decode error ApiResponse', e)
        }
      } else {
        try {
          const text = new TextDecoder('utf-8').decode(error.response.data as ArrayBuffer)
          error.response.data = JSON.parse(text)
        } catch {
          // 解析失败则保持原样
        }
      }
    }

    const errData = error.response?.data as { code?: number; message?: string } | undefined
    // 检查是否是 401 错误且不是重试请求
    if (error.response?.status === 401 || errData?.code === 401) {
      useUserStore().setToken('')
      // 如果是刷新 token 请求本身失败，直接跳转登录
      if (originalRequest.url?.includes('/auth/refresh')) {
        windowService.logout(LogoutType.LOGOUT)
        return Promise.reject(error)
      }

      // 如果已经重试过，不再重试
      if (originalRequest._retry) {
        windowService.logout(LogoutType.LOGOUT)
        return Promise.reject(error)
      }

      // 如果正在刷新 token，将请求加入队列等待
      if (isRefreshing) {
        return new Promise((resolve) => {
          pendingRequests.push((newToken: string) => {
            originalRequest.headers['Authorization'] = 'Bearer ' + newToken
            resolve(instance(originalRequest))
          })
        })
      }

      // 开始刷新 token
      originalRequest._retry = true
      isRefreshing = true

      try {
        // 请求主进程刷新 token
        const result = await tokenService.requestTokenRefresh()

        if (result.success && result.token) {
          const token = result.token

          // 更新当前请求的 Authorization
          originalRequest.headers['Authorization'] = 'Bearer ' + token

          // 执行队列中等待的请求
          pendingRequests.forEach(callback => callback(token))
          pendingRequests = []

          // 重试原请求
          return instance(originalRequest)
        } else {
          throw new Error(result.error || 'Refresh token failed')
        }
      } catch (refreshError) {
        // 刷新失败，清空队列并跳转登录
        pendingRequests = []
        windowService.logout(LogoutType.LOGOUT)
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    } else if (errData?.code === 403) {
      windowService.logout(LogoutType.KICKED)
      return Promise.reject(error)
    }

    // 其他错误正常处理
    if (errData?.message) {
      ElMessage.error(errData.message)
    } else if (error.message) {
      ElMessage.error(error.message)
    } else {
      ElMessage.error('未知错误')
    }

    return Promise.reject(error)
  }
)

export function decodeResponse<T, R = ApiResponse<T>>(
  responseData: any,
  decodeFunc: (input: Uint8Array) => T
): R {
  if (responseData) {
    try {
      if (responseData.data instanceof Uint8Array) {
        responseData.data = decodeFunc(responseData.data)
      } else if (!responseData.data || (typeof responseData.data === 'object' && Object.keys(responseData.data).length === 0)) {
        // 如果后端确实没返回 data 或者返回了一个空对象，给它解码一个空的二进制数据
        responseData.data = decodeFunc(new Uint8Array(0))
      }
    } catch (e) {
      console.error('Business data decode failed', e)
    }
  }
  return responseData as R
}

export default instance