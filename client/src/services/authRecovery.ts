import type { Session } from '../types/domain'
import { ApiError } from './apiError'

type LiveSession = Extract<Session, { mode: 'live' }>
type Send = <T>(path: string, token?: string, data?: Record<string, unknown>, timeout?: number) => Promise<T>
interface Dependencies {
  send: Send
  current: () => Session | null
  save: (session: LiveSession) => void
  clear: () => void
  login: () => Promise<LiveSession>
  canRecover: () => boolean
}

/** Retry rejected requests only after restoring the same trusted identity. */
export class AuthRecovery {
  private recovery?: { token: string; promise: Promise<LiveSession> }
  constructor(private readonly dependencies: Dependencies) {}

  private matches(session: LiveSession) {
    const current = this.dependencies.current()
    return current?.mode === 'live' && current.token === session.token
  }

  private async recover(session: LiveSession): Promise<LiveSession> {
    if (this.recovery?.token === session.token) return this.recovery.promise
    if (!this.matches(session)) throw new Error('账号已切换，请重新操作。')
    if (!this.dependencies.canRecover() || !session.userId) {
      this.dependencies.clear()
      throw new ApiError(401, '登录已过期，请重新登录。')
    }
    const promise = (async () => {
      try {
        const renewed = await this.dependencies.login()
        if (!this.matches(session)) throw new Error('账号已切换，请重新操作。')
        if (renewed.userId !== session.userId) throw new ApiError(401, '登录身份已变化，请重新登录。')
        this.dependencies.save(renewed)
        return renewed
      } catch (error) {
        if (error instanceof ApiError && error.status === 401 && this.matches(session)) this.dependencies.clear()
        throw error
      }
    })()
    const recovery = { token: session.token, promise }
    this.recovery = recovery
    // Keep successful recovery for late 401s; allow retry after a temporary outage.
    void promise.catch(() => { if (this.recovery === recovery) this.recovery = undefined })
    return promise
  }

  async request<T>(session: LiveSession, path: string, data?: Record<string, unknown>, timeout?: number): Promise<T> {
    let active = session
    try {
      let value: T
      try {
        value = await this.dependencies.send<T>(path, active.token, data, timeout)
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error
        active = await this.recover(session)
        if (!this.matches(active)) throw new Error('账号已切换，请重新操作。')
        value = await this.dependencies.send<T>(path, active.token, data, timeout)
      }
      if (!this.matches(active)) throw new Error('账号已切换，请重新操作。')
      return value
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && this.matches(active)) this.dependencies.clear()
      throw error
    }
  }
}
