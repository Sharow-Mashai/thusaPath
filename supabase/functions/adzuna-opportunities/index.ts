const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
})

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function cleanDescription(value: unknown): string {
  return text(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .slice(0, 5000)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  const appId = Deno.env.get('ADZUNA_APP_ID')
  const appKey = Deno.env.get('ADZUNA_APP_KEY')
  if (!appId || !appKey) return json({ error: 'Adzuna is not configured on the server.' }, 503)

  try {
    const url = new URL('https://api.adzuna.com/v1/api/jobs/za/search/1')
    url.searchParams.set('app_id', appId)
    url.searchParams.set('app_key', appKey)
    url.searchParams.set('results_per_page', '20')
    url.searchParams.set('where', 'South Africa')
    url.searchParams.set('content-type', 'application/json')

    const response = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!response.ok) return json({ error: 'The live job source is temporarily unavailable.' }, 502)
    const payload = await response.json()
    if (!Array.isArray(payload?.results)) return json({ error: 'The job source returned an unexpected response.' }, 502)

    const opportunities = payload.results.map((ad: Record<string, unknown>) => {
      const company = ad.company as Record<string, unknown> | undefined
      const location = ad.location as Record<string, unknown> | undefined
      const employer = text(company?.display_name, 'Employer not listed')
      const title = text(ad.title, 'Opportunity')
      const salaryMin = typeof ad.salary_min === 'number' ? ad.salary_min : undefined
      const salaryMax = typeof ad.salary_max === 'number' ? ad.salary_max : undefined
      const salary = salaryMin === undefined && salaryMax === undefined
        ? 'Pay details on source listing'
        : `R${salaryMin?.toLocaleString('en-ZA') ?? '?'}${salaryMax ? ` – R${salaryMax.toLocaleString('en-ZA')}` : ''}`
      const applyUrl = text(ad.redirect_url)
      const safeApplyUrl = /^https:\/\//i.test(applyUrl) ? applyUrl : undefined
      const latitude = typeof ad.latitude === 'number' ? ad.latitude : undefined
      const longitude = typeof ad.longitude === 'number' ? ad.longitude : undefined
      const place = Array.isArray(location?.area)
        ? location.area.filter((part): part is string => typeof part === 'string').slice(-2).join(', ')
        : text(location?.display_name, 'Location on source listing')
      const category = ad.category as Record<string, unknown> | undefined

      return {
        id: `adzuna-${String(ad.id ?? crypto.randomUUID())}`,
        title,
        organisation: employer,
        initials: employer.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase(),
        category: 'Job',
        place,
        pay: salary,
        closing: 'See source',
        description: cleanDescription(ad.description),
        requirements: [],
        skills: [],
        colour: 'mint',
        screened: false,
        reports: 0,
        coordinates: latitude !== undefined && longitude !== undefined ? [latitude, longitude] : undefined,
        sourceName: 'Adzuna',
        sourceUrl: 'https://www.adzuna.co.za',
        applicationUrl: safeApplyUrl,
        verifiedByUs: false,
        sourceCategory: text(category?.label),
      }
    })

    return json({ opportunities })
  } catch {
    return json({ error: 'The live job source is temporarily unavailable.' }, 502)
  }
})
