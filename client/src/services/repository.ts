import Taro from '@tarojs/taro'
import type { Baby, DemoData, Item, ItemDraft, Movement, Snapshot, UsageEntry, UsageRecord, CorrectionTarget, UsageReplacement, ShoppingDraft, ShoppingEntry, Purchase } from '../types/domain'
import { authenticatedRequest, getSession } from './session'
import { ApiError } from './transport'
import { normalizeItemDraft, validateBaby, validateItem } from './presentation'
import { localAction, prepareCorrection, validatePurchaseDates, validateReplacement, validateShopping } from './planning'
import { movementDay, prepareCheckout, validateUsageDay } from './usage'

const demoKey = 'baby.demo.v1'
export function newId(): string {
  // IDs are retry keys, not credentials. The server validates canonical UUID format.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const value = Math.floor(Math.random() * 16)
    return (char === 'x' ? value : (value & 3) | 8).toString(16)
  })
}
function demoData(): DemoData {
  const value = Taro.getStorageSync(demoKey) as DemoData | undefined
  if (!value || !Array.isArray(value.items) || !Array.isArray(value.movements)) return { baby: null, items: [], movements: [] }
  // Recover membership for batches saved before batch IDs were exposed in the UI.
  return { ...value, movements: value.movements.map(record => {
    const batchId = record.batchId || value.batches?.find(batch => batch.movements.some(entry => entry.id === record.id))?.id
    return batchId ? { ...record, batchId } : record
  }) }
}
function saveDemo(data: DemoData) { Taro.setStorageSync(demoKey, data) }
async function run<T>(demo: () => T, path: string, data?: Record<string, unknown>): Promise<T> {
  const session = getSession()
  if (!session) throw new ApiError(401, '请先登录。')
  if (session.mode === 'demo') return demo()
  return authenticatedRequest<T>(session, path, data)
}
export async function snapshot(): Promise<Snapshot> {
  return run(() => { const data = demoData(); const usage = data.movements.filter(record => record.kind === 'use'); return { baby: data.baby, items: data.items, usage } }, '/snapshot')
}
export async function saveBaby(baby: Baby): Promise<Baby> {
  const error = validateBaby(baby)
  if (error) throw new Error(error)
  const clean = { ...baby, name: baby.name.trim() }
  return run(() => { const data = demoData(); data.baby = clean; saveDemo(data); return clean }, '/baby', { ...clean })
}
export async function saveItem(draft: ItemDraft, previous?: Item): Promise<Item> {
  const error = validateItem(draft)
  if (error) throw new Error(error)
  if (previous && (draft.unit !== previous.unit || draft.category !== previous.category)) throw new Error('已有库存的分类和单位不能更改，请新建记录。')
  const clean = normalizeItemDraft(draft)
  const { quantity: _quantity, ...edit } = clean
  return run(() => {
    const data = demoData()
    const current = previous ? data.items.find(item => item.id === previous.id) : undefined
    if (previous && (!current || current.revision !== previous.revision)) throw new Error('用品已发生变化，请重新打开后编辑。')
    const item: Item = previous && current
      ? { ...current, ...edit, revision: current.revision + 1 }
      : { ...clean, id: newId(), revision: 1, createdAt: new Date().toISOString() }
    data.items = previous ? data.items.map(value => value.id === item.id ? item : value) : [item, ...data.items]
    if (!previous) data.movements.unshift({ id: newId(), itemId: item.id, kind: 'initial', amount: item.quantity, balance: item.quantity, note: '初始库存', createdAt: item.createdAt })
    saveDemo(data)
    return item
  }, previous ? `/items/${previous.id}` : '/items', previous ? { ...edit, revision: previous.revision } : { ...clean })
}
export async function deleteItem(item: Item): Promise<void> {
  await run(() => {
    const data = demoData()
    const current = data.items.find(value => value.id === item.id)
    if (!current || current.revision !== item.revision) throw new Error('用品已发生变化，请刷新后重试。')
    data.items = data.items.filter(value => value.id !== item.id)
    data.movements = data.movements.filter(value => value.itemId !== item.id)
    saveDemo(data)
    return { deleted: true }
  }, `/items/${item.id}/delete`, { revision: item.revision })
}
export async function history(itemId: string): Promise<Movement[]> {
  const result = await run(() => ({ movements: demoData().movements.filter(value => value.itemId === itemId) }), `/items/${itemId}/movements`)
  return result.movements
}
export async function move(itemId: string, kind: 'use' | 'restock', amount: number, id: string, note: string, occurredOn?: string): Promise<Item> {
  if (!Number.isInteger(amount) || amount <= 0 || amount > 999999) throw new Error('请输入大于 0 的整数数量。')
  if (occurredOn !== undefined) validateUsageDay(occurredOn)
  const result = await run(() => {
    const data = demoData()
    const item = data.items.find(value => value.id === itemId)
    if (!item) throw new Error('用品不存在。')
    const previous = data.movements.find(value => value.id === id)
    if (previous) {
      if (previous.itemId !== itemId || previous.kind !== kind || previous.amount !== amount || previous.note !== note || (occurredOn !== undefined && previous.occurredOn !== occurredOn)) throw new Error('记录编号已使用，请重新操作。')
      return { item, movement: previous }
    }
    const balance = item.quantity + (kind === 'use' ? -amount : amount)
    if (balance < 0 || balance > 999999) throw new Error('库存不足，或补货数量超过上限。')
    item.quantity = balance; item.revision++
    const movement: Movement = { id, itemId, kind, amount, balance, note, createdAt: new Date().toISOString(), ...(occurredOn ? { occurredOn } : {}) }
    data.movements.unshift(movement); saveDemo(data)
    return { item, movement }
  }, `/items/${itemId}/movements`, { id, kind, amount, note, ...(occurredOn ? { occurredOn } : {}) })
  return result.item
}

export async function dailyUsage(day: string): Promise<UsageRecord[]> {
  validateUsageDay(day)
  const result = await run(() => {
    const data = demoData()
    const records: UsageRecord[] = data.movements.flatMap(movement => {
      const item = data.items.find(value => value.id === movement.itemId)
      return item && movement.kind === 'use' && movementDay(movement) === day
        ? [{ ...movement, itemName: item.name, unit: item.unit, category: item.category }] : []
    })
    return { records }
  }, `/usage?day=${encodeURIComponent(day)}`)
  return result.records
}

export async function checkoutUsage(id: string, day: string, entries: UsageEntry[]): Promise<Movement[]> {
  validateUsageDay(day)
  const fingerprint = JSON.stringify([day, entries])
  const result = await run(() => {
    const data = demoData()
    const previous = data.batches?.find(value => value.id === id)
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new Error('提交编号已使用，请重新操作。')
      return { movements: previous.movements }
    }
    // Prepare every deduction before mutating or persisting anything.
    const prepared = prepareCheckout(data.items, entries)
    const createdAt = new Date().toISOString()
    const movements: Movement[] = prepared.map(({ item, entry }) => ({
      id: newId(), itemId: item.id, kind: 'use', amount: entry.amount,
      balance: item.quantity, note: entry.note, occurredOn: day, createdAt, batchId: id,
    }))
    data.items = data.items.map(item => prepared.find(value => value.item.id === item.id)?.item || item)
    data.movements.unshift(...movements)
    data.batches = [...(data.batches || []), { id, fingerprint, movements }]
    saveDemo(data)
    return { movements }
  }, '/usage/batches', { id, occurredOn: day, entries })
  return result.movements
}

export async function correctUsage(id: string, target: CorrectionTarget, replacement?: UsageReplacement): Promise<void> {
  if (replacement) validateReplacement(replacement)
  const fingerprint = JSON.stringify(['correction', target, replacement])
  await run(() => {
    const data = demoData()
    const previous = localAction(data, id, fingerprint)
    if (previous) return previous.result
    const prepared = prepareCorrection(data, target, id, new Date().toISOString(), newId, replacement)
    const result = { movements: prepared.movements.filter(record => record.correctionId === id || !data.movements.some(old => old.id === record.id)) }
    saveDemo({ ...data, ...prepared, actions: [...(data.actions || []), { id, fingerprint, result }] })
    return result
  }, '/usage/corrections', { id, ...target, ...(replacement ? { replacement } : {}) })
}

export async function excludeUsageDay(id: string, movement: Movement, excluded: boolean): Promise<void> {
  const fingerprint = JSON.stringify(['exclude', movement.id, excluded])
  await run(() => {
    const data = demoData()
    const previous = localAction(data, id, fingerprint)
    if (previous) return previous.result
    const source = data.movements.find(record => record.id === movement.id && record.kind === 'use' && !record.voidedAt)
    if (!source) throw new Error('有效使用记录不存在。')
    const result = { excluded }
    const movements = data.movements.map(record => record.itemId === source.itemId && record.kind === 'use' && movementDay(record) === movementDay(source) ? { ...record, excludeFromForecast: excluded } : record)
    saveDemo({ ...data, movements, actions: [...(data.actions || []), { id, fingerprint, result }] })
    return result
  }, '/usage/exclusions', { id, movementId: movement.id, excluded })
}

export async function shoppingList(): Promise<ShoppingEntry[]> {
  const result = await run(() => ({ entries: demoData().shopping || [] }), '/shopping')
  return result.entries
}
export async function saveShopping(id: string, draft: ShoppingDraft, revision?: number): Promise<ShoppingEntry> {
  validateShopping(draft)
  const clean = { ...draft, name: draft.name.trim(), plannedUnit: draft.plannedUnit.trim(), note: draft.note.trim() }
  return run(() => {
    const data = demoData()
    const entries = data.shopping || []
    const previous = entries.find(entry => entry.id === id)
    if (previous && (previous.revision !== revision || previous.status !== 'pending')) {
      if (previous.status === 'pending' && (revision === undefined || previous.revision === revision + 1) && Object.entries(clean).every(([key, value]) => previous[key as keyof ShoppingEntry] === value)) return previous
      throw new Error('待购记录已变化，请刷新。')
    }
    if (!previous && revision !== undefined) throw new Error('待购记录不存在。')
    if (clean.itemId && !data.items.some(item => item.id === clean.itemId)) throw new Error('用品不存在。')
    if (clean.itemId && entries.some(entry => entry.id !== id && entry.itemId === clean.itemId && entry.status === 'pending')) throw new Error('这件用品已在待购清单。')
    const entry: ShoppingEntry = { ...clean, id, status: 'pending', revision: previous ? previous.revision + 1 : 1, createdAt: previous?.createdAt || new Date().toISOString() }
    saveDemo({ ...data, shopping: previous ? entries.map(value => value.id === id ? entry : value) : [entry, ...entries] })
    return entry
  }, '/shopping', { id, ...clean, ...(revision !== undefined ? { revision } : {}) })
}

export async function shoppingAction(entry: ShoppingEntry, id: string, action: 'delete' | 'complete' | 'restock', purchase?: Purchase): Promise<void> {
  if (purchase) {
    validatePurchaseDates(purchase)
    if (!Number.isInteger(purchase.amount) || purchase.amount <= 0 || purchase.amount > 999999) throw new Error('请填写有效补货数量。')
    if (purchase.priceCents != null && (!Number.isInteger(purchase.priceCents) || purchase.priceCents < 0 || purchase.priceCents > 99999999 || !purchase.priceUnit?.trim() || purchase.priceUnit.length > 8)) throw new Error('请检查购入单价与单位。')
  }
  const fingerprint = JSON.stringify(['shopping', entry.id, entry.revision, action, purchase])
  await run(() => {
    const data = demoData()
    const previous = localAction(data, id, fingerprint)
    if (previous) return previous.result
    const current = data.shopping?.find(value => value.id === entry.id)
    if (!current || current.revision !== entry.revision || (action !== 'delete' && current.status !== 'pending')) throw new Error('待购记录已变化，请刷新。')
    const completed: ShoppingEntry = { ...current, status: 'done', completedAt: new Date().toISOString(), revision: current.revision + 1 }
    let items = data.items, movements = data.movements
    if (action === 'restock') {
      const item = items.find(value => value.id === current.itemId)
      if (!item || !purchase) throw new Error('请先关联已保存的用品。')
      if (item.revision !== purchase.itemRevision) throw new Error('用品已变化，请刷新后确认补货。')
      const quantity = item.quantity + purchase.amount
      if (quantity > 999999) throw new Error('补货数量超过上限。')
      const updated: Item = { ...item, quantity, revision: item.revision + 1 }
      for (const key of ['priceCents', 'priceUnit', 'expiresOn', 'openedOn'] as const) {
        if (key in purchase) Object.assign(updated, { [key]: purchase[key] })
      }
      items = items.map(value => value.id === item.id ? updated : value)
      movements = [{ id: newId(), itemId: item.id, kind: 'restock', amount: purchase.amount, balance: quantity, note: '待购清单补货', occurredOn: purchase.occurredOn, createdAt: completed.completedAt!, shoppingId: entry.id }, ...movements]
      completed.purchase = purchase
    }
    const result = { entry: completed }
    saveDemo({ ...data, items, movements, shopping: action === 'delete' ? data.shopping!.filter(value => value.id !== entry.id) : data.shopping!.map(value => value.id === entry.id ? completed : value), actions: [...(data.actions || []), { id, fingerprint, result }] })
    return result
  }, `/shopping/${entry.id}/actions`, { id, revision: entry.revision, action, ...(purchase ? { purchase } : {}) })
}
