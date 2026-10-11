import { useCallback, useRef, useState } from 'react'
import Taro, { useDidShow, useUnload } from '@tarojs/taro'
import type { Snapshot } from '../types/domain'
import { snapshot } from '../services/repository'
import { getSession, openLogin } from '../services/session'
import { resolveAccess } from '../services/access'
import { readableError } from '../services/presentation'

export function useSnapshot(requireBaby = true, allowGuest = false) {
  const [data, setData] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const epoch = useRef(0)
  const reload = useCallback(async () => {
    const current = ++epoch.current
    setLoading(true); setError('')
    const access = resolveAccess(getSession(), allowGuest)
    if (access === 'guest' || access === 'login') {
      setData(null); setLoading(false)
      if (access === 'login') await openLogin()
      return
    }
    try {
      const value = await snapshot()
      if (current !== epoch.current) return
      if (requireBaby && !value.baby) {
        await Taro.reLaunch({ url: '/pages/onboarding/index' }); return
      }
      setData(value)
    } catch (err) {
      if (current !== epoch.current) return
      setData(null); setError(readableError(err))
      if (!getSession()) {
        if (allowGuest) setError('')
        else await openLogin()
      }
    } finally { if (current === epoch.current) setLoading(false) }
  }, [requireBaby, allowGuest])
  useDidShow(() => { void reload() })
  useUnload(() => { epoch.current++ })
  return { data, error, loading, reload, demo: getSession()?.mode === 'demo', guest: allowGuest && !getSession() }
}
