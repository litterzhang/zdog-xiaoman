import type { CorrectionTarget, DemoData, Forecast, Item, LocalAction, Movement, ShoppingDraft, UsageReplacement } from '../types/domain'
import { daysBetween, today, validDate } from './presentation'
import { movementDay, validateUsageDay } from './usage'

/** Estimates never use voided records, fictional data, or another item's units. */
export function consumptionForecast(item: Item, movements: Movement[], day = today()): Forecast {
  const recent = movements.filter(record => record.itemId === item.id && record.kind === 'use' && !record.voidedAt && daysBetween(movementDay(record), day) >= 0 && daysBetween(movementDay(record), day) <= 13)
  const excluded = new Set(recent.filter(record => record.excludeFromForecast).map(movementDay))
  const eligible = recent.filter(record => !excluded.has(movementDay(record)))
  const recorded = [...new Set(eligible.map(movementDay))].sort()
  const insufficient: Forecast = { days: null, dailyAverage: null, recordedDays: recorded.length, spanDays: 0, label: '记录至少 3 天后可估算' }
  if (recorded.length < 3) return insufficient
  if (daysBetween(recorded[recorded.length - 1], day) > 7) return { ...insufficient, label: '近期记录不足，暂不估算' }
  const span = daysBetween(recorded[0], day) + 1 - [...excluded].filter(value => value >= recorded[0] && value <= day).length
  const total = eligible.reduce((sum, record) => sum + record.amount, 0)
  if (span <= 0 || total <= 0) return insufficient
  const dailyAverage = total / span
  const days = Math.ceil(item.quantity / dailyAverage)
  return { days, dailyAverage, recordedDays: recorded.length, spanDays: span, label: item.quantity === 0 ? '已用完' : `预计还能用约 ${days} 天` }
}

export function validateReplacement(replacement: UsageReplacement) {
  validateUsageDay(replacement.occurredOn)
  if (!Number.isInteger(replacement.amount) || replacement.amount <= 0 || replacement.amount > 999999 || replacement.note.length > 200) throw new Error('请检查更正数量与备注。')
}

/** Prepare copies of all affected records before changing device storage. */
export function prepareCorrection(data: DemoData, target: CorrectionTarget, operationId: string, createdAt: string, id: () => string, replacement?: UsageReplacement): { items: Item[]; movements: Movement[] } {
  if (!!target.movementId === !!target.batchId || (replacement && !target.movementId)) throw new Error('请选择有效使用记录。')
  if (replacement) validateReplacement(replacement)
  if (target.batchId) {
    const batch = data.batches?.find(value => value.id === target.batchId)
    if (!batch) throw new Error('使用批次不存在。')
    if (batch.movements.some(record => !data.items.some(item => item.id === record.itemId))) throw new Error('用品已删除，整批未修改。')
  }
  const selected = target.batchId
    ? data.movements.filter(record => record.batchId === target.batchId && record.kind === 'use' && !record.voidedAt)
    : data.movements.filter(record => record.id === target.movementId)
  if (!selected.length || selected.some(record => record.kind !== 'use' || record.voidedAt)) throw new Error('使用记录不存在或已更正，请刷新。')
  const balances = new Map<string, Item>()
  for (const record of selected) {
    let item = balances.get(record.itemId)
    if (!item) {
      const current = data.items.find(value => value.id === record.itemId)
      if (!current) throw new Error('用品已删除，整批未修改。')
      item = { ...current, revision: current.revision + 1 }; balances.set(item.id, item)
    }
    item.quantity += record.amount
  }
  if (replacement) balances.get(selected[0].itemId)!.quantity -= replacement.amount
  if ([...balances.values()].some(item => item.quantity < 0 || item.quantity > 999999)) throw new Error('更正后的库存不足或超过上限，整批未修改。')
  const changed = new Map(selected.map(record => [record.id, { ...record, voidedAt: createdAt, correctionId: operationId }]))
  const appended: Movement[] = selected.map(record => ({
    id: id(), itemId: record.itemId, kind: 'undo', amount: record.amount,
    balance: balances.get(record.itemId)!.quantity + (replacement ? replacement.amount : 0),
    note: replacement ? '更正恢复' : '撤销使用', originalId: record.id, createdAt,
  }))
  if (replacement) {
    const source = selected[0]
    appended.unshift({ id: id(), itemId: source.itemId, kind: 'use', ...replacement,
      balance: balances.get(source.itemId)!.quantity, createdAt, replacesId: source.id,
      ...(source.batchId ? { batchId: source.batchId } : {}),
      ...(source.excludeFromForecast ? { excludeFromForecast: true } : {}),
    })
  }
  return { items: data.items.map(item => balances.get(item.id) || item), movements: [...appended, ...data.movements.map(record => changed.get(record.id) || record)] }
}

export function validateShopping(draft: ShoppingDraft) {
  if (!draft.name.trim() || draft.name.trim().length > 60 || !draft.plannedUnit.trim() || draft.plannedUnit.trim().length > 8 || !Number.isInteger(draft.plannedQuantity) || draft.plannedQuantity <= 0 || draft.plannedQuantity > 999999 || draft.note.length > 200) throw new Error('请检查待购名称、数量、单位与备注。')
}

export function localAction(data: DemoData, id: string, fingerprint: string): LocalAction | undefined {
  const previous = data.actions?.find(action => action.id === id)
  if (previous && previous.fingerprint !== fingerprint) throw new Error('操作编号已使用，请重新操作。')
  return previous
}
export function validatePurchaseDates(purchase: { occurredOn: string; openedOn?: string | null; expiresOn?: string | null }) {
  validateUsageDay(purchase.occurredOn)
  if (purchase.openedOn) validateUsageDay(purchase.openedOn)
  if (purchase.expiresOn && !validDate(purchase.expiresOn)) throw new Error('请选择有效日期。')
}
