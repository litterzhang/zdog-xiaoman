import type { Session } from '../types/domain'

/** Public browsing never creates a demo session or falls back from an API failure. */
export function resolveAccess(session: Session | null, allowGuest: boolean): 'guest' | 'login' | 'demo' | 'live' {
  return session?.mode ?? (allowGuest ? 'guest' : 'login')
}
