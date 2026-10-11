import { Button, Input, Picker, Text, View } from '@tarojs/components'
import { itemForms } from '../config/itemForms'
import { parseQuantity, quantityOptions } from '../services/itemForms'
import type { ItemDetails, ItemDraft } from '../types/domain'

export function ItemFields({ draft, disabled, onChange }: { draft: ItemDraft; disabled: boolean; onChange: (details: ItemDetails) => void }) {
  function update(key: keyof ItemDetails, value: string | number | undefined) {
    const details = { ...draft.details }
    if (value === undefined || value === '') delete details[key]
    else Object.assign(details, { [key]: value })
    onChange(details)
  }
  return <>{itemForms[draft.category].fields.map(field => <View className='field' key={field.key}>
    <Text className='field__label'>{field.label}</Text>
    {field.kind === 'choice' ? <View className='row'>
      <Picker className='grow' mode='selector' range={field.options!} value={Math.max(0, field.options!.indexOf(String(draft.details?.[field.key] || '')))} disabled={disabled} onChange={event => update(field.key, field.options![Number(event.detail.value)])}>
        <View className={`field__date ${draft.details?.[field.key] ? '' : 'muted'}`}>{draft.details?.[field.key] || '选择'}</View>
      </Picker>
      {draft.details?.[field.key] && <Button className='text-button' disabled={disabled} onClick={() => update(field.key, undefined)}>清除</Button>}
    </View> : <Input className='field__input' type={field.kind === 'number' ? 'number' : 'text'} maxlength={field.kind === 'number' ? 6 : 40} disabled={disabled} value={String(draft.details?.[field.key] ?? '')} placeholder={field.placeholder} onInput={event => update(field.key, field.kind === 'number' && event.detail.value ? Number(event.detail.value) : event.detail.value)} />}
  </View>)}</>
}

export function QuantityField({ label, item, value, inputUnit, disabled, onChange, onUnitChange }: {
  label: string; item: ItemDraft; value: string; inputUnit: string; disabled: boolean
  onChange: (value: string) => void; onUnitChange: (unit: string) => void
}) {
  const options = quantityOptions(item)
  const effectiveUnit = options.some(option => option.unit === inputUnit) ? inputUnit : item.unit
  const amount = parseQuantity(value, item, effectiveUnit)
  return <View className='field'>
    <View className='row between'><Text className='field__label'>{label} / {effectiveUnit}</Text>
      {options.length > 1 && <View className='row item__quantity-units'>{options.map(option => <Button key={option.unit} disabled={disabled} className={`segment__button ${effectiveUnit === option.unit ? 'segment__button--active' : ''}`} onClick={() => onUnitChange(option.unit)}>{option.unit}</Button>)}</View>}
    </View>
    <Input className='field__input' type={effectiveUnit === '罐' && item.unit === 'g' ? 'digit' : 'number'} maxlength={10} disabled={disabled} value={value} placeholder={effectiveUnit === '罐' && item.unit === 'g' ? '例如 0.5' : '填写数量'} onInput={event => onChange(event.detail.value)} />
    {effectiveUnit !== item.unit && <Text className='block small muted'>{Number.isFinite(amount) ? `计入库存：${amount} ${item.unit}` : '请输入可换算成整克 / 整片的有效数量'}</Text>}
  </View>
}
