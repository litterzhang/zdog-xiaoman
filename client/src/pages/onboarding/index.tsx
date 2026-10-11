import { useEffect, useRef, useState } from 'react'
import { Button, Input, Text, View } from '@tarojs/components'
import { useSnapshot } from '../../hooks/useSnapshot'
import { DateField, DemoNote, LoadState } from '../../components/Shared'
import type { Baby } from '../../types/domain'
import { saveBaby } from '../../services/repository'
import { openHome } from '../../services/session'
import { readableError } from '../../services/presentation'

export default function OnboardingPage() {
  const state = useSnapshot(false)
  const [baby, setBaby] = useState<Baby>({ name: '', status: 'expected', date: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const initialized = useRef(false)
  useEffect(() => {
    if (state.data && !initialized.current) {
      if (state.data.baby) setBaby(state.data.baby)
      initialized.current = true
    }
  }, [state.data])
  async function save() {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { await saveBaby(baby); await openHome() }
    catch (err) { setError(readableError(err)) }
    finally { setBusy(false); lock.current = false }
  }
  return <View className='page'>
    {state.demo && <DemoNote />}
    <LoadState loading={state.loading} error={state.error} retry={() => { void state.reload() }} />
    {state.data && !state.loading && <View className='card baby__form'>
      <View className='field'><Text className='field__label'>怎么称呼宝宝</Text><Input className='field__input' value={baby.name} maxlength={24} disabled={busy} placeholder='例如：小宝、朵朵' onInput={event => setBaby({ ...baby, name: event.detail.value })} /></View>
      <View className='field'><Text className='field__label'>我们正在</Text><View className='segment'>
        <Button className={`segment__button ${baby.status === 'expected' ? 'segment__button--active' : ''}`} disabled={busy} onClick={() => setBaby({ ...baby, status: 'expected', date: baby.status === 'expected' ? baby.date : '' })}>期待相见</Button>
        <Button className={`segment__button ${baby.status === 'born' ? 'segment__button--active' : ''}`} disabled={busy} onClick={() => setBaby({ ...baby, status: 'born', date: baby.status === 'born' ? baby.date : '' })}>已经相伴</Button>
      </View></View>
      <DateField label={baby.status === 'expected' ? '预产期' : '出生日期'} value={baby.date || null} onChange={value => setBaby({ ...baby, date: value || '' })} pastOnly={baby.status === 'born'} disabled={busy} />
      <Text className='notice'>{baby.status === 'expected' ? `期待${baby.name.trim() || '小宝'}的到来。把爱一点点备好，等你慢慢来到。` : '记录相伴的每一天，也照顾好每一份小小日常。'}</Text>
      {error && <Text className='error'>{error}</Text>}
      <View className='actions'><Button className='button' loading={busy} disabled={busy} onClick={() => { void save() }}>{state.data.baby ? '保存档案' : '开启我们的小日常'}</Button></View>
      <Text className='footer-note'>昵称与日期可随时修改，无需填写真实姓名。</Text>
    </View>}
  </View>
}
