import Taro from '@tarojs/taro'
import type { Session } from '../types/domain'
import { request } from './transport'
import { AuthRecovery } from './authRecovery'

const key = 'baby.session.v1'
export function getSession(): Session | null {
  const value: unknown = Taro.getStorageSync(key)
  if (!value || typeof value !== 'object') return null
  const session = value as Partial<Session> & { token?: unknown }
  if (session.mode === 'demo') return { mode: 'demo' }
  if (session.mode === 'live' && typeof session.token === 'string' && session.token.length > 0 && session.token.length <= 8192 && !/\s/.test(session.token)) return { mode: 'live', token: session.token, ...(typeof session.userId === 'string' && session.userId.trim() ? { userId: session.userId } : {}) }
  return null
}
export function sameSession(session: Session): boolean {
  const current = getSession()
  return current?.mode === session.mode && (current.mode === 'demo' || (session.mode === 'live' && current.token === session.token))
}
export function startDemo() { Taro.setStorageSync(key, { mode: 'demo' }) }
export function logout() { Taro.removeStorageSync(key) }
async function createLiveSession(username?: string, password?: string): Promise<Extract<Session, { mode: 'live' }>> {
  const weapp = process.env.TARO_ENV === 'weapp'
  const data = weapp ? { code: (await Taro.login()).code } : { username, password }
  if (weapp && !data.code) throw new Error('无法获取微信登录凭据，请重试。')
  const response = await request<{ access_token: string }>(weapp ? '/auth/wechat' : '/auth/login', undefined, data)
  const token = response.access_token
  if (typeof token !== 'string' || !token || token.length > 8192 || /\s/.test(token)) throw new Error('登录服务未返回有效令牌。')
  const identity = await request<{ id: string }>('/auth/me', token)
  if (typeof identity.id !== 'string' || !identity.id.trim()) throw new Error('登录服务未返回有效身份。')
  return { mode: 'live', token, userId: identity.id }
}
export async function signIn(username?: string, password?: string) {
  Taro.setStorageSync(key, await createLiveSession(username, password))
}
const recovery = new AuthRecovery({
  send: request, current: getSession, save: session => Taro.setStorageSync(key, session),
  clear: logout, login: () => createLiveSession(),
  canRecover: () => process.env.TARO_ENV === 'weapp',
})
export function authenticatedRequest<T>(session: Extract<Session, { mode: 'live' }>, path: string, data?: Record<string, unknown>, timeout?: number): Promise<T> {
  return recovery.request<T>(session, path, data, timeout)
}
export async function openHome() {
  await Taro.switchTab({ url: '/pages/home/index' })
}
export async function openLogin() {
  await Taro.reLaunch({ url: '/pages/login/index' })
}
