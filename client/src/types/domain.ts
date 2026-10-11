export type BabyStatus = 'expected' | 'born'
export interface Baby { name: string; status: BabyStatus; date: string }
export type Category = 'formula' | 'diapers' | 'feeding' | 'cleaning' | 'care' | 'clothing' | 'travel' | 'other'
export interface ItemDetails {
  brand?: string; stage?: string; netWeightGrams?: number
  size?: string; piecesPerPack?: number; capacityMl?: number
  material?: string; volumeMl?: number; model?: string
}
export type CatalogProvider = 'apizero' | 'gs1' | 'food' | 'products' | 'beauty'
export interface CatalogSource { provider: CatalogProvider; barcode: string; fetchedAt: string }
export interface CatalogSuggestion {
  name: string; category: Category | null; quantity: string; details: ItemDetails; nameComplete?: boolean
  source: CatalogSource; sourceUrl: string
}
export interface CatalogLookup {
  barcode: string; suggestions: CatalogSuggestion[]; cached: boolean; complete?: boolean
  providers: { provider: CatalogProvider; status: 'found' | 'not_found' | 'unavailable' | 'limited' | 'restricted' | 'incomplete' | 'skipped' }[]
}
export interface ItemDraft {
  name: string; category: Category; unit: string; quantity: number; lowStock: number
  expiresOn: string | null; openedOn: string | null; notes: string; details?: ItemDetails
  barcode?: string | null; priceCents?: number | null; priceUnit?: string | null; catalogSource?: CatalogSource | null
}
export interface Item extends ItemDraft { id: string; revision: number; createdAt: string }
export interface Movement {
  id: string; itemId: string; kind: 'initial' | 'restock' | 'use' | 'undo'
  amount: number; balance: number; note: string; createdAt: string; occurredOn?: string
  batchId?: string; voidedAt?: string; correctionId?: string; originalId?: string; replacesId?: string
  excludeFromForecast?: boolean; shoppingId?: string
}
export interface Snapshot { baby: Baby | null; items: Item[]; usage?: Movement[] }
export interface DemoData extends Snapshot { movements: Movement[]; batches?: UsageBatch[]; shopping?: ShoppingEntry[]; actions?: LocalAction[] }
export type Session = { mode: 'demo' } | { mode: 'live'; token: string; userId?: string }
export interface UsageEntry { itemId: string; amount: number; note: string }
export interface UsageRecord extends Movement { itemName: string; unit: string; category: Category }
export interface UsageBatch { id: string; fingerprint: string; movements: Movement[] }

export interface UsageReplacement { amount: number; occurredOn: string; note: string }
export interface CorrectionTarget { movementId?: string; batchId?: string }
export interface LocalAction { id: string; fingerprint: string; result: unknown }
export interface ShoppingDraft { itemId: string | null; name: string; plannedQuantity: number; plannedUnit: string; note: string }
export interface ShoppingEntry extends ShoppingDraft { id: string; revision: number; status: 'pending' | 'done'; createdAt: string; completedAt?: string; purchase?: Purchase }
export interface Purchase { amount: number; itemRevision: number; occurredOn: string; priceCents?: number | null; priceUnit?: string | null; expiresOn?: string | null; openedOn?: string | null }
export interface Forecast { days: number | null; dailyAverage: number | null; recordedDays: number; spanDays: number; label: string }
