const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
})

const categories = ['retail', 'operations', 'hospitality', 'customer-service', 'healthcare', 'manufacturing', 'logistics', 'education', 'other', 'sales']
let cached: Record<string, unknown>[] | null = null
let expiresAt = 0

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function nameOf(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim() || fallback
  if (Array.isArray(value)) return value.map(item => nameOf(item)).filter(Boolean).join(', ') || fallback
  return text(record(value).name, fallback)
}

function cleanDescription(value: unknown): string {
  return text(value)
    .replace(/<\s*br\s*\/?\s*>|<\s*\/\s*(?:p|li|div|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, 7000)
}

function addressList(job: Record<string, unknown>): Record<string, unknown>[] {
  const values = Array.isArray(job.jobLocation) ? job.jobLocation : [job.jobLocation]
  return values.map(record)
}

function getCountries(job: Record<string, unknown>): string {
  const countries = addressList(job).map(place => {
    const address = record(place.address)
    return nameOf(address.addressCountry ?? place.addressCountry)
  })
  const applicant = job.applicantLocationRequirements
  const applicants = Array.isArray(applicant) ? applicant : [applicant]
  countries.push(...applicants.map(nameOf))
  return countries.join(' ').toLowerCase()
}

function extractRequirements(description: string): string[] {
  return [...new Set(description.split(/(?<=[.!?])\s+|\s*[•;]\s*/)
    .map(part => part.replace(/^[-–*\s]+/, '').trim())
    .filter(part => part.length >= 12 && part.length <= 220 &&
      /\b(requirements?|must have|must be|qualification|matric|grade\s*12|experience|licen[cs]e|certificate|degree|diploma|fluent|proficien|ability to|minimum of|at least|training provided|no experience)\b/i.test(part)))]
    .slice(0, 8)
}

function mapListing(raw: unknown): Record<string, unknown> | null {
  const job = record(raw)
  const title = text(job.title)
  const yubhubUrl = text(job.url)
  if (!title || !/^https:\/\//i.test(yubhubUrl)) return null
  const countryText = `${getCountries(job)} ${JSON.stringify(job.jobLocation ?? '')}`
  if (!/south africa|\bza\b/i.test(countryText)) return null
  const employer = nameOf(job.hiringOrganization, 'Employer not listed')
  const description = cleanDescription(job.description)
  const requiredSkills = Array.isArray(job['x-skills-required'])
    ? job['x-skills-required'].map((skill: unknown) => text(skill)).filter(Boolean)
    : []
  const requirements = extractRequirements(description)
  const salary = text(job['x-salary-range']) || 'Pay details in full advert'
  const validThrough = text(job.validThrough)
  const closeDate = Date.parse(validThrough)
  if (Number.isFinite(closeDate) && closeDate < Date.now()) return null
  const datePosted = Date.parse(text(job.datePosted))
  if (Number.isFinite(datePosted) && datePosted < Date.now() - 120 * 24 * 60 * 60 * 1000) return null
  const place = addressList(job).map(place => {
    const address = record(place.address)
    return [address.addressLocality, address.addressRegion, address.addressCountry].map(value => nameOf(value)).filter(Boolean).join(', ')
  }).find(Boolean) || 'South Africa'
  const categoryText = `${title} ${text(job.employmentType)} ${text(job.occupationalCategory)}`
  const category = /learnership|apprentice/i.test(categoryText) ? 'Learnership'
    : /intern(ship)?|student/i.test(categoryText) ? 'Internship'
      : /bursary|scholarship/i.test(categoryText) ? 'Bursary'
        : /volunteer/i.test(categoryText) ? 'Volunteering'
          : /training|trainee|graduate/i.test(categoryText) ? 'Training' : 'Job'
  const identifier = record(job.identifier)
  return {
    id: `yubhub-${text(identifier.value, yubhubUrl)}`,
    title,
    organisation: employer,
    initials: employer.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase(),
    category,
    place,
    pay: salary,
    closing: Number.isFinite(closeDate) ? new Date(closeDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : 'See source',
    description,
    requirements: (requirements.length ? requirements : requiredSkills).map((label: string) => ({ label, met: false })),
    skills: [...new Set([...requiredSkills, ...text(job.skills).split(',').map((skill: string) => skill.trim()).filter(Boolean)])].slice(0, 10),
    colour: 'mint', screened: false, reports: 0,
    sourceName: 'YubHub', sourceUrl: yubhubUrl,
    applicationUrl: text(job['x-apply-url'], yubhubUrl),
    verifiedByUs: false,
  }
}

async function loadListings(): Promise<Record<string, unknown>[]> {
  const results = await Promise.allSettled(categories.map(async category => {
    const response = await fetch(`https://feeds.yubhub.co/facet/category/${category}.json`, { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`YubHub feed returned ${response.status}`)
    const payload = await response.json()
    if (!Array.isArray(payload?.jobs)) return []
    return payload.jobs.map(mapListing).filter((job: Record<string, unknown> | null): job is Record<string, unknown> => job !== null)
  }))
  const unique = new Map<string, Record<string, unknown>>()
  for (const result of results) if (result.status === 'fulfilled') {
    for (const job of result.value) unique.set(String(job.id), job)
  }
  return [...unique.values()]
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
  if (cached && Date.now() < expiresAt) return json({ opportunities: cached })
  try {
    const listings = await loadListings()
    if (!listings.length) return json({ opportunities: [], message: 'No current South African listings were found in the free YubHub feeds.' })
    cached = listings
    expiresAt = Date.now() + 60 * 60 * 1000
    return json({ opportunities: cached })
  } catch {
    return json({ error: 'YubHub listings are temporarily unavailable.' }, 502)
  }
})
