export type AdminSession = { accessToken: string; userId: string; email: string; expiresAt: number }

function getConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '')
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) throw new Error('Sign-in is not connected yet. Add the ThusaPath sign-in settings first.')
  return { url, key }
}

async function errorMessage(response: Response) {
  try {
    const body = await response.json() as { message?: string; msg?: string; error_description?: string }
    return body.error_description || body.message || body.msg || 'Please check your details and try again.'
  } catch { return 'Please check your details and try again.' }
}

async function passwordSignIn(email: string, password: string): Promise<AdminSession> {
  const { url, key } = getConfig()
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!response.ok) throw new Error(await errorMessage(response))
  const auth = await response.json() as { access_token: string; expires_in?: number; user?: { id?: string; email?: string } }
  if (!auth.user?.id || !auth.access_token) throw new Error('We could not confirm this account. Please try again.')
  return { accessToken: auth.access_token, userId: auth.user.id, email: auth.user.email || email, expiresAt: Date.now() + (auth.expires_in || 3600) * 1000 }
}

function normalizedEmail(emailInput: string) {
  return emailInput.trim().toLowerCase()
}

export async function signInJobSeeker(emailInput: string, password: string): Promise<AdminSession> {
  const email = normalizedEmail(emailInput)
  if (email.endsWith('@thusapath.com')) throw new Error('ThusaPath staff should use the same sign-in page with their staff email.')
  return passwordSignIn(email, password)
}

export async function signUpJobSeeker(emailInput: string, password: string, firstName: string, lastName: string): Promise<{ session?: AdminSession; confirmationRequired: boolean }> {
  const email = normalizedEmail(emailInput)
  if (email.endsWith('@thusapath.com')) throw new Error('Staff accounts are created by the ThusaPath admin. Use the sign-in tab instead.')
  const { url, key } = getConfig()
  const response = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, data: { first_name: firstName.trim(), last_name: lastName.trim(), full_name: `${firstName.trim()} ${lastName.trim()}` } }),
  })
  if (!response.ok) throw new Error(await errorMessage(response))
  const auth = await response.json() as { access_token?: string; expires_in?: number; user?: { id?: string; email?: string } }
  if (auth.access_token && auth.user?.id) {
    return {
      session: { accessToken: auth.access_token, userId: auth.user.id, email: auth.user.email || email, expiresAt: Date.now() + (auth.expires_in || 3600) * 1000 },
      confirmationRequired: false,
    }
  }
  return { confirmationRequired: true }
}

export async function signInAdmin(emailInput: string, password: string): Promise<AdminSession> {
  const email = normalizedEmail(emailInput)
  if (!email.endsWith('@thusapath.com')) throw new Error('Use your ThusaPath staff email, ending in @thusapath.com.')
  const auth = await passwordSignIn(email, password)
  const { url, key } = getConfig()
  const userId = auth.userId

  const membership = await fetch(`${url}/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(userId)}&active=eq.true`, {
    headers: { apikey: key, Authorization: `Bearer ${auth.accessToken}` },
  })
  if (!membership.ok) throw new Error('We could not check staff access. Ask the ThusaPath admin to finish the setup.')
  const rows = await membership.json() as { user_id: string }[]
  if (!rows.some(row => row.user_id === userId)) throw new Error('This account does not have admin access yet. Ask the ThusaPath admin to add you.')

  return auth
}
