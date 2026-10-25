const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
})

let cached: Record<string, unknown>[] | null = null
let expiresAt = 0

function object(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function clean(value: unknown): string {
  return text(value).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, 5000)
}

function safeUrl(value: unknown): string | undefined {
  const candidate = text(value)
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function mapJob(raw: unknown): Record<string, unknown> | null {
  const job = object(raw)
  const title = text(job.job_title)
  const place = text(job.job_location, 'Location in full advert')
  const country = text(job.job_country).toLowerCase()
  // The API request itself is country-scoped to ZA. Some valid South African
  // results omit job_country, so only exclude an explicit non-SA country.
  if (!title || (country && country !== 'za' && country !== 'south africa')) return null

  const description = clean(job.job_description)
  const highlights = object(job.job_highlights)
  const qualifications = Array.isArray(highlights.Qualifications) ? highlights.Qualifications.map((item: unknown) => clean(item)).filter(Boolean) : []
  const technologySkills = Array.isArray(job.required_technologies) ? job.required_technologies.map((item: unknown) => text(item)).filter(Boolean) : []
  const skills = [...new Set([...technologySkills, ...qualifications.filter((item: string) => item.length <= 140)])].slice(0, 10)
  const requirements = [...new Set(qualifications)].slice(0, 8).map(label => ({ label, met: false }))
  const employer = text(job.employer_name, 'Employer not listed')
  const applyUrl = safeUrl(job.job_apply_link) || (Array.isArray(job.apply_options)
    ? job.apply_options.map((option: unknown) => safeUrl(object(option).apply_link)).find(Boolean)
    : undefined)
  if (!applyUrl) return null

  const categoryText = `${title} ${text(job.job_employment_type)} ${description}`
  const category = /learnership|apprentice/i.test(categoryText) ? 'Learnership'
    : /intern(ship)?|student/i.test(categoryText) ? 'Internship'
      : /bursary|scholarship/i.test(categoryText) ? 'Bursary'
        : /volunteer/i.test(categoryText) ? 'Volunteering'
          : /training|trainee|graduate/i.test(categoryText) ? 'Training' : 'Job'
  const salary = text(job.job_salary_string) || (typeof job.job_min_salary === 'number'
    ? `R${job.job_min_salary.toLocaleString('en-ZA')}${typeof job.job_max_salary === 'number' ? ` – R${job.job_max_salary.toLocaleString('en-ZA')}` : ''}`
    : 'Pay details in full advert')
  const expires = Date.parse(text(job.job_offer_expiration_datetime_utc))
  if (Number.isFinite(expires) && expires < Date.now()) return null

  return {
    id: `jsearch-${text(job.job_id, crypto.randomUUID())}`,
    title,
    organisation: employer,
    initials: employer.split(/\s+/).slice(0, 2).map((part: string) => part[0]).join('').toUpperCase(),
    category,
    place: text(job.job_is_remote ? 'Remote · South Africa' : place, place),
    pay: salary,
    closing: Number.isFinite(expires) ? new Date(expires).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : 'See advert',
    description,
    requirements,
    skills,
    colour: 'mint',
    screened: false,
    reports: 0,
    coordinates: typeof job.job_latitude === 'number' && typeof job.job_longitude === 'number' ? [job.job_latitude, job.job_longitude] : undefined,
    sourceName: 'JSearch',
    sourceUrl: safeUrl(job.job_google_link) || 'https://www.openwebninja.com/api/jsearch',
    applicationUrl: applyUrl,
    verifiedByUs: false,
  }
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
  if (cached && Date.now() < expiresAt) return json({ opportunities: cached })

  const apiKey = Deno.env.get('jsearch_api_key')
  if (!apiKey) return json({ error: 'The additional listing feed is not configured yet.' }, 503)

  try {
    // Broader terms work better with regional job indexes. The matching in
    // ThusaPath still highlights beginner roles and compares advert requirements.
    const queries = ['jobs in South Africa', 'entry level jobs in South Africa', 'general worker jobs in South Africa']
    const results = await Promise.allSettled(queries.map(async query => {
      const endpoint = new URL('https://api.openwebninja.com/jsearch/search-v2')
      endpoint.searchParams.set('query', query)
      endpoint.searchParams.set('country', 'za')
      endpoint.searchParams.set('language', 'en')
      endpoint.searchParams.set('page', '1')
      endpoint.searchParams.set('num_pages', '1')
      const response = await fetch(endpoint, { headers: { Accept: 'application/json', 'x-api-key': apiKey } })
      if (!response.ok) throw new Error(`JSearch returned ${response.status}`)
      const payload = await response.json()
      const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.jobs) ? payload.jobs : []
      return rows.map(mapJob).filter((item: Record<string, unknown> | null): item is Record<string, unknown> => item !== null)
    }))
    const jobs = results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
    if (!jobs.length && results.every(result => result.status === 'rejected')) return json({ error: 'The additional listing feed is temporarily unavailable.' }, 502)
    const unique = new Map<string, Record<string, unknown>>()
    for (const job of jobs) {
      const key = `${text(job.title).toLowerCase()}|${text(job.organisation).toLowerCase()}|${text(job.place).toLowerCase()}`
      if (!unique.has(key)) unique.set(key, job)
    }
    cached = [...unique.values()]
    expiresAt = Date.now() + 60 * 60 * 1000
    return json({ opportunities: cached })
  } catch {
    return json({ error: 'The additional listing feed is temporarily unavailable.' }, 502)
  }
})
