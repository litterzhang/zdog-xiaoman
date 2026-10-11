import type { CatalogProvider } from '../types/domain'

export const catalogProviders: Record<CatalogProvider, { name: string; origin: string }> = {
  apizero: { name: 'ApiZero 商品反查', origin: 'https://apizero.cn/marketplace/barcode-lookup' },
  gs1: { name: 'ApiZero GS1 登记资料', origin: 'https://apizero.cn/marketplace/barcode-gs1' },
  food: { name: 'Open Food Facts', origin: 'https://world.openfoodfacts.org' },
  products: { name: 'Open Products Facts', origin: 'https://world.openproductsfacts.org' },
  beauty: { name: 'Open Beauty Facts', origin: 'https://world.openbeautyfacts.org' },
}
