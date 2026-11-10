import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ConfirmContext, type ConfirmOptions } from './confirm'
import { useI18n } from './i18n'

interface Pending extends ConfirmOptions {
  message: string
  resolve: (ok: boolean) => void
}

export default function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [pending, setPending] = useState<Pending | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)

  const confirm = useCallback(
    (message: string, options?: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setPending({ message, resolve, ...options })),
    [],
  )

  useEffect(() => {
    if (pending && !dialog.current?.open) dialog.current?.showModal()
  }, [pending])

  const close = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
    dialog.current?.close()
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {/* Escape fires "cancel"; it counts as a "no". */}
      <dialog ref={dialog} className="confirm-dialog" onCancel={(e) => { e.preventDefault(); close(false) }}>
        {pending && (
          <form method="dialog" onSubmit={(e) => { e.preventDefault(); close(true) }}>
            <p>{pending.message}</p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => close(false)}>{t('Cancel')}</button>
              <button type="submit" className={pending.danger ? 'danger-solid' : 'primary'} autoFocus>
                {pending.confirmLabel ?? t('Continue')}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </ConfirmContext.Provider>
  )
}
