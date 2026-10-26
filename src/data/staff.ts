import type { AdminSession } from './adminAuth'

export type StaffMember = { email: string; active: boolean; created_at: string }

function config() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '')
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) throw new Error('Staff tools are not connected to Supabase yet.')
  return { url, key }
}

async function staffRpc<T>(name: string, session: AdminSession, body: Record<string, unknown> = {}): Promise<T> {
  const { url, key } = config()
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { message?: string; hint?: string }
    throw new Error(result.message || result.hint || 'We could not update staff access. Please try again.')
  }
  if (response.status === 204 || response.headers.get('content-length') === '0') return undefined as T
  return response.json() as Promise<T>
}

export async function loadStaffMembers(session: AdminSession) {
  return staffRpc<StaffMember[]>('staff_member_directory', session)
}

export async function addStaffMember(session: AdminSession, emailInput: string) {
  const email = emailInput.trim().toLowerCase()
  await staffRpc<void>('add_staff_member', session, { p_email: email })
}
