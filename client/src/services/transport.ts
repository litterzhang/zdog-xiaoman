import Taro from '@tarojs/taro'

const baseUrl = (process.env.TARO_APP_API_BASE_URL || '').replace(/\/$/, '')
import { ApiError } from './apiError'
export { ApiError } from './apiError'
export async function request<T>(path: string, token?: string, data?: Record<string, unknown>, timeout = 15000): Promise<T> {
  if (process.env.TARO_ENV === 'weapp' && !/^https:\/\//.test(baseUrl)) {
    throw new Error('微信登录服务尚未配置，可先使用本地体验。')
  }
  let response: { statusCode: number; data: unknown }
  try {
    response = await Taro.request({
      url: `${baseUrl}/api${path}`, method: data === undefined ? 'GET' : 'POST', data,
      header: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      timeout,
    })
  } catch { throw new Error('暂时连接不上服务，请检查网络后重试。') }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const body = response.data as { message?: unknown } | null
    throw new ApiError(response.statusCode, typeof body?.message === 'string' ? body.message : '请求未完成，请重试。')
  }
  return response.data as T
}
