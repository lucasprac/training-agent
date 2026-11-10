import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type Profile } from './api'
import { PROFILE_STORAGE_KEY, ProfileContext, storedProfileId } from './profile'

export default function ProfileProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [profileId, setProfileId] = useState<number | null>(storedProfileId)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      setProfiles(await api.get<Profile[]>('/profiles'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload().catch(() => setLoading(false))
  }, [reload])

  const select = useCallback((next: Profile | null) => {
    setProfileId(next?.id ?? null)
    try {
      if (next) localStorage.setItem(PROFILE_STORAGE_KEY, String(next.id))
      else localStorage.removeItem(PROFILE_STORAGE_KEY)
    } catch {
      // The choice still applies for this page view.
    }
  }, [])

  const profile = profiles.find((p) => p.id === profileId) ?? null
  const value = useMemo(() => ({ profile, profiles, loading, select, reload }), [profile, profiles, loading, select, reload])
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}
