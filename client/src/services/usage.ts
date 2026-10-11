import type { Item, Movement, UsageEntry } from '../types/domain'
import { formatTimestamp, today, validDate } from './presentation'

export function isArchived(item: Item): boolean { return item.quantity === 0 }
export function movementDay(movement: Movement): string {
  return movement.occurredOn || formatTimestamp(movement.createdAt).slice(0, 10)
}
export function validateUsageDay(day: string): void {
  if (!validDate(day) || day > today()) throw new Error('使用日期须为今天或之前的有效日期。')
}
export function prepareCheckout(items: Item[], entries: UsageEntry[]): { item: Item; entry: UsageEntry }[] {
  if (!entries.length || entries.length > 50) throw new Error('请添加 1 到 50 件用品。')
  const seen = new Set<string>()
  return entries.map(entry => {
    if (seen.has(entry.itemId)) throw new Error('同一件用品请合并数量后提交。')
    seen.add(entry.itemId)
    const item = items.find(value => value.id === entry.itemId)
    if (!item) throw new Error('清单中的用品已不存在，请重新选择。')
    if (!Number.isInteger(entry.amount) || entry.amount <= 0 || entry.amount > 999999 || entry.note.length > 200) throw new Error('请检查使用数量与备注。')
    if (entry.amount > item.quantity) throw new Error(`${item.name} 库存不足，当前剩余 ${item.quantity} ${item.unit}。`)
    return { item: { ...item, quantity: item.quantity - entry.amount, revision: item.revision + 1 }, entry }
  })
}
