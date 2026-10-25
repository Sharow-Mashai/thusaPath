import type { Opportunity, OpportunityLoadStatus } from './types'

type OpportunityRow = {
  id: string; title: string; organisation: string; initials: string; category: string; place: string
  distance_km: number; transport_estimate: number; pay: string; closing: string; description: string
  requirements: Opportunity['requirements']; skills: string[]; colour: string; verified_until: string
  screened: boolean; reports: number; latitude: number | null; longitude: number | null
  source_name?: string; source_url?: string | null; application_url?: string | null
}

/** Loads only published listings from the configured Supabase project. */
export async function loadOpportunities(): Promise<{ opportunities: Opportunity[]; status: OpportunityLoadStatus }> {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '')
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) return { opportunities: [], status: 'unconfigured' }
  try {
    const response = await fetch(`${url}/rest/v1/opportunities?select=*&status=eq.published&order=closing.asc`, {
      headers: { apikey: key },
    })
    if (!response.ok) return { opportunities: [], status: 'error' }
    const rows = await response.json() as OpportunityRow[]
    if (!Array.isArray(rows)) return { opportunities: [], status: 'error' }
    const verifiedListings = rows.map(row => ({
        id: row.id, title: row.title, organisation: row.organisation, initials: row.initials,
        category: row.category, place: row.place, distance: row.distance_km,
        transport: row.transport_estimate, pay: row.pay, closing: row.closing,
        description: row.description, requirements: row.requirements, skills: row.skills,
        colour: row.colour, verifiedUntil: row.verified_until, screened: row.screened,
        reports: row.reports, coordinates: row.latitude !== null && row.longitude !== null ? [row.latitude, row.longitude] as [number, number] : undefined,
        sourceName: row.source_name || 'ThusaPath', sourceUrl: row.source_url || undefined,
        applicationUrl: row.application_url || undefined, verifiedByUs: true,
      }))
    let externalListings: Opportunity[] = []
    let externalStatus: OpportunityLoadStatus | undefined
    if (import.meta.env.VITE_ADZUNA_ENABLED === 'true' || import.meta.env.VITE_EXTERNAL_LISTINGS_ENABLED === 'true') {
      try {
        const feed = await fetch(`${url}/functions/v1/adzuna-opportunities`, {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
        })
        if (feed.ok) {
          const body = await feed.json() as { opportunities?: Opportunity[] }
          if (Array.isArray(body.opportunities)) externalListings = body.opportunities
          else externalStatus = 'error'
        } else {
          externalStatus = feed.status === 503 ? 'unconfigured' : 'error'
          console.warn('Adzuna listings are not available right now.')
        }
      } catch (error) {
        externalStatus = 'error'
        console.warn('Could not load external opportunity listings.', error)
      }
    }
    const opportunities = [...verifiedListings, ...externalListings]
    return { status: opportunities.length ? 'live' : externalStatus ?? 'empty', opportunities }
  } catch (error) {
    console.warn('Could not load live ThusaPath listings.', error)
    return { opportunities: [], status: 'error' }
  }
}
