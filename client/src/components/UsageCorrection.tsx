import { useRef, useState } from 'react'
import { Button, Input, Text, View } from '@tarojs/components'
import { useDialog } from './Dialog'
import { DateField } from './Shared'
import { QuantityField } from './ItemFields'
import type { Item, Movement, UsageReplacement } from '../types/domain'
import { correctUsage, excludeUsageDay, newId } from '../services/repository'
import { movementDay } from '../services/usage'
import { parseQuantity } from '../services/itemForms'
import { readableError } from '../services/presentation'
import { validateReplacement } from '../services/planning'

export function UsageCorrection({ record, item, onChanged, allowBatch = false }: {
  record: Movement; item: Item; onChanged: () => Promise<void>; allowBatch?: boolean
}) {
  const { showDialog, dialog } = useDialog()
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(String(record.amount))
  const [unit, setUnit] = useState(item.unit)
  const [day, setDay] = useState(movementDay(record))
  const [note, setNote] = useState(record.note)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const operation = useRef<{ id: string; fingerprint: string } | null>(null)
  async function change(kind: 'undo' | 'batch' | 'edit' | 'exclude') {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const replacement: UsageReplacement | undefined = kind === 'edit' ? { amount: parseQuantity(amount, item, unit), occurredOn: day, note: note.trim() } : undefined
      if (replacement) validateReplacement(replacement)
      const batch = kind === 'batch'
      const result = await showDialog({
        title: kind === 'exclude' ? (record.excludeFromForecast ? '恢复这天的估算？' : '忽略这天的估算？') : kind === 'edit' ? '更正使用记录？' : batch ? '撤销整批使用？' : '撤销这条使用？',
        content: kind === 'exclude' ? '只影响这件用品在当天的消耗估算，不修改库存和使用记录。' : kind === 'edit' ? '恢复原扣减，再按更正后的数量扣减。原记录和更正痕迹都会保留。' : batch ? '恢复这批仍有效的全部使用扣减。任一用品无法恢复时，整批不会修改。' : '恢复这条记录扣减的库存，并保留撤销痕迹。',
        confirmText: '确认',
      })
      if (!result.confirm) return
      const target = batch ? { batchId: record.batchId } : { movementId: record.id }
      const fingerprint = JSON.stringify([kind, target, replacement, record.excludeFromForecast])
      if (operation.current?.fingerprint !== fingerprint) operation.current = { id: newId(), fingerprint }
      if (kind === 'exclude') await excludeUsageDay(operation.current.id, record, !record.excludeFromForecast)
      else await correctUsage(operation.current.id, target, replacement)
      operation.current = null; setEditing(false)
      await onChanged()
    } catch (err) { setError(readableError(err)) }
    finally { lock.current = false; setBusy(false) }
  }
  if (record.kind !== 'use') return null
  if (record.voidedAt) return <Text className='block small muted'>已撤销 / 更正 · 不计入消耗估算</Text>
  return <>
    <View className='row usage__correction-actions'>
      <Button className='text-button' disabled={busy} onClick={() => { setEditing(!editing); setError('') }}>更正</Button>
      <Button className='text-button' disabled={busy} onClick={() => { void change('undo') }}>撤销</Button>
      {allowBatch && record.batchId && <Button className='text-button' disabled={busy} onClick={() => { void change('batch') }}>撤销整批</Button>}
      <Button className='text-button' disabled={busy} onClick={() => { void change('exclude') }}>{record.excludeFromForecast ? '恢复当天估算' : '忽略当天估算'}</Button>
    </View>
    {editing && <View>
      <QuantityField label='更正使用数量' item={item} value={amount} inputUnit={unit} disabled={busy} onChange={setAmount} onUnitChange={value => { setUnit(value); setAmount('') }} />
      <DateField label='更正使用日期' value={day} pastOnly disabled={busy} onChange={value => { if (value) setDay(value) }} />
      <Input className='field__input' value={note} maxlength={200} disabled={busy} placeholder='备注（选填）' onInput={event => setNote(event.detail.value)} />
      <Button className='text-button' disabled={busy} onClick={() => { void change('edit') }}>保存更正</Button>
    </View>}
    {error && <Text className='error'>{error}</Text>}
    {dialog}
  </>
}
