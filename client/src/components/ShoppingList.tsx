import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Input, Picker, Text, View } from '@tarojs/components'
import type { Item, ShoppingEntry } from '../types/domain'
import { saveShopping, shoppingAction, shoppingList, newId } from '../services/repository'
import { DateField, LoadState } from './Shared'
import { QuantityField } from './ItemFields'
import { useDialog } from './Dialog'
import { formatPrice, parsePrice, parseQuantity } from '../services/itemForms'
import { readableError, today } from '../services/presentation'

export function ShoppingList({ items, onChanged }: { items: Item[]; onChanged: () => Promise<void> }) {
  const { showDialog, dialog } = useDialog()
  const [entries, setEntries] = useState<ShoppingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [form, setForm] = useState(false)
  const [editing, setEditing] = useState<ShoppingEntry | null>(null)
  const [itemId, setItemId] = useState('')
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('件')
  const [note, setNote] = useState('')
  const [purchasing, setPurchasing] = useState<ShoppingEntry | null>(null)
  const [amount, setAmount] = useState('')
  const [amountUnit, setAmountUnit] = useState('件')
  const [price, setPrice] = useState('')
  const [priceUnit, setPriceUnit] = useState('件')
  const [day, setDay] = useState(today())
  const [expires, setExpires] = useState<string | null>(null)
  const [opened, setOpened] = useState<string | null>(null)
  const [updateMetadata, setUpdateMetadata] = useState(false)
  const lock = useRef(false)
  const epoch = useRef(0)
  const operation = useRef<{ id: string; fingerprint: string } | null>(null)
  const purchaseItem = items.find(item => item.id === purchasing?.itemId)
  const visible = entries.filter(entry => entry.status === (done ? 'done' : 'pending'))
  const reload = useCallback(async () => {
    const current = ++epoch.current
    setLoading(true); setLoadError('')
    try { const values = await shoppingList(); if (current === epoch.current) setEntries(values) }
    catch (err) { if (current === epoch.current) setLoadError(readableError(err)) }
    finally { if (current === epoch.current) setLoading(false) }
  }, [])
  useEffect(() => { void reload(); return () => { epoch.current++ } }, [reload])
  function operationId(fingerprint: string) {
    if (operation.current?.fingerprint !== fingerprint) operation.current = { id: newId(), fingerprint }
    return operation.current.id
  }
  function edit(entry?: ShoppingEntry) {
    operation.current = null; setError(''); setForm(true); setPurchasing(null)
    setEditing(entry || null); setItemId(entry?.itemId || ''); setName(entry?.name || '')
    setQuantity(String(entry?.plannedQuantity || 1)); setUnit(entry?.plannedUnit || '件'); setNote(entry?.note || '')
  }
  async function save() {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const draft = { itemId: itemId || null, name, plannedQuantity: Number(quantity), plannedUnit: unit, note }
      const id = editing?.id || operationId(JSON.stringify(['save', draft]))
      await saveShopping(id, draft, editing?.revision)
      operation.current = null; setForm(false); setEditing(null); await reload()
    } catch (err) { setError(readableError(err)) }
    finally { lock.current = false; setBusy(false) }
  }
  function beginPurchase(entry: ShoppingEntry) {
    const item = items.find(value => value.id === entry.itemId)
    if (!item) { edit(entry); setError('请先关联已保存的用品，再确认补货。'); return }
    operation.current = null; setForm(false); setPurchasing(entry); setError('')
    setAmount(''); setAmountUnit(item.unit); setPrice(''); setPriceUnit(item.priceUnit || item.unit)
    setDay(today()); setExpires(item.expiresOn); setOpened(item.openedOn); setUpdateMetadata(false)
  }
  async function act(entry: ShoppingEntry, action: 'delete' | 'complete' | 'restock') {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const purchase = action === 'restock' && purchaseItem ? {
        amount: parseQuantity(amount, purchaseItem, amountUnit), itemRevision: purchaseItem.revision, occurredOn: day,
        ...(price.trim() ? { priceCents: parsePrice(price), priceUnit } : {}),
        ...(updateMetadata ? { expiresOn: expires, openedOn: opened } : {}),
      } : undefined
      const confirmation = await showDialog({
        title: action === 'restock' ? '确认买到并补货？' : action === 'delete' ? '移除待购记录？' : '标记已买到？',
        content: action === 'restock' ? '确认实际补货数量后才增加库存，并将待购项标记完成。' : action === 'complete' ? '只标记完成，不修改库存。需要增加库存请选择“买到并补货”。' : '移除清单记录，不会改变库存。', confirmText: '确认',
      })
      if (!confirmation.confirm) return
      await shoppingAction(entry, operationId(JSON.stringify([entry.id, entry.revision, action, purchase])), action, purchase)
      operation.current = null; setPurchasing(null); await reload(); await onChanged()
    } catch (err) { setError(readableError(err)) }
    finally { lock.current = false; setBusy(false) }
  }
  return <>
    <View className='card card--flush'>
      <Button className='menu-row' disabled={busy} onClick={() => edit()}><Text>添加待购用品</Text><Text className='menu-arrow'>›</Text></Button>
      <Button className='menu-row' disabled={busy} onClick={() => { setDone(!done); setForm(false); setPurchasing(null) }}><Text>{done ? '返回待购清单' : '查看已完成购买'}</Text><Text className='menu-arrow'>›</Text></Button>
    </View>
    <LoadState loading={loading} error={loadError} retry={() => { void reload() }} />
    {form && <View className='card'>
      <Text className='section-title'>{editing ? '编辑待购' : '添加待购'}</Text>
      <View className='field'><Text className='field__label'>关联用品（选填，补货时需要）</Text>
        <Picker mode='selector' range={['暂不关联', ...items.map(item => item.name)]} value={Math.max(0, items.findIndex(item => item.id === itemId) + 1)} disabled={busy} onChange={event => {
          const item = items[Number(event.detail.value) - 1]; setItemId(item?.id || '')
          if (item) { setName(item.name); setUnit(item.unit) }
        }}><View className='field__date'>{items.find(item => item.id === itemId)?.name || '暂不关联'}</View></Picker>
      </View>
      <View className='field'><Text className='field__label'>用品名称</Text><Input className='field__input' value={name} disabled={busy} maxlength={60} placeholder='填写需要购买的用品' onInput={event => setName(event.detail.value)} /></View>
      <View className='pair'><View className='field'><Text className='field__label'>计划数量</Text><Input className='field__input' value={quantity} type='number' disabled={busy} maxlength={6} onInput={event => setQuantity(event.detail.value)} /></View>
        <View className='field'><Text className='field__label'>计划单位</Text><Input className='field__input' value={unit} disabled={busy} maxlength={8} onInput={event => setUnit(event.detail.value)} /></View></View>
      <Input className='field__input' value={note} disabled={busy} maxlength={200} placeholder='备注（选填）' onInput={event => setNote(event.detail.value)} />
      <View className='row'><Button className='text-button' disabled={busy} onClick={() => { void save() }}>保存待购</Button><Button className='text-button' disabled={busy} onClick={() => setForm(false)}>取消</Button></View>
      <Text className='notice'>待购数量不计入库存，买到后请确认实际补货数量。</Text>
    </View>}
    {purchasing && purchaseItem && <View className='card'>
      <Text className='section-title'>买到并补货 · {purchaseItem.name}</Text>
      <Text className='block small muted'>计划 {purchasing.plannedQuantity} {purchasing.plannedUnit}，当前库存 {purchaseItem.quantity} {purchaseItem.unit}</Text>
      <QuantityField label='实际补货数量' item={purchaseItem} value={amount} inputUnit={amountUnit} disabled={busy} onChange={setAmount} onUnitChange={value => { setAmountUnit(value); setAmount('') }} />
      <DateField label='购入日期' value={day} pastOnly disabled={busy} onChange={value => { if (value) setDay(value) }} />
      <View className='pair'><View className='field'><Text className='field__label'>购入单价 / 元（选填）</Text><Input className='field__input' value={price} type='digit' disabled={busy} maxlength={9} onInput={event => setPrice(event.detail.value)} /></View>
        <View className='field'><Text className='field__label'>价格单位</Text><Input className='field__input' value={priceUnit} disabled={busy} maxlength={8} onInput={event => setPriceUnit(event.detail.value)} /></View></View>
      <Button className='text-button' disabled={busy} onClick={() => setUpdateMetadata(!updateMetadata)}>{updateMetadata ? '保留原有效期与开封日' : '修改这条用品的日期'}</Button>
      {updateMetadata && <>
        <Text className='notice'>不同批次请新建用品并重新关联，不建议用新批次日期覆盖仍在用的旧库存。</Text>
        <DateField label='有效期' value={expires} optional disabled={busy} onChange={setExpires} />
        <DateField label='开封日期' value={opened} optional pastOnly disabled={busy} onChange={setOpened} />
      </>}
      <View className='row'><Button className='text-button' disabled={busy} onClick={() => { void act(purchasing, 'restock') }}>确认买到并补货</Button><Button className='text-button' disabled={busy} onClick={() => setPurchasing(null)}>取消</Button></View>
    </View>}
    {error && <Text className='error'>{error}</Text>}
    {!loading && !loadError && <View className='card card--flush'>
      <View className='card-label'><Text className='section-title'>{done ? '已完成' : '待购'} · {visible.length} 件</Text></View>
      {visible.length ? visible.map(entry => <View className='shopping__entry' key={entry.id}>
        <View className='row between'><Text>{entry.name}</Text><Text className='small'>{entry.plannedQuantity} {entry.plannedUnit}</Text></View>
        {entry.note && <Text className='block small muted'>{entry.note}</Text>}
        {entry.purchase && <Text className='block small muted'>补货 {entry.purchase.amount} {items.find(item => item.id === entry.itemId)?.unit || ''}{entry.purchase.priceCents != null ? ` · 单价 ¥${formatPrice(entry.purchase.priceCents)} / ${entry.purchase.priceUnit}` : ''}</Text>}
        <View className='row shopping__actions'>
          {!done && <><Button className='text-button' disabled={busy} onClick={() => beginPurchase(entry)}>买到并补货</Button><Button className='text-button' disabled={busy} onClick={() => edit(entry)}>编辑</Button><Button className='text-button' disabled={busy} onClick={() => { void act(entry, 'complete') }}>仅标记买到</Button></>}
          <Button className='text-button' disabled={busy} onClick={() => { void act(entry, 'delete') }}>移除</Button>
        </View>
      </View>) : <View className='empty'><Text className='empty__body'>{done ? '还没有已完成的购买' : '还没有待购用品，缺什么再记下来。'}</Text></View>}
    </View>}
    <Text className='footer-note'>待购不等于库存。不同单位不合计，确认补货后才增加库存。</Text>
    {dialog}
  </>
}
