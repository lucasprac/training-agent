import { createContext, useContext } from 'react'

/**
 * In-app replacement for window.confirm(). Native dialogs can be blocked (some embedded browsers
 * make confirm() return false without showing anything), so destructive actions must not depend on them.
 */
export interface ConfirmOptions {
  /** Label of the confirming button. Default: "Continue". */
  confirmLabel?: string
  /** Show the confirming button in the danger style (for deletions). */
  danger?: boolean
}

export type Confirm = (message: string, options?: ConfirmOptions) => Promise<boolean>

export const ConfirmContext = createContext<Confirm | null>(null)

export function useConfirm(): Confirm {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider')
  return ctx
}
