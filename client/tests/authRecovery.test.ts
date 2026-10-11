import assert from 'node:assert/strict'
import test from 'node:test'
import { AuthRecovery } from '../src/services/authRecovery'
import { ApiError } from '../src/services/apiError'
import type { Session } from '../src/types/domain'

type Live = Extract<Session, { mode: 'live' }>
const original: Live = { mode: 'live', token: 'expired', userId: 'parent-one' }
const renewed: Live = { mode: 'live', token: 'renewed', userId: 'parent-one' }
function harness(options: { login?: () => Promise<Live>; send?: (token?: string) => Promise<unknown>; canRecover?: boolean } = {}) {
  let current: Session | null = original
  let logins = 0
  const tokens: (string | undefined)[] = []
  const requests: { path: string; data?: Record<string, unknown> }[] = []
  const recovery = new AuthRecovery({
    current: () => current, save: value => { current = value }, clear: () => { current = null },
    canRecover: () => options.canRecover ?? true,
    login: async () => { logins++; return options.login ? options.login() : renewed },
    send: async <T>(path: string, token?: string, data?: Record<string, unknown>) => {
      tokens.push(token)
      requests.push({ path, data })
      if (options.send) return await options.send(token) as T
      if (token === 'expired') throw new ApiError(401, 'Expired')
      return { ok: true } as T
    },
  })
  return { recovery, tokens, requests, current: () => current, logins: () => logins, switch: (value: Session | null) => { current = value } }
}

test('parallel and late rejected requests share recovery and retry writes only once', async () => {
  const h = harness()
  const payload = { id: 'retry-key', amount: 2 }
  await Promise.all([h.recovery.request(original, '/usage', payload), h.recovery.request(original, '/snapshot')])
  await h.recovery.request(original, '/snapshot')
  assert.equal(h.logins(), 1)
  assert.deepEqual(h.requests.filter(value => value.path === '/usage').map(value => value.data), [payload, payload])
  assert.deepEqual(h.current(), renewed)
  assert.equal(h.tokens.filter(token => token === 'renewed').length, 3)
})

test('network and provider outages retain login and allow a later recovery', async () => {
  let attempts = 0
  const h = harness({ login: async () => {
    if (++attempts === 1) throw new ApiError(503, 'Unavailable')
    return renewed
  } })
  await assert.rejects(h.recovery.request(original, '/snapshot'), { status: 503 })
  assert.deepEqual(h.current(), original)
  await h.recovery.request(original, '/snapshot')
  assert.equal(h.logins(), 2)
  const network = harness({ send: async () => { throw new Error('Offline') } })
  await assert.rejects(network.recovery.request(original, '/snapshot'), /Offline/)
  assert.deepEqual(network.current(), original)
  assert.equal(network.logins(), 0)
})

test('different identity and logout during recovery never replay private writes', async () => {
  const mismatch = harness({ login: async () => ({ ...renewed, userId: 'parent-two' }) })
  await assert.rejects(mismatch.recovery.request(original, '/usage', { amount: 1 }), { status: 401 })
  assert.equal(mismatch.current(), null)
  assert.deepEqual(mismatch.tokens, ['expired'])
  let finish!: (session: Live) => void
  const switched = harness({ login: () => new Promise(resolve => { finish = resolve }) })
  const pending = switched.recovery.request(original, '/usage', { amount: 1 })
  await Promise.resolve()
  switched.switch(null)
  finish(renewed)
  await assert.rejects(pending, /账号已切换/)
  assert.equal(switched.current(), null)
  assert.deepEqual(switched.tokens, ['expired'])
})

test('H5, legacy identity-less sessions, and repeated 401s require explicit login', async () => {
  for (const legacy of [false, true]) {
    const h = harness({ canRecover: legacy })
    const session: Live = legacy ? { mode: 'live', token: 'expired' } : original
    h.switch(session)
    await assert.rejects(h.recovery.request(session, '/snapshot'), { status: 401 })
    assert.equal(h.current(), null)
    assert.equal(h.logins(), 0)
  }
  const rejected = harness({ send: async () => { throw new ApiError(401, 'Revoked') } })
  await assert.rejects(rejected.recovery.request(original, '/usage', { amount: 1 }), { status: 401 })
  assert.equal(rejected.logins(), 1)
  assert.equal(rejected.tokens.length, 2)
  assert.equal(rejected.current(), null)
})
