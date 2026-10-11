import { useEffect, useRef, useState } from 'react'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import { useDidHide } from '@tarojs/taro'
import { DialogController, type DialogOptions } from '../services/dialog'
import './Dialog.scss'

export function useDialog() {
  const controller = useRef(new DialogController())
  const [options, setOptions] = useState<DialogOptions | null>(null)
  function close(confirm = false) {
    controller.current.finish(confirm)
    setOptions(null)
  }
  useDidHide(() => close())
  useEffect(() => {
    const pending = controller.current
    return () => pending.finish(false)
  }, [])
  return {
    showDialog: (value: DialogOptions) => controller.current.show(value, setOptions),
    dialog: options && <View className='dialog-layer' catchMove onClick={() => close()}>
      <View className='dialog' onClick={event => event.stopPropagation()}>
        <View className={`dialog__mark ${options.tone === 'destructive' ? 'dialog__mark--destructive' : ''}`}><Text>{options.tone === 'destructive' ? '!' : '·'}</Text></View>
        <Text className='dialog__title'>{options.title}</Text>
        <ScrollView className='dialog__body' scrollY><Text className='dialog__copy'>{options.content}</Text></ScrollView>
        <View className='dialog__actions'>
          {options.showCancel !== false && <Button className='dialog__button dialog__button--cancel' onClick={() => close()}>{options.cancelText || '再想想'}</Button>}
          <Button className='dialog__button dialog__button--confirm' onClick={() => close(true)}>{options.confirmText || '确定'}</Button>
        </View>
        {options.tone === 'destructive' && <Text className='dialog__note'>请确认后再继续，此操作无法撤销</Text>}
      </View>
    </View>,
  }
}
