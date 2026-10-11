import { GuestOverview } from '../../components/GuestOverview'
import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useSnapshot } from '../../hooks/useSnapshot'
import { DemoNote, ItemRow, LoadState } from '../../components/Shared'
import { babyGreeting, reminders } from '../../services/presentation'
import { isArchived } from '../../services/usage'
import { brand } from '../../config/brand'
import './index.scss'

export default function HomePage() {
  const state = useSnapshot(true, true)
  const baby = state.data?.baby
  const greeting = baby ? babyGreeting(baby) : null
  const items = (state.data?.items || []).filter(item => !isArchived(item))
  const attention = items.filter(item => reminders(item).length > 0)
  return <View className='page home'>
    {state.demo && <DemoNote />}
    <LoadState loading={state.loading} error={state.error} retry={() => { void state.reload() }} />
    {!state.loading && state.guest && <GuestOverview section='home' />}
    {!state.loading && baby && greeting && <>
      <View className='card card--welcome'>
        <Text className='welcome-title'>{greeting.title}</Text>
        <Text className='welcome-desc'>{baby.status === 'expected' ? brand.expectedSubtitle : brand.bornSubtitle}</Text>
        <View className='home__time'><Text className='home__metric'>{greeting.metric}</Text><Text className='small muted'>{greeting.label}</Text></View>
        <Text className='block home__date'>{baby.status === 'expected' ? '预产期' : '出生于'} {baby.date}</Text>
      </View>
      <View className='card card--flush'>
        <View className='home__stats'>
          <View><Text className='home__stat-number'>{items.length}</Text><Text className='small muted'>在用用品</Text></View>
          <View><Text className='home__stat-number'>{attention.length}</Text><Text className='small muted'>需要留意</Text></View>
        </View>
        <Button className='menu-row' onClick={() => { void Taro.navigateTo({ url: '/pages/item/index' }) }}><Text>添加用品</Text><Text className='menu-arrow'>›</Text></Button>
        <Button className='menu-row' onClick={() => { void Taro.navigateTo({ url: '/pages/usage/index' }) }}><Text>记录每日使用</Text><Text className='menu-arrow'>›</Text></Button>
      </View>
      <View className='card card--flush'>
        <View className='card-label row between'><Text className='section-title'>留意一下</Text><Text className='small muted'>库存与日期</Text></View>
        {attention.length ? attention.slice(0, 4).map(item => <ItemRow key={item.id} item={item} showReminder usage={state.data?.usage} />) : <View className='empty'>
          <Text className='empty__title'>{items.length ? '一切刚刚好' : '从第一件用品开始'}</Text>
          <Text className='empty__body'>{items.length ? '暂时没有余量或有效期提醒。' : '奶粉、纸尿裤、奶瓶，一件件慢慢备好。'}</Text>
          {!items.length && <Button className='text-button text-button--center' onClick={() => { void Taro.navigateTo({ url: '/pages/item/index' }) }}>添加第一件用品</Button>}
        </View>}
        {attention.length > 4 && <Button className='menu-row' onClick={() => { void Taro.switchTab({ url: '/pages/items/index' }) }}><Text>查看全部 {attention.length} 件</Text><Text className='menu-arrow'>›</Text></Button>}
      </View>
    </>}
  </View>
}
