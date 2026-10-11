import assert from 'node:assert/strict'
import test from 'node:test'
import { DialogController } from '../src/services/dialog'

const options = { title: 'Confirm', content: 'Choose deliberately.' }

test('dialog confirms only explicitly and settles once', async () => {
  const controller = new DialogController()
  let presented = false
  const result = controller.show(options, value => { presented = value === options })
  assert.equal(presented, true)
  controller.finish(true)
  controller.finish(false)
  assert.deepEqual(await result, { confirm: true, cancel: false })
})

test('replacement and page dismissal cancel pending decisions', async () => {
  const controller = new DialogController()
  const first = controller.show(options, () => {})
  const second = controller.show(options, () => {})
  assert.deepEqual(await first, { confirm: false, cancel: true })
  controller.finish(false)
  assert.deepEqual(await second, { confirm: false, cancel: true })
})
