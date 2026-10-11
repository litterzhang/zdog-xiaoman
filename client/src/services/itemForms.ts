import { itemForms } from '../config/itemForms'
import type { ItemDraft, ItemDetails } from '../types/domain'

export interface QuantityOption { unit: string; factor: number }

export function quantityOptions(item: ItemDraft): QuantityOption[] {
  const result = [{ unit: item.unit, factor: 1 }]
  const weight = item.details?.netWeightGrams
  const pieces = item.details?.piecesPerPack
  if (item.category === 'formula' && item.unit === 'g' && Number.isInteger(weight) && weight! > 0) {
    result.push({ unit: '罐', factor: weight! })
  }
  if (item.category === 'diapers' && item.unit === '片' && Number.isInteger(pieces) && pieces! > 0) {
    result.push({ unit: '包', factor: pieces! })
  }
  return result
}

// Fixed-point parsing avoids floating-point stock drift; storage remains integer grams/pieces.
export function parseQuantity(value: string, item: ItemDraft, inputUnit = item.unit): number {
  const option = quantityOptions(item).find(candidate => candidate.unit === inputUnit)
  const match = /^(\d{1,6})(?:\.(\d{1,3}))?$/.exec(value.trim())
  if (!option || !match || (match[2] && !(item.category === 'formula' && item.unit === 'g' && inputUnit === '罐'))) return NaN
  const scale = 10 ** (match[2]?.length || 0)
  const raw = Number(match[1]) * scale + Number(match[2] || 0)
  const numerator = raw * option.factor
  if (!Number.isSafeInteger(numerator) || numerator % scale !== 0) return NaN
  const quantity = numerator / scale
  return quantity <= 999999 ? quantity : NaN
}

export function validateDetails(item: ItemDraft): string {
  if (item.details === undefined) return ''
  if (!item.details || typeof item.details !== 'object' || Array.isArray(item.details)) return '请检查分类信息。'
  const fields = itemForms[item.category]?.fields || []
  for (const [key, value] of Object.entries(item.details)) {
    const field = fields.find(candidate => candidate.key === key)
    if (!field) return '分类信息不匹配，请重新选择分类。'
    if (field.kind === 'number') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > 999999) return `${field.label}须为大于 0 的整数。`
    } else if (typeof value !== 'string' || !value.trim() || value.trim().length > 40 || (field.options && !field.options.includes(value))) {
      return `请检查${field.label}。`
    }
  }
  return ''
}

export function cleanDetails(details: ItemDetails): ItemDetails {
  return Object.fromEntries(Object.entries(details).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]))
}

export function itemSpecifications(item: ItemDraft): { label: string; value: string }[] {
  return itemForms[item.category].fields.flatMap(field => {
    const value = item.details?.[field.key]
    if (value === undefined) return []
    return [{ label: field.label.replace('（选填）', ''), value: String(value) }]
  })
}

export function quantityHint(value: number, item: ItemDraft): string {
  const packageUnit = quantityOptions(item)[1]
  if (!packageUnit || !Number.isFinite(value)) return ''
  return `约 ${Number((value / packageUnit.factor).toFixed(2))} ${packageUnit.unit}`
}

export function parsePrice(value: string): number | null {
  if (!value.trim()) return null
  const match = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(value.trim())
  return match ? Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0')) : NaN
}

export function formatPrice(cents: number): string { return (cents / 100).toFixed(2) }

export function validBarcode(value: string): boolean {
  // Preserve leading zeroes; store the identifier, never execute barcode contents.
  return /^[\x20-\x7e]{1,80}$/.test(value) && !!value.trim()
}
