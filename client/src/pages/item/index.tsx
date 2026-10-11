import { UsageCorrection } from '../../components/UsageCorrection'
import { consumptionForecast } from '../../services/planning'
import { useDialog } from '../../components/Dialog'
import { useEffect, useRef, useState } from 'react'
import { Button, Input, Text, Textarea, View } from '@tarojs/components'
import Taro, { useRouter, useUnload } from '@tarojs/taro'
import { DateField, DemoNote, LoadState } from '../../components/Shared'
import { ItemFields, QuantityField } from '../../components/ItemFields'
import { CatalogReference, CatalogSuggestions } from '../../components/CatalogSuggestions'
import { applyCatalogSuggestion, applyOwnSpecification, needsCatalogName } from '../../services/catalogPresentation'
import { lookupCatalog } from '../../services/catalog'
import { BarcodeField } from '../../components/BarcodeField'
import { itemForms } from '../../config/itemForms'
import { formatPrice, itemSpecifications, parsePrice, parseQuantity, quantityHint, quantityOptions, validBarcode } from '../../services/itemForms'
import { useSnapshot } from '../../hooks/useSnapshot'
import { categories, formatTimestamp, readableError, reminders, today } from '../../services/presentation'
import { isArchived, movementDay } from '../../services/usage'
import { deleteItem, history, move, newId, saveItem, saveShopping } from '../../services/repository'
import type { CatalogLookup, Category, Item, ItemDraft, Movement } from '../../types/domain'
import './index.scss'

const emptyDraft: ItemDraft = { name: '', category: 'formula', unit: 'g', quantity: 0, lowStock: 0, expiresOn: null, openedOn: null, notes: '' }
export default function ItemPage() {
  const { showDialog, dialog } = useDialog()
  const id = useRouter().params.id
  const state = useSnapshot()
  const item = state.data?.items.find(value => value.id === id)
  const forecast = item ? consumptionForecast(item, state.data?.usage || []) : null
  const shoppingOperation = useRef<string | null>(null)
  const [editing, setEditing] = useState(!id)
  const [draft, setDraft] = useState<ItemDraft>({ ...emptyDraft })
  const [quantityInput, setQuantityInput] = useState('0')
  const [lowInput, setLowInput] = useState('0')
  const [quantityUnit, setQuantityUnit] = useState('g')
  const [amountUnit, setAmountUnit] = useState('g')
  const [priceInput, setPriceInput] = useState('')
  const [priceUnit, setPriceUnit] = useState('罐')
  const form = itemForms[draft.category]
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogResult, setCatalogResult] = useState<CatalogLookup | null>(null)
  const barcodeEpoch = useRef(0)
  useUnload(() => { barcodeEpoch.current++ })
  const [previous, setPrevious] = useState<Item | undefined>()
  const [records, setRecords] = useState<Movement[]>([])
  const [historyError, setHistoryError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const blocked = busy || catalogLoading
  const lock = useRef(false)
  const [action, setAction] = useState<'restock' | 'use' | null>(null)
  const [amountInput, setAmountInput] = useState('1')
  const [note, setNote] = useState('')
  const [usedOn, setUsedOn] = useState(today())
  const operation = useRef<{ id: string; fingerprint: string } | null>(null)

  useEffect(() => {
    if (!id || !item || editing || state.loading) return
    let active = true
    setHistoryError('')
    void history(id).then(values => { if (active) setRecords(values) }).catch(err => { if (active) setHistoryError(readableError(err)) })
    return () => { active = false }
  }, [id, item?.revision, editing, state.loading])

  function edit() {
    if (!item) return
    setPrevious({ ...item }); setDraft({ ...item })
    setQuantityInput(String(item.quantity)); setLowInput(String(item.lowStock)); setQuantityUnit(item.unit)
    setPriceInput(item.priceCents != null ? formatPrice(item.priceCents) : '')
    setPriceUnit(item.priceUnit || (item.category === 'formula' ? '罐' : item.category === 'diapers' ? '包' : item.unit))
    setError(''); setAction(null); setEditing(true)
  }
  function changeCategory(category: Category) {
    if (id || category === draft.category) return
    const unit = categories.find(value => value.id === category)!.unit
    setDraft({ ...draft, category, unit, details: {}, openedOn: null, expiresOn: null })
    setQuantityInput('0'); setLowInput('0'); setQuantityUnit(unit)
    setPriceInput(''); setPriceUnit(category === 'formula' ? '罐' : category === 'diapers' ? '包' : unit)
    setCatalogResult(null); setError('')
  }
  function effectiveUnit(value: string, current: ItemDraft): string {
    return quantityOptions(current).some(option => option.unit === value) ? value : current.unit
  }
  async function reuseBarcode(code: string, preferOwn = true) {
    if (!validBarcode(code)) { setError('请填写有效的商品条码。'); return }
    if (lock.current) return
    lock.current = true; setCatalogLoading(true); setError(''); setCatalogResult(null)
    const epoch = ++barcodeEpoch.current
    setDraft(value => ({ ...value, barcode: code, catalogSource: value.barcode === code ? value.catalogSource : null }))
    try {
      const existing = !id && preferOwn ? state.data?.items.find(value => value.barcode === code) : undefined
      if (existing) {
        const changed = existing.category !== draft.category
        setDraft(value => applyOwnSpecification(value, existing, !!id))
        if (changed) {
          const unit = categories.find(value => value.id === existing.category)!.unit
          setQuantityUnit(unit); setQuantityInput('0'); setLowInput('0')
          if (!priceInput.trim()) setPriceUnit(existing.category === 'formula' ? '罐' : existing.category === 'diapers' ? '包' : unit)
        }
        if (!needsCatalogName(existing)) return
      }
      const result = await lookupCatalog(code)
      if (epoch !== barcodeEpoch.current) return
      setCatalogResult(result)
      const suggestion = result.suggestions[0]
      if (suggestion) {
        const changed = !id && suggestion.category && suggestion.category !== draft.category
        setDraft(value => applyCatalogSuggestion(value, suggestion, !!id))
        if (changed) {
          const unit = categories.find(value => value.id === suggestion.category)!.unit
          setQuantityUnit(unit); setQuantityInput('0'); setLowInput('0')
          if (!priceInput.trim()) setPriceUnit(suggestion.category === 'formula' ? '罐' : suggestion.category === 'diapers' ? '包' : unit)
        } else if (quantityUnit !== draft.unit) { setQuantityUnit(draft.unit); setQuantityInput('') }
      }
    } catch (err) { if (epoch === barcodeEpoch.current) setError(readableError(err)) }
    finally { lock.current = false; if (epoch === barcodeEpoch.current) setCatalogLoading(false) }
  }
  async function save() {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const result = await saveItem({ ...draft,
        quantity: id ? draft.quantity : parseQuantity(quantityInput, draft, effectiveUnit(quantityUnit, draft)),
        lowStock: parseQuantity(lowInput, draft), barcode: draft.barcode?.trim() || null,
        priceCents: parsePrice(priceInput), priceUnit: priceInput.trim() ? priceUnit : null,
      }, previous)
      if (!id) await Taro.redirectTo({ url: `/pages/item/index?id=${result.id}` })
      else { setEditing(false); await state.reload() }
    } catch (err) { setError(readableError(err)) }
    finally { lock.current = false; setBusy(false) }
  }
  async function record() {
    if (!id || !item || !action || lock.current) return
    lock.current = true; setBusy(true); setError('')
    const fingerprint = JSON.stringify([id, action, parseQuantity(amountInput, item, effectiveUnit(amountUnit, item)), note.trim(), usedOn])
    if (operation.current?.fingerprint !== fingerprint) operation.current = { id: newId(), fingerprint }
    try {
      await move(id, action, parseQuantity(amountInput, item, effectiveUnit(amountUnit, item)), operation.current.id, note.trim(), usedOn)
      operation.current = null; setAction(null); setNote(''); await state.reload()
    } catch (err) { setError(readableError(err)) }
    finally { lock.current = false; setBusy(false) }
  }
  async function addToShopping() {
    if (!item || lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      if (!shoppingOperation.current) shoppingOperation.current = newId()
      await saveShopping(shoppingOperation.current, { itemId: item.id, name: item.name,
        plannedQuantity: 1, plannedUnit: quantityOptions(item)[1]?.unit || item.unit, note: '' })
      shoppingOperation.current = null
      await showDialog({ title: '已加入待购', content: '可在“用品 → 待购”调整计划数量。待购不改变库存。', showCancel: false, confirmText: '知道了' })
    } catch (err) { setError(readableError(err)) }
    finally { lock.current = false; setBusy(false) }
  }
  async function remove() {
    if (!item || lock.current) return
    lock.current = true
    try {
      const result = await showDialog({ title: '删除这件用品？', content: '用品及其使用、补货记录将一并删除，无法恢复。', confirmText: '确认删除', tone: 'destructive' })
      if (!result.confirm) return
      setBusy(true)
      await deleteItem(item); await Taro.switchTab({ url: '/pages/items/index' })
    } catch (err) { setError(readableError(err)) }
    finally { lock.current = false; setBusy(false) }
  }
  return <View className='page'>
    {state.demo && <DemoNote />}
    <LoadState loading={state.loading} error={state.error} retry={() => { void state.reload() }} />
    {!state.loading && state.data && id && !item && <View className='card empty'><Text className='empty__title'>这件用品已不存在</Text><Text className='empty__body'>用品可能已被删除。</Text></View>}
    {!state.loading && state.data && (!id || item) && (editing ? <View className='card item__form'>
      <View className='field'><Text className='field__label'>分类</Text><View className='item__categories'>{categories.map(category => <Button key={category.id} disabled={blocked || !!id} className={`segment__button ${category.id === draft.category ? 'segment__button--active' : ''}`} onClick={() => changeCategory(category.id)}>{category.label}</Button>)}</View></View>
      <BarcodeField value={draft.barcode || ''} disabled={blocked} onChange={barcode => { barcodeEpoch.current++; setCatalogResult(null); setDraft({ ...draft, barcode, catalogSource: barcode === draft.barcode ? draft.catalogSource : null }) }} onRecorded={reuseBarcode} />
      {catalogLoading && <Text className='notice'>正在查询商品资料…</Text>}
      {catalogResult && <CatalogSuggestions result={catalogResult} />}
      {draft.catalogSource && <CatalogReference source={draft.catalogSource} />}
      <View className='field'><Text className='field__label'>用品名称</Text><Input className='field__input' maxlength={60} value={draft.name} disabled={blocked} placeholder={form.placeholder} onInput={event => setDraft({ ...draft, name: event.detail.value })} /></View>
      <ItemFields draft={draft} disabled={blocked} onChange={details => {
        setDraft({ ...draft, details })
        if (quantityUnit !== draft.unit) { setQuantityUnit(draft.unit); setQuantityInput('') }
      }} />
      {(!['formula', 'diapers'].includes(draft.category) || (id && !['g', '片'].includes(draft.unit))) && <View className='field'><Text className='field__label'>库存单位</Text><Input className='field__input' maxlength={8} value={draft.unit} disabled={blocked || !!id} placeholder='例如：件、包、片' onInput={event => { setDraft({ ...draft, unit: event.detail.value }); setQuantityUnit(event.detail.value) }} /></View>}
      <QuantityField label={id ? '当前库存（通过补货 / 使用修改）' : '初始库存'} item={draft} value={quantityInput} inputUnit={quantityUnit} disabled={blocked || !!id} onChange={setQuantityInput} onUnitChange={unit => { setQuantityUnit(unit); setQuantityInput('') }} />
      <View className='field'><Text className='field__label'>余量提醒线 / {draft.unit}（少于或等于时提醒）</Text><Input className='field__input' type='number' maxlength={6} disabled={blocked} value={lowInput} onInput={event => setLowInput(event.detail.value)} /></View>
      <View className='pair'>
        <View className='field'><Text className='field__label'>购入单价 / 元（选填）</Text><Input className='field__input' type='digit' maxlength={9} value={priceInput} disabled={blocked} placeholder='例如 268.00' onInput={event => setPriceInput(event.detail.value)} /></View>
        <View className='field'><Text className='field__label'>价格对应单位</Text><Input className='field__input' maxlength={8} value={priceUnit} disabled={blocked} placeholder='罐 / 包 / 件' onInput={event => setPriceUnit(event.detail.value)} /></View>
      </View>
      {(form.expires || draft.expiresOn) && <DateField label='有效期（选填）' value={draft.expiresOn} optional disabled={blocked} onChange={value => setDraft({ ...draft, expiresOn: value })} />}
      {(form.opened || draft.openedOn) && <DateField label='开封日期（选填）' value={draft.openedOn} optional pastOnly disabled={blocked} onChange={value => setDraft({ ...draft, openedOn: value })} />}
      <View className='field'><Text className='field__label'>备注（选填）</Text><Textarea className='field__textarea' maxlength={500} value={draft.notes} disabled={blocked} placeholder='规格、批次或存放位置' onInput={event => setDraft({ ...draft, notes: event.detail.value })} /></View>
      <Text className='notice'>{form.note}</Text>
      {error && <Text className='error'>{error}</Text>}
      <View className='actions'><Button className='button' loading={busy} disabled={blocked} onClick={() => { void save() }}>保存用品</Button>{id && <Button className='text-button text-button--center' disabled={blocked} onClick={() => { setEditing(false); setError('') }}>取消编辑</Button>}</View>
    </View> : item && <>
      <View className='card item__summary'>
        <Text className='item__name'>{item.name}</Text>
        <Text className='block small muted'>{[categories.find(category => category.id === item.category)?.label, ...itemSpecifications(item).slice(0, 2).map(value => value.value)].join(' · ')}</Text>
        <View className='item__balance'><Text className='item__quantity'>{item.quantity}</Text><Text className='small muted'>{item.unit} / 当前余量</Text></View>
        {forecast && <Text className='block small muted'>{forecast.label}</Text>}
        {forecast?.dailyAverage != null && <Text className='block small muted'>近 14 天内：{forecast.recordedDays} 个记录日，按 {forecast.spanDays} 个日历日估算 · 约 {Number(forecast.dailyAverage.toFixed(1))} {item.unit} / 天。漏记可能使预计天数偏长。</Text>}
        {isArchived(item) && <Text className='notice'>已用完 · 已归档。补货后自动恢复在用，历史记录仍保留。</Text>}
        {quantityHint(item.quantity, item) && <Text className='block small muted'>{quantityHint(item.quantity, item)}</Text>}
        {item.category === 'formula' && item.unit !== 'g' && <Text className='notice'>这条旧记录仍按{item.unit}计数；如需记录半罐或克数，请新建按克记录，不会自动换算旧库存。</Text>}
        {reminders(item).map(reminder => <View className='notice item__reminder' key={reminder.kind}>{reminder.label} · {reminder.detail}</View>)}
        <View className='pair item__buttons'>
          <Button className='button button--secondary' disabled={blocked} onClick={() => { setUsedOn(today()); setAction('restock'); setAmountUnit(quantityOptions(item)[1]?.unit || item.unit); setAmountInput('1'); setError(''); operation.current = null }}>补货</Button>
          <Button className='button' disabled={blocked || item.quantity === 0} onClick={() => { setUsedOn(today()); setAction('use'); setAmountUnit(item.unit); setAmountInput(''); setError(''); operation.current = null }}>记录使用</Button>
        </View>
      </View>
      <View className='card card--flush'><Button className='menu-row' disabled={blocked} onClick={() => { void addToShopping() }}><Text>加入待购清单</Text><Text className='menu-arrow'>›</Text></Button></View>
      {action && <View className='card item__record-form'>
        <QuantityField label={action === 'restock' ? '补货数量' : '使用数量'} item={item} value={amountInput} inputUnit={amountUnit} disabled={blocked} onChange={setAmountInput} onUnitChange={unit => { setAmountUnit(unit); setAmountInput('') }} />
        <DateField label={action === 'use' ? '使用日期' : '补货日期'} value={usedOn} pastOnly disabled={blocked} onChange={value => { if (value) setUsedOn(value) }} />
        <View className='field'><Input className='field__input' maxlength={200} value={note} disabled={blocked} placeholder='备注（选填）' onInput={event => setNote(event.detail.value)} /></View>
        <View className='actions'><Button className='button' disabled={blocked} loading={busy} onClick={() => { void record() }}>确认记录</Button><Button className='text-button text-button--center' disabled={blocked} onClick={() => { setAction(null); setError('') }}>取消</Button></View>
      </View>}
      {error && <Text className='error'>{error}</Text>}
      <View className='card card--flush item__details'>
        {itemSpecifications(item).map(value => <View className='row between' key={value.label}><Text className='muted small'>{value.label}</Text><Text className='small'>{value.value}</Text></View>)}
        {item.catalogSource && <CatalogReference source={item.catalogSource} />}
        {item.priceCents != null && <View className='row between'><Text className='muted small'>购入单价</Text><Text className='small'>¥{formatPrice(item.priceCents)} / {item.priceUnit}</Text></View>}
        {item.barcode && <View className='row between'><Text className='muted small'>商品条码</Text><Text className='small'>{item.barcode}</Text></View>}
        {(itemForms[item.category].expires || item.expiresOn) && <View className='row between'><Text className='muted small'>有效期</Text><Text className='small'>{item.expiresOn || '未记录'}</Text></View>}
        {(itemForms[item.category].opened || item.openedOn) && <View className='row between'><Text className='muted small'>开封日期</Text><Text className='small'>{item.openedOn || '未记录'}</Text></View>}
        <View className='row between'><Text className='muted small'>余量提醒线</Text><Text className='small'>{item.lowStock} {item.unit}</Text></View>
        {item.notes && <Text className='block small item__notes'>{item.notes}</Text>}
        <Button className='menu-row' disabled={blocked} onClick={edit}><Text>编辑用品</Text><Text className='menu-arrow'>›</Text></Button>
      </View>
      <View className='card card--flush'>
        <View className='row between card-label'><Text className='section-title'>库存记录</Text><Text className='small muted'>{records.length} 条记录</Text></View>
        {historyError && <Text className='error'>{historyError}</Text>}
        {records.slice(0, 30).map(record => <View className='item__history' key={record.id}><View className='row between'><Text className='small'>{record.kind === 'initial' ? '初始库存' : record.kind === 'restock' ? '补货' : record.kind === 'undo' ? '撤销恢复' : '使用'}</Text><Text className='small'>{record.kind === 'use' ? '−' : '+'}{record.amount} {item.unit}</Text></View><Text className='block muted item__history-meta'>{record.kind === 'use' ? `${movementDay(record)} 使用 · ${formatTimestamp(record.createdAt)} 记录` : formatTimestamp(record.createdAt)} · 余量 {record.balance} {item.unit}{record.note && record.kind !== 'initial' ? ` · ${record.note}` : ''}</Text><UsageCorrection record={record} item={item} onChanged={state.reload} allowBatch /></View>)}
        {records.length > 30 && <Text className='footer-note'>显示最近 30 条记录。</Text>}
        <Button className='text-button text-button--center' disabled={blocked} onClick={() => { void state.reload() }}>刷新记录</Button>
      </View>
      <View className='card card--flush'><Button className='menu-row' disabled={blocked} onClick={() => { void remove() }}>删除这件用品</Button></View>
      <Text className='footer-note'>{itemForms[item.category].note}</Text>
    </>)}
    {dialog}
  </View>
}
