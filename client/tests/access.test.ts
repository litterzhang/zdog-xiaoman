import assert from 'node:assert/strict'
import test from 'node:test'
import { appPages } from '../src/config/navigation'
import { readFileSync, existsSync } from 'node:fs'
import { resolveAccess } from '../src/services/access'

test('launch and public tabs allow browsing without creating a login or demo session', () => {
  assert.equal(appPages[0], 'pages/home/index')
  assert.equal(resolveAccess(null, true), 'guest')
  assert.equal(resolveAccess(null, false), 'login')
  assert.equal(resolveAccess({ mode: 'demo' }, true), 'demo')
  assert.equal(resolveAccess({ mode: 'live', token: 'trusted' }, true), 'live')
})

test('public browsing has no sample inventory or fabricated usage records', () => {
  const source = readFileSync('src/components/GuestOverview.tsx', 'utf8')
  assert.equal(existsSync('src/config/guestPreview.ts'), false)
  assert.ok(source.includes('还没有记录用品'))
  assert.doesNotMatch(source, /guestExamples|item-row|400 g|22 片|60 g|6 片/)
})
