import { useDialog } from '../../components/Dialog'
import { useRef, useState } from 'react'
import { Button, Checkbox, CheckboxGroup, Input, Label, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { brand } from '../../config/brand'
import { getSession, openHome, signIn, startDemo } from '../../services/session'
import { readableError } from '../../services/presentation'
import './index.scss'

export default function LoginPage() {
  const { showDialog, dialog } = useDialog()
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [consented, setConsented] = useState(false)
  const [error, setError] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const weapp = process.env.TARO_ENV === 'weapp'
  useDidShow(() => { if (getSession()?.mode === 'live') void openHome() })

  async function login() {
    if (lock.current || !consented) return
    lock.current = true; setBusy(true); setError('')
    const secret = password; setPassword('')
    try { await signIn(username.trim(), secret); await openHome() }
    catch (err) { setError(readableError(err)) }
    finally { lock.current = false; setBusy(false) }
  }
  async function demo() {
    if (lock.current) return
    startDemo(); await openHome()
  }
  function privacy() {
    void showDialog({ title: '登录与隐私说明', content: '登录为可选项，可不登录浏览功能并使用本地记录。不要求授权手机号、头像或微信昵称。登录用于隔离账号数据。宝宝昵称、日期和用品记录会保存在应用服务器；不读取通讯录、手机号、头像或相册。日期可不填写真实信息。本地体验仅保存在当前设备。上线前将补充运营主体、联系方式与完整隐私政策。', showCancel: false, confirmText: '我知道了' })
  }
  return <View className='page login'>
    <View className='card card--welcome'>
      <Text className='welcome-title'>{brand.slogan}</Text>
      <Text className='welcome-desc'>登录为可选项，用于保存账号记录。</Text>
    </View>
    <View className='card'>
      {!weapp && <>
        <View className='field'><Text className='field__label'>账号</Text><Input className='field__input' value={username} disabled={busy} maxlength={128} placeholder='请输入已有账号' onInput={event => setUsername(event.detail.value)} /></View>
        <View className='field'><Text className='field__label'>密码</Text><Input className='field__input' password value={password} disabled={busy} maxlength={256} placeholder='请输入密码' onInput={event => setPassword(event.detail.value)} /></View>
      </>}
      <CheckboxGroup onChange={event => setConsented(event.detail.value.includes('privacy'))}>
        <Label className='login__consent'><Checkbox value='privacy' checked={consented} disabled={busy} color='#667b91' /><Text>已阅读并同意登录与隐私说明</Text></Label>
      </CheckboxGroup>
      <Button className='text-button' onClick={privacy}>查看说明</Button>
      {error && <Text className='error'>{error}</Text>}
      <Button className='button' loading={busy} disabled={busy || !consented || (!weapp && (!username.trim() || !password))} onClick={() => { void login() }}>{weapp ? '微信登录' : '账号登录'}</Button>
    </View>
    <View className='card card--flush'>
      <Button className='menu-row' disabled={busy} onClick={() => { void demo() }}><Text>无需登录，使用本地记录</Text><Text className='menu-arrow'>›</Text></Button>
    </View>
    <Button className='text-button text-button--center' disabled={busy} onClick={() => { void openHome() }}>暂不登录，继续浏览</Button>
    <Text className='footer-note'>本地体验无需登录，不上传任何记录。</Text>
    {dialog}
  </View>
}
