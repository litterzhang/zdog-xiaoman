export interface DialogOptions {
  title: string
  content: string
  confirmText?: string
  cancelText?: string
  showCancel?: boolean
  tone?: 'notice' | 'destructive'
}

export interface DialogResult { confirm: boolean; cancel: boolean }

// Each page owns its pending decision; dismissal never implies confirmation.
export class DialogController {
  private pending?: (result: DialogResult) => void

  show(options: DialogOptions, present: (options: DialogOptions) => void): Promise<DialogResult> {
    this.finish(false)
    return new Promise(resolve => {
      this.pending = resolve
      present(options)
    })
  }

  finish(confirm: boolean): void {
    const resolve = this.pending
    this.pending = undefined
    resolve?.({ confirm, cancel: !confirm })
  }
}
