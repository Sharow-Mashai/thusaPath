export type AdminSession = { accessToken: string; userId: string; email: string; expiresAt: number }

function getConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '')
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) throw new Error('Staff sign-in is not connected yet. Add the ThusaPath sign-in settings first.')
  return { url, key }
}

async function errorMessage(response: Response) {
  try {
    const body = await response.json() as { message?: string; msg?: string; error_description?: string }
    return body.error_description || body.message || body.msg || 'Please check your details and try again.'
  } catch { return 'Please check your details and try again.' }
}

export async function signInAdmin(emailInput: string, password: string): Promise<AdminSession> {
  const email = emailInput.trim().toLowerCase()
  if (!email.endsWith('@thusapath.com')) throw new Error('Use your ThusaPath staff email, ending in @thusapath.com.')
  const { url, key } = getConfig()
  const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!login.ok) throw new Error(await errorMessage(login))
  const auth = await login.json() as { access_token: string; expires_in?: number; user?: { id?: string; email?: string } }
  const userId = auth.user?.id
  if (!userId || !auth.access_token) throw new Error('We could not confirm this staff account.')

  const membership = await fetch(`${url}/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(userId)}&active=eq.true`, {
    headers: { apikey: key, Authorization: `Bearer ${auth.access_token}` },
  })
  if (!membership.ok) throw new Error('We could not check staff access. Ask the ThusaPath admin to finish the setup.')
  const rows = await membership.json() as { user_id: string }[]
  if (!rows.some(row => row.user_id === userId)) throw new Error('This account does not have admin access yet. Ask the ThusaPath admin to add you.')

  return { accessToken: auth.access_token, userId, email: auth.user?.email || email, expiresAt: Date.now() + (auth.expires_in || 3600) * 1000 }
}
