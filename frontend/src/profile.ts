import { createContext, useContext } from 'react'
import type { Profile } from './api'

/**
 * The active profile (manager or user). There is no login: the choice is stored in this
 * browser only, and anyone can switch profiles. It is for prototypes and demos.
 */
export interface ProfileState {
  profile: Profile | null
  profiles: Profile[]
  loading: boolean
  select: (profile: Profile | null) => void
  reload: () => Promise<void>
}

export const PROFILE_STORAGE_KEY = 'profile_id'

export const ProfileContext = createContext<ProfileState | null>(null)

export function useProfile(): ProfileState {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used inside ProfileProvider')
  return ctx
}

export function storedProfileId(): number | null {
  try {
    const value = Number(localStorage.getItem(PROFILE_STORAGE_KEY))
    return Number.isInteger(value) && value > 0 ? value : null
  } catch {
    return null
  }
}
