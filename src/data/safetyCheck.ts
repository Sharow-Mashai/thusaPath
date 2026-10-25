import type { Opportunity } from './types'

export type ScamCheckResult = { risk: 'low' | 'caution' | 'high'; summary: string; warningSigns: string[]; saferSteps: string[] }

function config() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '')
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) throw new Error('Safety checks are not connected yet. Please try again later.')
  return { url, key }
}

export async function checkJobSafety(item: Opportunity): Promise<ScamCheckResult> {
  const { url, key } = config()
  let applicationHost = ''
  try { applicationHost = item.applicationUrl ? new URL(item.applicationUrl).hostname : '' } catch { /* malformed URLs are not forwarded */ }
  const response = await fetch(`${url}/functions/v1/job-safety-check`, {
    method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: item.title, organisation: item.organisation, place: item.place, category: item.category, description: item.description, applicationHost }),
  })
  const body = await response.json().catch(() => ({})) as ScamCheckResult & { error?: string }
  if (!response.ok) throw new Error(body.error || (response.status === 503 ? 'AI safety check is not set up yet.' : 'The safety check could not finish. Please try again.'))
  return body
}
