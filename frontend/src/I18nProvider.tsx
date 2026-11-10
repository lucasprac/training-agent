import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { I18nContext, initialLang, LANG_STORAGE_KEY, translate, type Lang, type MessageKey, type Vars } from './i18n'

export default function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next)
    } catch {
      // The choice still applies for this page view.
    }
  }, [])
  const t = useCallback((key: MessageKey, vars?: Vars) => translate(lang, key, vars), [lang])
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
