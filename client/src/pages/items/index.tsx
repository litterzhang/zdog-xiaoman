import { GuestOverview } from '../../components/GuestOverview'
import { ShoppingList } from '../../components/ShoppingList'
import { useState } from 'react'
import { Button, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useSnapshot } from '../../hooks/useSnapshot'
import { DemoNote, ItemRow, LoadState } from '../../components/Shared'
import { categories, reminders } from '../../services/presentation'
import { isArchived } from '../../services/usage'
import type { Category } from '../../types/domain'
import './index.scss'

export default function ItemsPage() {
  const state = useSnapshot(true, true)
  const [shopping, setShopping] = useState(false)
  const [filter, setFilter] = useState<Category | 'all'>('all')
  const [query, setQuery] = useState('')
  const [archive, setArchive] = useState(false)
  const [attentionOnly, setAttentionOnly] = useState(false)
  const items = (state.data?.items || []).filter(item =>
    isArchived(item) === archive && (filter === 'all' || item.category === filter) && item.name.toLowerCase().includes(query.trim().toLowerCase()) && (!attentionOnly || reminders(item).length > 0))
  return <View className='page'>
    {state.demo && <DemoNote />}
    <LoadState loading={state.loading} error={state.error} retry={() => { void state.reload() }} />
    {!state.loading && state.guest && <GuestOverview section='items' />}
    {!state.loading && state.data && <>
      <View className='card'><View className='segment'>
        <Button className={`segment__button ${!shopping ? 'segment__button--active' : ''}`} onClick={() => setShopping(false)}>库存</Button>
        <Button className={`segment__button ${shopping ? 'segment__button--active' : ''}`} onClick={() => setShopping(true)}>待购</Button>
      </View></View>
      {shopping ? <ShoppingList items={state.data.items} onChanged={state.reload} /> : <>
      <View className='card'>
        <View className='row'><Input className='field__input items__search grow' placeholder='搜索用品名称' value={query} maxlength={60} onInput={event => setQuery(event.detail.value)} /><Button className='text-button' onClick={() => { void Taro.navigateTo({ url: '/pages/item/index' }) }}>添加用品</Button></View>
        <View className='segment items__filters'>{[{ id: 'all' as const, label: '全部' }, ...categories].map(category => <Button key={category.id} className={`segment__button ${filter === category.id ? 'segment__button--active' : ''}`} onClick={() => setFilter(category.id)}>{category.label}</Button>)}</View>
      </View>
      <View className='card card--flush'>
        <Button className='menu-row' onClick={() => { void Taro.navigateTo({ url: '/pages/usage/index' }) }}><Text>每日使用 · 逐件添加，一次提交</Text><Text className='menu-arrow'>›</Text></Button>
        <Button className='menu-row' onClick={() => { setArchive(!archive); setAttentionOnly(false) }}><Text>{archive ? '返回在用用品' : '查看已用完归档'}</Text><Text className='menu-arrow'>›</Text></Button>
      </View>
      <View className='card card--flush'>
        <View className='row between card-label'><Text className='small muted'>{items.length} 件{archive ? '已归档' : '在用'}用品</Text><Button className='text-button' onClick={() => setAttentionOnly(!attentionOnly)}>{attentionOnly ? '查看全部' : '只看提醒'}</Button></View>
        {items.length ? items.map(item => <ItemRow key={item.id} item={item} showReminder usage={state.data?.usage} />) : <View className='empty'>
          <Text className='empty__title'>{state.data.items.length ? '没有符合条件的用品' : '还没有记录用品'}</Text>
          <Text className='empty__body'>{state.data.items.length ? '换一个分类或搜索词试试。' : '把余量和日期记下来，日常更从容。'}</Text>
          {!state.data.items.length && <Button className='text-button text-button--center' onClick={() => { void Taro.navigateTo({ url: '/pages/item/index' }) }}>添加第一件</Button>}
        </View>}
      </View>
      <Text className='footer-note'>用完后自动归档，补货后恢复在用。不同单位不合计。</Text>
      </>}
    </>}
  </View>
}
