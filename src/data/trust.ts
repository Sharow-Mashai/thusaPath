import type { Opportunity } from './types'

export type TrustSession = { accessToken: string; userId: string }
export type OrganisationReview = {
  id: string
  name: string
  registration_number: string
  status: 'pending' | 'verified' | 'rejected'
  verified_until: string | null
  verification_method: string | null
  verification_notes: string | null
  verified_at: string | null
  created_at: string
}
export type OpportunityReport = {
  id: string
  listing_id: string
  listing_title: string
  organisation_name: string
  source_name: string | null
  application_host: string | null
  reason: string
  note: string
  status: 'open' | 'in_review' | 'resolved' | 'dismissed'
  created_at: string
}

function config() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '')
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) throw new Error('Trust tools are not connected to Supabase yet.')
  return { url, key }
}

async function request<T>(path: string, session: TrustSession, init: RequestInit = {}): Promise<T> {
  const { url, key } = config()
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string; hint?: string }
    throw new Error(body.message || body.hint || 'We could not save that update. Please try again.')
  }
  if (response.status === 204 || response.headers.get('content-length') === '0') return undefined as T
  return response.json() as Promise<T>
}

export async function sendOpportunityReport(session: TrustSession, item: Opportunity, reason: string, note: string) {
  let applicationHost = ''
  try { applicationHost = item.applicationUrl ? new URL(item.applicationUrl).hostname : '' } catch { /* malformed links are not retained */ }
  await request('opportunity_reports', session, {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      listing_id: item.id,
      listing_title: item.title.slice(0, 180),
      organisation_name: item.organisation.slice(0, 160),
      source_name: item.sourceName?.slice(0, 80) || null,
      application_host: applicationHost.slice(0, 180) || null,
      reason,
      note: note.slice(0, 400),
      reporter_id: session.userId,
    }),
  })
}

export async function loadTrustQueue(session: TrustSession) {
  const [organisations, reports] = await Promise.all([
    request<OrganisationReview[]>('rpc/staff_organisation_queue', session, { method: 'POST', body: '{}' }),
    request<OpportunityReport[]>('opportunity_reports?select=id,listing_id,listing_title,organisation_name,source_name,application_host,reason,note,status,created_at&order=created_at.desc&limit=100', session),
  ])
  return { organisations, reports }
}

export async function addOrganisationForReview(session: TrustSession, name: string, registrationNumber: string) {
  await request('organisations', session, {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ name: name.trim(), registration_number: registrationNumber.trim() }),
  })
}

export async function reviewOrganisation(session: TrustSession, organisationId: string, status: 'verified' | 'rejected', method: string, notes: string, verifiedUntil: string) {
  const { url, key } = config()
  const response = await fetch(`${url}/rest/v1/rpc/review_organisation`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_organisation_id: organisationId, p_status: status, p_method: method, p_notes: notes, p_verified_until: status === 'verified' ? verifiedUntil : null }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string }
    throw new Error(body.message || 'We could not save this review. Check the details and try again.')
  }
}

export async function updateReportStatus(session: TrustSession, reportId: string, status: OpportunityReport['status']) {
  const { url, key } = config()
  const response = await fetch(`${url}/rest/v1/opportunity_reports?id=eq.${encodeURIComponent(reportId)}`, {
    method: 'PATCH',
    headers: { apikey: key, Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ status, reviewed_by: session.userId, reviewed_at: new Date().toISOString() }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string }
    throw new Error(body.message || 'We could not update this report. Please try again.')
  }
}
