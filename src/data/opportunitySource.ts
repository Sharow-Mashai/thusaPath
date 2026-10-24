import { demoOpportunities, type Opportunity } from './opportunities'

type OpportunityRow = {
  id: string; title: string; organisation: string; initials: string; category: string; place: string
  distance_km: number; transport_estimate: number; pay: string; closing: string; description: string
  requirements: Opportunity['requirements']; skills: string[]; colour: string; verified_until: string
  screened: boolean; reports: number; latitude: number; longitude: number
}

/** Loads published listings from Supabase when configured, with a clearly-labelled local demo fallback. */
export async function loadOpportunities(): Promise<{ opportunities: Opportunity[]; source: 'supabase' | 'demo' }> {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '')
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) return { opportunities: demoOpportunities, source: 'demo' }
  try {
    const response = await fetch(`${url}/rest/v1/opportunities?select=*&status=eq.published&order=closing.asc`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    if (!response.ok) throw new Error('Could not load published opportunities')
    const rows = await response.json() as OpportunityRow[]
    if (!Array.isArray(rows)) throw new Error('Opportunity data is not a list')
    return {
      source: 'supabase',
      opportunities: rows.map(row => ({
        id: row.id, title: row.title, organisation: row.organisation, initials: row.initials,
        category: row.category, place: row.place, distance: row.distance_km,
        transport: row.transport_estimate, pay: row.pay, closing: row.closing,
        description: row.description, requirements: row.requirements, skills: row.skills,
        colour: row.colour, verifiedUntil: row.verified_until, screened: row.screened,
        reports: row.reports, coordinates: [row.latitude, row.longitude],
      })),
    }
  } catch (error) {
    console.warn('ThusaPath is using demo listings because the live listings could not be reached.', error)
    return { opportunities: demoOpportunities, source: 'demo' }
  }
}
