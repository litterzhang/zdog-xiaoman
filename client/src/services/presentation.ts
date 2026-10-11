import type { Baby, Category, Item, ItemDraft } from '../types/domain'
import { catalogProviders } from '../config/catalog'
import { cleanDetails, validateDetails, validBarcode } from './itemForms'

export const categories: { id: Category; label: string; unit: string; symbol: string }[] = [
  { id: 'formula', label: '奶粉', unit: 'g', symbol: 'formula' },
  { id: 'diapers', label: '纸尿裤', unit: '片', symbol: 'diapers' },
  { id: 'feeding', label: '喂养', unit: '个', symbol: 'bottle' },
  { id: 'cleaning', label: '清洁', unit: '包', symbol: 'cleaning' },
  { id: 'care', label: '护理', unit: '件', symbol: 'care' },
  { id: 'clothing', label: '衣物', unit: '件', symbol: 'clothing' },
  { id: 'travel', label: '出行', unit: '件', symbol: 'travel' },
  { id: 'other', label: '其他', unit: '件', symbol: 'other' },
]
export function today(): string {
  // Business dates match the server's Asia/Shanghai calendar, without parsing local midnights.
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '2100-12-31') return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)
}
export function babyGreeting(baby: Baby, day = today()): { title: string; metric: string; label: string } {
  const days = daysBetween(day, baby.date)
  if (baby.status === 'born') return { title: `${baby.name}，慢慢长大`, metric: String(1 - days), label: '相伴 / 天' }
  return { title: `期待${baby.name}的到来`, metric: days > 0 ? String(days) : '待相见', label: days > 0 ? '距离预产期 / 天' : '每一天，都在期待' }
}
export interface Reminder { kind: 'expired' | 'expiring' | 'low'; label: string; detail: string }
export function reminders(item: Item, day = today()): Reminder[] {
  const result: Reminder[] = []
  // Empty stock should not generate an expiry reminder.
  if (item.expiresOn && item.quantity > 0) {
    const days = daysBetween(day, item.expiresOn)
    if (days < 0) result.push({ kind: 'expired', label: '已过期', detail: `有效期 ${item.expiresOn}` })
    else if (days <= 30) result.push({ kind: 'expiring', label: days === 0 ? '今天到期' : `${days} 天后到期`, detail: `有效期 ${item.expiresOn}` })
  }
  if (item.quantity <= item.lowStock) result.push({ kind: 'low', label: item.quantity === 0 ? '已用完' : '余量偏少', detail: `剩余 ${item.quantity} ${item.unit} · 提醒线 ${item.lowStock} ${item.unit}` })
  return result
}
export function formatTimestamp(value: string): string {
  const instant = Date.parse(value)
  return Number.isFinite(instant)
    ? new Date(instant + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ')
    : '日期未记录'
}
export function readableError(error: unknown): string {
  return error instanceof Error ? error.message : '操作未完成，请稍后重试。'
}
export function validateBaby(baby: Baby): string {
  if (!baby.name.trim() || baby.name.trim().length > 24) return '请填写宝宝昵称，最多 24 字。'
  if (!['expected', 'born'].includes(baby.status) || !validDate(baby.date)) return '请选择有效日期。'
  if (baby.status === 'born' && baby.date > today()) return '出生日期不能晚于今天。'
  return ''
}
export function normalizeItemDraft(item: ItemDraft): ItemDraft {
  // Whitelist writable fields: an Item used as a draft also contains server-owned metadata.
  return {
    name: item.name.trim(), category: item.category, unit: item.unit.trim(),
    quantity: item.quantity, lowStock: item.lowStock, expiresOn: item.expiresOn,
    openedOn: item.openedOn, notes: item.notes.trim(),
    ...(item.details !== undefined ? { details: cleanDetails(item.details) } : {}),
    ...(item.catalogSource !== undefined ? { catalogSource: item.catalogSource } : {}),
    ...(item.barcode !== undefined ? { barcode: item.barcode?.trim() || null } : {}),
    ...(item.priceCents !== undefined ? { priceCents: item.priceCents, priceUnit: item.priceCents === null ? null : item.priceUnit?.trim() } : {}),
  }
}
export function validateItem(item: ItemDraft): string {
  if (!item.name.trim() || item.name.trim().length > 60) return '请填写用品名称，最多 60 字。'
  if (!item.unit.trim() || item.unit.trim().length > 8) return '请填写计量单位，最多 8 字。'
  if (!categories.some(category => category.id === item.category)) return '请选择用品分类。'
  if (![item.quantity, item.lowStock].every(value => Number.isInteger(value) && value >= 0 && value <= 999999)) return '数量须为 0 到 999999 之间的整数。'
  if ([item.expiresOn, item.openedOn].some(value => value !== null && !validDate(value))) return '请选择有效日期。'
  if (item.openedOn && item.openedOn > today()) return '开封日期不能晚于今天。'
  if (item.notes.length > 500) return '备注不能超过 500 字。'
  if (item.barcode != null && !validBarcode(item.barcode)) return '商品条码须为 1 到 80 个有效字符。'
  if (item.priceCents != null && (!Number.isInteger(item.priceCents) || item.priceCents < 0 || item.priceCents > 99999999 || !item.priceUnit?.trim() || item.priceUnit.trim().length > 8)) return '请填写有效购入单价与价格单位，金额最多两位小数。'
  if (item.catalogSource && (item.catalogSource.barcode !== item.barcode || !Object.prototype.hasOwnProperty.call(catalogProviders, item.catalogSource.provider))) return '商品资料来源与条码不匹配。'
  return validateDetails(item)
}
