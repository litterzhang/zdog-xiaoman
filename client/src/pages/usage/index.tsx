import { UsageCorrection } from '../../components/UsageCorrection'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Input, Picker, Text, View } from '@tarojs/components'
import { useDialog } from '../../components/Dialog'
import { DateField, DemoNote, LoadState } from '../../components/Shared'
import { QuantityField } from '../../components/ItemFields'
import { useSnapshot } from '../../hooks/useSnapshot'
import { dailyUsage, checkoutUsage, newId } from '../../services/repository'
import { parseQuantity } from '../../services/itemForms'
import { isArchived, prepareCheckout } from '../../services/usage'
import { readableError, today } from '../../services/presentation'
import type { UsageEntry, UsageRecord } from '../../types/domain'
import './index.scss'

export default function UsagePage() {
  const state = useSnapshot()
  const { showDialog, dialog } = useDialog()
  const [day, setDay] = useState(today())
  const [selectedId, setSelectedId] = useState('')
  const [amount, setAmount] = useState('')
  const [inputUnit, setInputUnit] = useState('')
  const [note, setNote] = useState('')
  const [entries, setEntries] = useState<UsageEntry[]>([])
  const [records, setRecords] = useState<UsageRecord[]>([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [recordsError, setRecordsError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const epoch = useRef(0)
  const operation = useRef<{ id: string; fingerprint: string } | null>(null)
  const active = (state.data?.items || []).filter(item => !isArchived(item))
  const selected = active.find(item => item.id === selectedId)
  const loadRecords = useCallback(async () => {
    const current = ++epoch.current
    setRecordsLoading(true); setRecordsError('')
    try {
      const values = await dailyUsage(day)
      if (current === epoch.current) setRecords(values)
    } catch (err) {
      if (current === epoch.current) { setRecords([]); setRecordsError(readableError(err)) }
    } finally { if (current === epoch.current) setRecordsLoading(false) }
  }, [day])
  useEffect(() => {
    if (!state.loading && state.data) void loadRecords()
    return () => { epoch.current++ }
  }, [state.loading, state.data, loadRecords])

  function add() {
    if (!selected || lock.current) return
    setError('')
    try {
      const count = parseQuantity(amount, selected, inputUnit || selected.unit)
      if (!Number.isInteger(count) || count <= 0) throw new Error('请输入大于 0 的有效使用数量。')
      const existing = entries.find(entry => entry.itemId === selected.id)
      const next = existing
        ? entries.map(entry => entry === existing ? { ...entry, amount: entry.amount + count, note: [entry.note, note.trim()].filter(Boolean).join('；') } : entry)
        : [...entries, { itemId: selected.id, amount: count, note: note.trim() }]
      prepareCheckout(state.data!.items, next)
      setEntries(next); setAmount(''); setNote(''); operation.current = null
    } catch (err) { setError(readableError(err)) }
  }
  async function submit() {
    if (!entries.length || lock.current || !state.data) return
    lock.current = true; setBusy(true); setError('')
    try {
      prepareCheckout(state.data.items, entries)
      const result = await showDialog({ title: '提交每日使用？', content: `将记录 ${day} 的 ${entries.length} 件用品使用情况，并一次扣减库存。用完的用品会自动归档。`, confirmText: '确认提交', cancelText: '再检查一下' })
      if (!result.confirm) return
      const fingerprint = JSON.stringify([day, entries])
      if (operation.current?.fingerprint !== fingerprint) operation.current = { id: newId(), fingerprint }
      await checkoutUsage(operation.current.id, day, entries)
      operation.current = null; setEntries([]); setSelectedId(''); setAmount(''); setNote('')
      await state.reload()
    } catch (err) { setError(readableError(err)) }
    finally { lock.current = false; setBusy(false) }
  }
  return <View className='page'>
    {state.demo && <DemoNote />}
    <LoadState loading={state.loading} error={state.error} retry={() => { void state.reload() }} />
    {!state.loading && state.data && <>
      <View className='card'><DateField label='使用日期' value={day} pastOnly disabled={busy} onChange={value => { if (value) { setDay(value); operation.current = null } }} /></View>
      <View className='card'>
        <Text className='section-title'>逐件添加使用</Text>
        {active.length ? <>
          <View className='field'><Text className='field__label'>选择用品</Text><Picker mode='selector' range={active.map(item => `${item.name} · 剩余 ${item.quantity} ${item.unit}`)} value={Math.max(0, active.findIndex(item => item.id === selectedId))} disabled={busy} onChange={event => { const item = active[Number(event.detail.value)]; setSelectedId(item.id); setInputUnit(item.unit); setAmount(''); setError('') }}><View className={`field__date ${selected ? '' : 'muted'}`}>{selected?.name || '选择今天用过的用品'}</View></Picker></View>
          {selected && <>
            <QuantityField label='使用数量' item={selected} value={amount} inputUnit={inputUnit || selected.unit} disabled={busy} onChange={setAmount} onUnitChange={unit => { setInputUnit(unit); setAmount('') }} />
            <View className='field'><Input className='field__input' value={note} disabled={busy} maxlength={200} placeholder='备注（选填）' onInput={event => setNote(event.detail.value)} /></View>
            <Button className='text-button' disabled={busy} onClick={add}>加入待提交清单</Button>
          </>}
        </> : <Text className='block small muted'>暂无在用用品，添加或补货后即可记录。</Text>}
      </View>
      {entries.length > 0 && <View className='card card--flush'>
        <View className='card-label'><Text className='section-title'>待提交清单 · {entries.length} 件用品</Text></View>
        {entries.map(entry => { const item = state.data!.items.find(value => value.id === entry.itemId); return <View className='usage__row' key={entry.itemId}>
          <View className='grow'><Text className='block'>{item?.name || '用品已不存在'}</Text><Text className='block small muted'>使用 {entry.amount} {item?.unit}{entry.note && ` · ${entry.note}`}</Text></View>
          <Button className='text-button' disabled={busy} onClick={() => { setEntries(entries.filter(value => value.itemId !== entry.itemId)); setError(''); operation.current = null }}>移除</Button>
        </View> })}
        <View className='usage__submit'><Text className='notice'>添加清单不会立即扣库存，确认提交后才生效。</Text><Button className='button' disabled={busy} loading={busy} onClick={() => { void submit() }}>提交 {entries.length} 件用品的使用</Button></View>
      </View>}
      {error && <Text className='error'>{error}</Text>}
      <View className='card card--flush'>
        <View className='row between card-label'><Text className='section-title'>已记录使用</Text><Text className='small muted'>{records.length} 条</Text></View>
        <LoadState loading={recordsLoading} error={recordsError} retry={() => { void loadRecords() }} />
        {!recordsLoading && !recordsError && (records.length ? records.map(record => <View className='usage__row' key={record.id}>
          <View className='grow'><View className='row between'><Text>{record.itemName}</Text><Text className='small'>使用 {record.amount} {record.unit}</Text></View>
            <Text className='block small muted'>{day}{record.note && ` · ${record.note}`}</Text>
            {state.data?.items.find(item => item.id === record.itemId) && <UsageCorrection record={record} item={state.data.items.find(item => item.id === record.itemId)!} allowBatch onChanged={state.reload} />}
          </View>
        </View>) : <View className='empty'><Text className='empty__body'>这一天还没有使用记录。</Text></View>)}
      </View>
      <Text className='footer-note'>不同单位不合计。用完后自动归档，补货后恢复在用。</Text>
    </>}
    {dialog}
  </View>
}
