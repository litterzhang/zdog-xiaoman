import { GuestOverview } from '../../components/GuestOverview'
import { useDialog } from '../../components/Dialog'
import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { DemoNote, LoadState } from '../../components/Shared'
import { useSnapshot } from '../../hooks/useSnapshot'
import { logout, openHome, openLogin } from '../../services/session'
import './index.scss'

export default function MePage() {
  const { showDialog, dialog } = useDialog()
  const state = useSnapshot(true, true)
  async function leave() {
    const result = await showDialog({ title: state.demo ? '退出本地体验？' : '退出登录？', content: state.demo ? '本地记录仍会保留在当前设备，下次体验可以继续。' : '账号记录保存在服务器，下次登录可继续。' })
    if (result.confirm) { logout(); await openHome() }
  }
  return <View className='page'>
    {state.demo && <DemoNote />}
    <LoadState loading={state.loading} error={state.error} retry={() => { void state.reload() }} />
    {!state.loading && state.guest && <GuestOverview section='account' />}
    {!state.loading && state.data?.baby && <>
      <View className='card card--welcome me__profile'>
        <Text className='me__name'>{state.data.baby.name}</Text>
        <Text className='block small muted'>{state.data.baby.status === 'expected' ? '期待相见 · 预产期' : '已经相伴 · 出生于'} {state.data.baby.date}</Text>
      </View>
      <View className='card card--flush'><Button className='menu-row' onClick={() => { void Taro.navigateTo({ url: '/pages/onboarding/index' }) }}><Text>修改宝宝档案</Text><Text className='menu-arrow'>›</Text></Button></View>
      <View className='card me__about'>
        <Text className='section-title'>关于记录</Text>
        <Text className='block small muted me__copy'>{state.demo ? '当前为本地体验。记录仅保存在此设备，清除缓存后可能丢失，不迁移到真实账号。' : '当前为账号模式。用品与宝宝档案保存在服务器，不与其他账号共享。'}</Text>
        <Text className='block small muted me__copy'>提醒在打开应用时显示。开封后的使用期限，以产品包装说明为准。</Text>
        <Text className='block small muted me__copy'>支持一个宝宝。不同规格、批次和日期的用品建议分开记录。</Text>
      </View>
      <View className='card card--flush'>
        {state.demo && <Button className='menu-row' onClick={() => { void openLogin() }}><Text>自愿登录，使用账号记录</Text><Text className='menu-arrow'>›</Text></Button>}
        <Button className='menu-row' onClick={() => { void leave() }}>{state.demo ? '退出本地体验' : '退出登录'}</Button>
      </View>
    </>}
    {dialog}
  </View>
}
