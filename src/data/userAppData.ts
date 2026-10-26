export type UserDataSession = { accessToken: string; userId: string }

type UserDataRow = { data: unknown; updated_at: string }

function getConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '')
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) throw new Error('Account saving is not connected to Supabase yet.')
  return { url, key }
}

async function requestError(response: Response) {
  const body = await response.json().catch(() => ({})) as { message?: string; hint?: string; details?: string }
  const detail = body.message || body.hint || body.details || ''
  if (response.status === 404 || /user_app_data|schema cache/i.test(detail)) {
    return new Error('Account saving needs one Supabase setup step. Apply the user account data migration, then sign in again.')
  }
  if (response.status === 401 || response.status === 403) {
    return new Error('Your sign-in has expired. Sign in again to save your account changes.')
  }
  return new Error(detail || 'We could not save your account changes. Check your connection and try again.')
}

async function request(path: string, session: UserDataSession, init: RequestInit = {}) {
  const { url, key } = getConfig()
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  if (!response.ok) throw await requestError(response)
  return response
}

export async function loadUserAppData<T>(session: UserDataSession): Promise<{data:T|null;updatedAt:string|null}> {
  const rows = await (await request(`user_app_data?select=data,updated_at&user_id=eq.${encodeURIComponent(session.userId)}&limit=1`, session)).json() as UserDataRow[]
  const row=rows[0]
  return {data:row?.data as T|undefined??null,updatedAt:row?.updated_at||null}
}

export async function saveUserAppData(session: UserDataSession, data: unknown): Promise<void> {
  await request('user_app_data?on_conflict=user_id', session, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: session.userId, data, updated_at: new Date().toISOString() }),
  })
}
