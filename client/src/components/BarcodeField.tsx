import { useRef, useState } from 'react'
import { Button, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { validBarcode } from '../services/itemForms'

export function BarcodeField({ value, disabled, onChange, onRecorded }: {
  value: string; disabled: boolean; onChange: (value: string) => void
  onRecorded: (value: string) => Promise<void>
}) {
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  async function scan() {
    if (lock.current) return
    lock.current = true; setScanning(true); setError('')
    try {
      const result = await Taro.scanCode({ onlyFromCamera: true, scanType: ['barCode'] })
      const code = result.result.trim()
      if (!validBarcode(code)) throw new Error('暂不支持这个条码，请手动填写包装上的商品条码。')
      onChange(code)
      await onRecorded(code)
    } catch (err) {
      const message = err instanceof Error ? err.message : String((err as { errMsg?: string })?.errMsg || '')
      if (!/cancel/i.test(message)) setError(message || '扫码未完成，可手动输入商品条码。')
    } finally { lock.current = false; setScanning(false) }
  }
  return <View className='field'>
    <View className='row between'><Text className='field__label'>商品条码（选填）</Text>
      {process.env.TARO_ENV === 'weapp' && <Button className='text-button' disabled={disabled || scanning} onClick={() => { void scan() }}>{scanning ? '正在扫码…' : '扫描条码'}</Button>}
    </View>
    <Input className='field__input' value={value} disabled={disabled || scanning} maxlength={80} placeholder='包装上的条形码数字' onInput={event => { setError(''); onChange(event.detail.value) }} />
    {value && <Button className='text-button' disabled={disabled || scanning} onClick={() => { void onRecorded(value.trim()) }}>查询商品资料</Button>}
    <Text className='block small muted'>{process.env.TARO_ENV === 'weapp' ? '先查已有规格与本地缓存，再查询商品接口；命中后自动填写，仅发送条码。' : '微信小程序支持扫码；这里可输入条码查询商品资料，仅发送条码。'}</Text>
    {error && <Text className='error'>{error}</Text>}
  </View>
}
