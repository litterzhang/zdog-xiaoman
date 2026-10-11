import { useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { Category } from '../types/domain'
import { brand } from '../config/brand'
import { categories } from '../services/presentation'
import { openLogin, startDemo } from '../services/session'
import './GuestOverview.scss'

/** Public product browsing contains no authentication or private API calls. */
export function GuestOverview({ section = 'home' }: { section?: 'home' | 'items' | 'account' }) {
  const [filter, setFilter] = useState<Category | 'all'>('all')
  const selectedCategory = categories.find(category => category.id === filter)
  async function beginLocal() {
    startDemo()
    await Taro.navigateTo({ url: '/pages/onboarding/index' })
  }
  return <>
    <View className='card card--welcome'>
      <Text className='welcome-title'>{section === 'account' ? '记录，由你决定' : brand.slogan}</Text>
      <Text className='welcome-desc'>无需登录，先看看宝宝用品如何记录。</Text>
    </View>
    {section !== 'account' && <>
      <View className='card'>
        <Text className='section-title'>用品与余量</Text>
        <Text className='block small muted'>按分类管理用品，记录余量与日期。</Text>
        <View className='segment guest__filters'>{[{ id: 'all' as const, label: '全部' }, ...categories].map(category => <Button key={category.id} className={`segment__button ${filter === category.id ? 'segment__button--active' : ''}`} onClick={() => setFilter(category.id)}>{category.label}</Button>)}</View>
      </View>
      <View className='card empty'>
        <Text className='empty__title'>{selectedCategory ? `还没有记录${selectedCategory.label}用品` : '还没有记录用品'}</Text>
        <Text className='empty__body'>开始本地记录或自愿登录后，可添加自己的用品。这里不展示示例库存。</Text>
      </View>
      <View className='card'>
        <Text className='section-title'>每日使用，一次记好</Text>
        <Text className='block small muted'>将使用的用品逐件加入清单，再一次提交；库存随之扣减，用完自动归档。</Text>
        <Text className='block small muted'>支持补货、价格、有效期和开封日期，也可选择扫码补全商品资料。</Text>
      </View>
    </>}
    <View className='card'>
      <Text className='section-title'>不登录，也可以完整体验</Text>
      <Text className='block small muted'>本地记录只保存在当前设备，不上传、不自动同步到账号。清除缓存后可能丢失。</Text>
      <Button className='text-button' onClick={() => { void beginLocal() }}>无需登录，开始本地记录</Button>
    </View>
    {section === 'account' && <View className='card card--flush'>
      <Button className='menu-row' onClick={() => { void openLogin() }}><Text>自愿登录，使用账号记录</Text><Text className='menu-arrow'>›</Text></Button>
    </View>}
    <Text className='footer-note'>登录为可选项，不要求授权手机号、头像或微信昵称。</Text>
  </>
}
