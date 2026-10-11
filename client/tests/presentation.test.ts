import assert from 'node:assert/strict'
import test from 'node:test'
import { babyGreeting, categories, daysBetween, formatTimestamp, normalizeItemDraft, reminders, validDate, validateBaby, validateItem } from '../src/services/presentation'
import type { Item } from '../src/types/domain'

const item: Item = { id: 'item', revision: 1, name: 'Formula', category: 'formula', unit: 'can', quantity: 2, lowStock: 1, expiresOn: '2026-11-01', openedOn: null, notes: '', createdAt: '2026-10-01T00:00:00Z' }

test('calendar days and baby status are explicit', () => {
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1)
  assert.equal(daysBetween('2024-02-28', '2024-03-01'), 2)
  assert.equal(babyGreeting({ name: '小宝', status: 'expected', date: '2026-10-05' }, '2026-10-04').metric, '1')
  assert.equal(babyGreeting({ name: '小宝', status: 'born', date: '2026-10-04' }, '2026-10-04').metric, '1')
  assert.equal(babyGreeting({ name: '小宝', status: 'expected', date: '2026-10-03' }, '2026-10-04').metric, '待相见')
  assert.equal(validDate('2026-02-30'), false)
  assert.equal(validDate('2024-02-29'), true)
  assert.equal(formatTimestamp('2026-10-03T16:10:00Z'), '2026-10-04 00:10')
})

test('reminders respect expiry boundaries, empty stock, and low threshold', () => {
  assert.equal(reminders(item, '2026-10-01').length, 0)
  assert.equal(reminders(item, '2026-10-02')[0].kind, 'expiring')
  assert.equal(reminders(item, '2026-11-01')[0].label, '今天到期')
  assert.equal(reminders(item, '2026-11-02')[0].kind, 'expired')
  assert.deepEqual(reminders({ ...item, quantity: 0 }, '2026-11-02').map(value => value.kind), ['low'])
  assert.equal(reminders({ ...item, quantity: 1, expiresOn: null })[0].kind, 'low')
})

test('eight useful categories have editable-unit defaults', () => {
  assert.equal(categories.length, 8)
  assert.equal(new Set(categories.map(category => category.id)).size, 8)
  assert.ok(categories.every(category => category.unit && category.label))
  assert.equal(categories.find(category => category.id === 'feeding')?.label, '喂养')
})

test('invalid inputs do not become stock or future birth dates', () => {
  assert.equal(validateItem(item), '')
  const payload = normalizeItemDraft(item)
  assert.deepEqual(Object.keys(payload).sort(), ['category', 'expiresOn', 'lowStock', 'name', 'notes', 'openedOn', 'quantity', 'unit'])
  assert.equal(payload.quantity, item.quantity)
  assert.equal('id' in payload || 'revision' in payload || 'createdAt' in payload, false)
  assert.ok(validateItem({ ...item, quantity: NaN }))
  assert.ok(validateItem({ ...item, quantity: 1.5 }))
  assert.ok(validateBaby({ name: 'Baby', status: 'born', date: '2100-01-01' }))
})

test('category forms, package conversions, and prices keep canonical units', async () => {
  const { itemForms } = await import('../src/config/itemForms')
  const { parseQuantity, parsePrice, quantityOptions } = await import('../src/services/itemForms')
  const formula = { ...item, unit: 'g', details: { stage: '1段', netWeightGrams: 800 } }
  assert.equal(validateItem(formula), '')
  assert.equal(parseQuantity('0.5', formula, '罐'), 400)
  assert.equal(parseQuantity('300', formula), 300)
  assert.ok(Number.isNaN(parseQuantity('0.333', formula, '罐')))
  assert.ok(Number.isNaN(parseQuantity('0.5', item, 'can')))
  const diapers = { ...item, category: 'diapers' as const, unit: '片', details: { size: 'NB', piecesPerPack: 52 } }
  assert.equal(parseQuantity('2', diapers, '包'), 104)
  assert.ok(Number.isNaN(parseQuantity('0.5', diapers, '包')))
  assert.equal(quantityOptions({ ...formula, details: {} }).length, 1)
  assert.equal(itemForms.diapers.opened, false)
  assert.equal(itemForms.feeding.expires, false)
  assert.ok(validateItem({ ...diapers, details: { netWeightGrams: 800 } }))
  assert.ok(validateItem({ ...diapers, details: { size: '1段' } }))
  assert.equal(parsePrice('268.50'), 26850)
  assert.equal(parsePrice('0.10'), 10)
  assert.equal(parsePrice(''), null)
  assert.ok(Number.isNaN(parsePrice('1.001')))
  assert.equal(validateItem({ ...formula, barcode: '0123456789012', priceCents: 26850, priceUnit: '罐' }), '')
})

test('checkout preparation is all-or-nothing and exhausted items are archived', async () => {
  const { isArchived, movementDay, prepareCheckout } = await import('../src/services/usage')
  const items = [{ ...item, id: 'first', quantity: 2 }, { ...item, id: 'second', quantity: 1 }]
  assert.throws(() => prepareCheckout(items, [{ itemId: 'first', amount: 2, note: '' }, { itemId: 'second', amount: 2, note: '' }]))
  assert.equal(items[0].quantity, 2)
  const prepared = prepareCheckout(items, [{ itemId: 'first', amount: 2, note: '' }, { itemId: 'second', amount: 1, note: '' }])
  assert.ok(prepared.every(value => isArchived(value.item)))
  assert.equal(items[0].quantity, 2)
  assert.throws(() => prepareCheckout(items, [{ itemId: 'first', amount: 1, note: '' }, { itemId: 'first', amount: 1, note: '' }]))
  assert.equal(isArchived({ ...item, quantity: 1 }), false)
  const movement = { id: 'entry', itemId: 'first', kind: 'use' as const, amount: 1, balance: 0, note: '', createdAt: '2026-10-03T16:10:00Z' }
  assert.equal(movementDay(movement), '2026-10-04')
  assert.equal(movementDay({ ...movement, occurredOn: '2026-10-01' }), '2026-10-01')
})

test('automatic catalog suggestions fill only permitted empty fields and retain attribution', async () => {
  const { applyCatalogSuggestion, catalogSourceUrl, validCatalogBarcode } = await import('../src/services/catalogPresentation')
  const source = { provider: 'food' as const, barcode: '0123456789012', fetchedAt: '2026-10-05T00:00:00+00:00' }
  const suggestion = { name: 'Catalog formula', category: 'formula' as const, quantity: '800g', details: { brand: 'Catalog', netWeightGrams: 800 }, source, sourceUrl: catalogSourceUrl(source) }
  const draft = { ...item, unit: 'g', quantity: 300, priceCents: 26850, priceUnit: '罐', details: { brand: 'My brand' } }
  const applied = applyCatalogSuggestion(draft, suggestion, true)
  assert.equal(applied.name, item.name)
  assert.equal(applied.details?.brand, 'My brand')
  assert.equal(applied.details?.netWeightGrams, 800)
  assert.equal(applied.quantity, 300)
  assert.equal(applied.priceCents, 26850)
  assert.equal(applied.expiresOn, item.expiresOn)
  assert.deepEqual(normalizeItemDraft(applied).catalogSource, source)
  const diaper = { ...suggestion, category: 'diapers' as const, details: { brand: 'Example', piecesPerPack: 52 } }
  const edit = applyCatalogSuggestion(draft, diaper, true)
  assert.equal(edit.category, 'formula')
  assert.equal(edit.unit, 'g')
  assert.equal(edit.details?.piecesPerPack, undefined)
  const create = applyCatalogSuggestion({ ...draft, name: '' }, diaper, false)
  assert.equal(create.category, 'diapers')
  assert.equal(create.unit, '片')
  assert.equal(create.quantity, 0)
  assert.equal(create.name, diaper.name)
  assert.equal(validCatalogBarcode(source.barcode), true)
  assert.equal(validCatalogBarcode('https://example.com'), false)
})


test('GS1 auto-fill supports diaper metadata without importing stock, prices or business dates', async () => {
  const { applyCatalogSuggestion, catalogSourceUrl } = await import('../src/services/catalogPresentation')
  const source = { provider: 'gs1' as const, barcode: '6903148349557', fetchedAt: '2026-10-05T00:00:00+00:00' }
  const suggestion = { name: 'Example diapers (NB)20片', category: 'diapers' as const, quantity: '20片', details: { brand: 'Example', size: 'NB', piecesPerPack: 20 }, source, sourceUrl: catalogSourceUrl(source) }
  const draft = { ...item, name: '', unit: 'g', priceCents: 8950, priceUnit: '包' }
  const result = applyCatalogSuggestion(draft, suggestion, false)
  assert.equal(result.name, suggestion.name)
  assert.equal(result.category, 'diapers')
  assert.equal(result.unit, '片')
  assert.equal(result.details?.piecesPerPack, 20)
  assert.equal(result.details?.size, 'NB')
  assert.equal(result.quantity, 0)
  assert.equal(result.priceCents, 8950)
  assert.equal(result.expiresOn, item.expiresOn)
  assert.equal(validateItem(result), '')
  assert.equal(catalogSourceUrl(source), 'https://apizero.cn/marketplace/barcode-gs1')
})

test('barcode SKU names upgrade brand-only/local placeholders without overwriting custom names', async () => {
  const { applyCatalogSuggestion, applyOwnSpecification, needsCatalogName } = await import('../src/services/catalogPresentation')
  const source = { provider: 'gs1' as const, barcode: '6903148349557', fetchedAt: '2026-10-06T00:00:00+00:00' }
  const name = '帮宝适奢宠黑金帮纸尿裤新生码(NB)20片'
  const suggestion = { name, category: 'diapers' as const, quantity: '20片', details: { brand: '帮宝适', size: 'NB', piecesPerPack: 20 }, source, sourceUrl: '' }
  const draft = { ...item, category: 'diapers' as const, unit: '片', name: '帮宝适', details: { brand: '帮宝适' }, quantity: 7, priceCents: 9990, priceUnit: '包' }
  const upgraded = applyCatalogSuggestion(draft, suggestion, true)
  assert.equal(upgraded.name, name)
  assert.equal(upgraded.quantity, 7)
  assert.equal(upgraded.priceCents, 9990)
  assert.equal(upgraded.expiresOn, draft.expiresOn)
  assert.equal(needsCatalogName(draft), true)
  assert.equal(needsCatalogName({ ...draft, name }), false)
  assert.equal(applyCatalogSuggestion({ ...draft, name: '我家备用的纸尿裤' }, suggestion, false).name, '我家备用的纸尿裤')
  assert.equal(applyCatalogSuggestion({ ...draft, name }, { ...suggestion, name: '帮宝适' }, false).name, name)
  assert.equal(applyCatalogSuggestion({ ...draft, name: '纸尿裤' }, suggestion, false).name, name)
  assert.equal(applyCatalogSuggestion({ ...draft, name: '帮宝适纸尿裤' }, suggestion, false).name, name)
  assert.equal(applyOwnSpecification({ ...draft, name: '' }, draft, false).name, '')
  assert.equal(applyCatalogSuggestion(applyOwnSpecification({ ...draft, name: '' }, draft, false), suggestion, false).name, name)
})
