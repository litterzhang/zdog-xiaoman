import { catalogProviders } from '../config/catalog'
import { itemForms } from '../config/itemForms'
import { categories } from './presentation'
import type { CatalogSource, CatalogSuggestion, Item, ItemDraft } from '../types/domain'

export function catalogSourceUrl(source: CatalogSource): string {
  const origin = catalogProviders[source.provider].origin
  return source.provider === 'apizero' || source.provider === 'gs1' ? origin : `${origin}/product/${source.barcode}`
}
export function validCatalogBarcode(code: string): boolean { return /^(?:[0-9]{8}|[0-9]{12,14})$/.test(code) }
function normalizedName(value: string): string { return value.replace(/\s+/g, '').toLowerCase() }

export function isGenericProductName(name: string, brand?: string): boolean {
  const value = normalizedName(name)
  return !value || (!!brand && value === normalizedName(brand)) || categories.some(category => {
    const label = normalizedName(category.label)
    return value === label || (!!brand && (value === normalizedName(brand) + label || value === label + normalizedName(brand)))
  })
}

export function needsCatalogName(item: Pick<ItemDraft, 'name' | 'details'>): boolean {
  // A brand-only local record is not a complete SKU identity.
  return isGenericProductName(item.name, item.details?.brand) || !item.details?.brand
}

function productName(draft: ItemDraft, suggestion: Pick<CatalogSuggestion, 'name' | 'details'>): string {
  if (!suggestion.name.trim()) return draft.name
  const currentGeneric = isGenericProductName(draft.name, suggestion.details.brand) || isGenericProductName(draft.name, draft.details?.brand)
  const incomingGeneric = isGenericProductName(suggestion.name, suggestion.details.brand)
  if (incomingGeneric) return draft.name
  return currentGeneric ? suggestion.name : draft.name
}

function applySpecification(draft: ItemDraft, suggestion: Pick<CatalogSuggestion, 'name' | 'category' | 'details'>, editing: boolean): ItemDraft {
  const category = editing ? draft.category : suggestion.category || draft.category
  const changed = category !== draft.category
  const fields = itemForms[category].fields
  const details = changed ? {} : { ...draft.details }
  for (const field of fields) {
    if (details[field.key] === undefined && suggestion.details[field.key] !== undefined) {
      Object.assign(details, { [field.key]: suggestion.details[field.key] })
    }
  }
  return {
    ...draft, name: productName(draft, suggestion), category, details,
    unit: changed ? categories.find(value => value.id === category)!.unit : draft.unit,
    quantity: changed ? 0 : draft.quantity, lowStock: changed ? 0 : draft.lowStock,
    // No imported product field can set price, inventory or private business dates.
  }
}

export function applyCatalogSuggestion(draft: ItemDraft, suggestion: CatalogSuggestion, editing: boolean): ItemDraft {
  return { ...applySpecification(draft, suggestion, editing), barcode: suggestion.source.barcode, catalogSource: suggestion.source }
}
export function applyOwnSpecification(draft: ItemDraft, item: Item, editing: boolean): ItemDraft {
  return { ...applySpecification(draft, { name: item.name, category: item.category, details: item.details || {} }, editing), barcode: item.barcode, catalogSource: item.catalogSource || null }
}
