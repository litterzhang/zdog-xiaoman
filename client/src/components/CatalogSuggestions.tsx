import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { catalogProviders } from '../config/catalog'
import { catalogSourceUrl } from '../services/catalogPresentation'
import type { CatalogLookup, CatalogSource } from '../types/domain'
import './CatalogSuggestions.scss'

export function CatalogReference({ source }: { source: CatalogSource }) {
  async function copy() {
    try { await Taro.setClipboardData({ data: catalogSourceUrl(source) }) }
    catch { void Taro.showToast({ title: '复制未完成，请稍后重试', icon: 'none' }) }
  }
  return <View className='catalog-reference'>
    <Text className='block small muted'>参考来源：{catalogProviders[source.provider].name}</Text>
    <Button className='text-button' onClick={() => { void copy() }}>复制来源链接</Button>
  </View>
}

export function CatalogSuggestions({ result }: { result: CatalogLookup }) {
  const unavailable = result.providers.some(provider => ['unavailable', 'restricted', 'limited', 'incomplete'].includes(provider.status))
  const partialName = result.suggestions[0]?.nameComplete === false
  const message = partialName ? '目前只有品牌或部分规格，未取得完整商品名，请补充；库存与手填内容不变。' : result.suggestions.length
    ? `${result.cached ? '已从本地商品缓存读取' : '已查询到商品资料'}，自动补充空白名称和规格；请核对后保存。`
    : unavailable ? '部分商品源暂不可用或额度不足，暂未取到完整资料；已填内容保留，可以手动填写。'
      : '暂未找到商品资料，已填内容保留，可以继续手动填写。'
  return <View className='catalog-results'>
    <Text className='notice'>{message}</Text>
    {result.suggestions[0] && <Text className='block catalog-result__name'>{partialName ? '条码资料' : '条码商品'}：{result.suggestions[0].name}</Text>}
    <Text className='block small muted'>商品资料仅供参考。库存、购入单价、有效期与开封日期不会自动填写。</Text>
  </View>
}
