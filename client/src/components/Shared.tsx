import { Button, Image, Picker, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { Item, Movement } from '../types/domain'
import { categories, reminders, today } from '../services/presentation'
import { consumptionForecast } from '../services/planning'
import { itemSpecifications } from '../services/itemForms'

export function DemoNote() { return <Text className='demo'>本地体验 · 仅保存在当前设备，不上传或同步</Text> }
export function LoadState({ loading, error, retry }: { loading: boolean; error: string; retry: () => void }) {
  if (loading) return <View className='card empty'><Text className='muted small'>正在读取日常…</Text></View>
  if (error) return <View className='card empty'><Text className='error'>{error}</Text><Button className='text-button text-button--center' onClick={retry}>重新加载</Button></View>
  return null
}
export function ItemRow({ item, showReminder = false, usage }: { item: Item; showReminder?: boolean; usage?: Movement[] }) {
  const category = categories.find(value => value.id === item.category)!
  const reminder = reminders(item)[0]
  const forecast = usage ? consumptionForecast(item, usage) : null
  return <Button className='item-row' onClick={() => { void Taro.navigateTo({ url: `/pages/item/index?id=${item.id}` }) }}>
    <View className='item-row__icon'><Image className='item-row__image' src={`/assets/tabs/${category.symbol}.png`} /></View>
    <View className='grow'><Text className='item-row__name'>{item.name}</Text><Text className='item-row__meta'>{[category.label, ...itemSpecifications(item).slice(0, 2).map(value => value.value), showReminder && reminder ? reminder.label : item.expiresOn ? `有效期 ${item.expiresOn}` : ''].filter(Boolean).join(' · ')}</Text>{forecast?.days != null && <Text className='item-row__meta'>{forecast.label}</Text>}</View>
    <View><Text className='block item-row__number'>{item.quantity}</Text><Text className='item-row__unit'>{item.unit}</Text></View>
    <Text className='item-row__arrow'>›</Text>
  </Button>
}
export function DateField({ label, value, onChange, optional = false, pastOnly = false, disabled = false }: {
  label: string; value: string | null; onChange: (value: string | null) => void
  optional?: boolean; pastOnly?: boolean; disabled?: boolean
}) {
  return <View className='field'>
    <Text className='field__label'>{label}</Text>
    <View className='row'>
      <Picker className='grow' mode='date' start='1900-01-01' end={pastOnly ? today() : '2100-12-31'} value={value || today()} disabled={disabled} onChange={event => onChange(String(event.detail.value))}>
        <View className={`field__date ${value ? '' : 'muted'}`}>{value || '选择日期'}</View>
      </Picker>
      {optional && value && <Button className='text-button field__clear' disabled={disabled} onClick={() => onChange(null)}>清除</Button>}
    </View>
  </View>
}
