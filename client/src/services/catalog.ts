import type { CatalogLookup } from '../types/domain'
import { request } from './transport'
import { authenticatedRequest, getSession, openLogin } from './session'
import { ApiError } from './transport'
import { validCatalogBarcode } from './catalogPresentation'

export async function lookupCatalog(code: string): Promise<CatalogLookup> {
  if (!validCatalogBarcode(code)) throw new Error('商品查询支持 8、12、13 或 14 位数字条码；其他编码仍可手动保存。')
  const session = getSession()
  try {
    // A token goes only to our API; authenticated parents may use the server supplier key.
    const path = `/catalog/products/${encodeURIComponent(code)}`
    return session?.mode === 'live'
      ? await authenticatedRequest<CatalogLookup>(session, path, undefined, 35000)
      : await request<CatalogLookup>(path, undefined, undefined, 35000)
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && session?.mode === 'live' && !getSession()) {
      await openLogin()
    }
    throw error
  }
}
