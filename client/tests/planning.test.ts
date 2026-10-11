import assert from 'node:assert/strict'
import test from 'node:test'
import { consumptionForecast, localAction, prepareCorrection, validateShopping } from '../src/services/planning'
import type { DemoData, Item, Movement } from '../src/types/domain'

const item: Item = { id: 'one', name: 'Own formula', category: 'formula', unit: 'g', quantity: 300, lowStock: 100, openedOn: null, expiresOn: null, notes: '', revision: 1, createdAt: '2026-10-01T00:00:00Z' }
const use = (id: string, day: string, amount = 60): Movement => ({ id, itemId: item.id, kind: 'use', amount, balance: 0, note: '', createdAt: `${day}T00:00:00Z`, occurredOn: day })

test('forecast requires real recent recorded days and ignores voided and excluded days', () => {
  const records = [use('1', '2026-10-08'), use('2', '2026-10-09'), use('3', '2026-10-10')]
  assert.equal(consumptionForecast(item, []).days, null)
  assert.equal(consumptionForecast(item, records.slice(0, 2)).days, null)
  const forecast = consumptionForecast(item, records, '2026-10-10')
  assert.equal(forecast.days, 5)
  assert.equal(forecast.dailyAverage, 60)
  assert.equal(consumptionForecast(item, [...records, { ...use('other', '2026-10-10', 999), itemId: 'other' }], '2026-10-10').days, 5)
  assert.equal(consumptionForecast(item, records.map(record => record.id === '2' ? { ...record, voidedAt: 'now' } : record), '2026-10-10').days, null)
  const fourDays = [...records, { ...use('4', '2026-10-07', 1000), excludeFromForecast: true }]
  assert.equal(consumptionForecast(item, fourDays, '2026-10-10').dailyAverage, 60)
  assert.equal(consumptionForecast(item, records, '2026-10-18').days, null)
  assert.equal(consumptionForecast({ ...item, quantity: 0 }, records, '2026-10-10').days, 0)
  assert.equal(consumptionForecast(item, records, '2026-10-12').dailyAverage, 36)
})

test('local correction retains evidence and membership without mutating data', () => {
  const movement = { ...use('old', '2026-10-09', 60), batchId: 'batch' }
  const data: DemoData = { baby: null, items: [item], movements: [movement] }
  let id = 0
  const changed = prepareCorrection(data, { movementId: 'old' }, 'operation', '2026-10-10T00:00:00Z', () => `new-${++id}`, { amount: 30, occurredOn: '2026-10-10', note: 'Corrected' })
  assert.equal(changed.items[0].quantity, 330)
  assert.equal(changed.items[0].revision, 2)
  assert.equal(item.quantity, 300)
  assert.equal(data.movements[0].voidedAt, undefined)
  assert.equal(changed.movements.find(record => record.id === 'old')?.correctionId, 'operation')
  assert.equal(changed.movements.find(record => record.kind === 'undo')?.balance, 360)
  assert.equal(changed.movements.find(record => record.replacesId)?.batchId, 'batch')
  assert.throws(() => prepareCorrection({ ...data, ...changed }, { movementId: 'old' }, 'again', 'now', () => 'id'))
  assert.throws(() => prepareCorrection(data, { movementId: 'old' }, 'operation', 'now', () => 'id', { amount: 999, occurredOn: '2026-10-10', note: '' }))
})

test('local batch restoration is atomic for missing items and overflow', () => {
  const first = { ...use('1', '2026-10-09'), batchId: 'batch' }
  const second = { ...use('2', '2026-10-09'), batchId: 'batch', itemId: 'two' }
  const data: DemoData = { baby: null, items: [item], movements: [first], batches: [{ id: 'batch', fingerprint: '', movements: [first, second] }] }
  assert.throws(() => prepareCorrection(data, { batchId: 'batch' }, 'op', 'now', () => 'id'), /整批/)
  assert.equal(data.items[0].quantity, 300)
  const full: DemoData = { ...data, items: [item, { ...item, id: 'two', quantity: 20 }], movements: [first, second] }
  let id = 0
  const result = prepareCorrection(full, { batchId: 'batch' }, 'op', 'now', () => `id-${++id}`)
  assert.deepEqual(result.items.map(value => value.quantity), [360, 80])
  assert.ok(result.movements.filter(value => value.kind === 'use').every(value => value.voidedAt))
  assert.throws(() => prepareCorrection({ ...full, items: [{ ...item, quantity: 999999 }, full.items[1]] }, { batchId: 'batch' }, 'op', 'now', () => 'id'), /上限/)
})

test('shopping drafts require real input and operation retries cannot change payload', () => {
  const draft = { itemId: null, name: 'Own bottle', plannedQuantity: 2, plannedUnit: '个', note: '' }
  assert.doesNotThrow(() => validateShopping(draft))
  assert.throws(() => validateShopping({ ...draft, plannedQuantity: 0 }))
  assert.throws(() => validateShopping({ ...draft, name: '' }))
  const action = { id: 'op', fingerprint: 'original', result: { ok: true } }
  const data: DemoData = { baby: null, items: [], movements: [], actions: [action] }
  assert.deepEqual(localAction(data, 'op', 'original'), action)
  assert.throws(() => localAction(data, 'op', 'changed'))
  assert.equal(localAction(data, 'other', 'original'), undefined)
})
