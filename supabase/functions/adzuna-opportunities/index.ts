const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
})

let feedCache: Record<string, unknown>[] | null = null
let feedCacheExpiresAt = 0

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function cleanDescription(value: unknown): string {
  return text(value)
    .replace(/<\s*br\s*\/?\s*>|<\s*\/\s*(?:p|li|div|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
    .slice(0, 5000)
}

const advertSkillTerms = [
  'communication', 'customer service', 'teamwork', 'problem solving', 'computer literacy',
  'Microsoft Office', 'Excel', 'data entry', 'driving', 'sales', 'retail', 'cleaning',
  'cooking', 'stock control', 'cash handling', 'time management', 'writing', 'numeracy',
  'attention to detail', 'first aid', 'food handling', 'security', 'administration', 'typing',
]
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function extractAdvertDetails(description: string) {
  const clauses = description
    .split(/(?<=[.!?])\s+|\s*[•;]\s*/)
    .map(part => part.replace(/^[-–*\s]+/, '').trim())
    .filter(part => part.length >= 10 && part.length <= 240)
  const requirementCue = /\b(requirements?|must have|must be|need(?:ed)? to|qualification|matric|grade\s*12|experience|licen[cs]e|certificate|degree|diploma|fluent|proficien|able to|ability to|minimum of|at least|knowledge of|training provided|no experience)\b/i
  const requirements = [...new Set(clauses.filter(part => requirementCue.test(part)))].slice(0, 8)
  const skills = advertSkillTerms.filter(skill =>
    new RegExp(`\\b${escapeRegExp(skill)}\\b`, 'i').test(description),
  ).slice(0, 8)
  return { requirements: requirements.map(label => ({ label, met: false })), skills }
}

async function loadGovernmentCircular(): Promise<Record<string, unknown> | null> {
  const pageUrl = 'https://www.gov.za/af/government-jobs-week'
  const response = await fetch(pageUrl, { headers: { Accept: 'text/html' } })
  if (!response.ok) return null
  const html = await response.text()
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
  for (const match of links) {
    const title = cleanDescription(match[2]).replace(/\s+/g, ' ')
    if (!/Public Service Vacancy Circular No/i.test(title)) continue
    const pdfUrl = new URL(match[1], pageUrl)
    if (pdfUrl.protocol !== 'https:' || !pdfUrl.hostname.endsWith('gov.za')) return null
    return {
      id: `govza-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      title,
      organisation: 'South African public service',
      initials: 'PS',
      category: 'Government jobs',
      place: 'Across South Africa',
      pay: 'See full advert',
      closing: 'See circular',
      description: 'This weekly circular contains public service job adverts. Open it to read each role’s requirements, closing date and application steps. Some roles may require you to confirm with the department that you can apply.',
      requirements: [],
      skills: [],
      colour: 'mint',
      screened: true,
      reports: 0,
      sourceName: 'Government of South Africa',
      sourceUrl: pageUrl,
      applicationUrl: pdfUrl.toString(),
      verifiedByUs: false,
      sourceCategory: 'Official vacancy circular',
    }
  }
  return null
}

const yubhubCategories = ['graduate-jobs', 'internships', 'retail', 'operations', 'hospitality', 'customer-service', 'healthcare', 'manufacturing', 'logistics']

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function schemaText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim() || fallback
  if (Array.isArray(value)) return value.map(item => schemaText(item)).filter(Boolean).join(', ') || fallback
  const record = object(value)
  return text(record.name ?? record['@id'], fallback)
}

function getCountry(job: Record<string, unknown>): string {
  const places = Array.isArray(job.jobLocation) ? job.jobLocation : [job.jobLocation]
  const countries = places.map(place => {
    const address = object(object(place).address)
    return schemaText(address.addressCountry ?? object(place).addressCountry)
  }).filter(Boolean)
  const applicant = object(job.applicantLocationRequirements)
  if (applicant.name) countries.push(schemaText(applicant.name))
  return countries.join(' ').toLowerCase()
}

function southAfricanPlace(job: Record<string, unknown>): string {
  const places = Array.isArray(job.jobLocation) ? job.jobLocation : [job.jobLocation]
  const place = object(places.find(item => getCountry({ ...job, jobLocation: item }).includes('south africa')) ?? places[0])
  const address = object(place.address)
  const name = [address.addressLocality, address.addressRegion, address.addressCountry]
    .map(value => schemaText(value)).filter(Boolean).join(', ')
  if (name) return name
  return /remote/i.test(`${schemaText(job.jobLocationType)} ${schemaText(job.title)}`) ? 'Remote · South Africa' : 'South Africa'
}

function salaryText(job: Record<string, unknown>): string {
  const salary = object(job.baseSalary)
  const value = object(salary.value)
  const currency = text(salary.currency, 'ZAR')
  const min = value.minValue ?? value.value
  const max = value.maxValue
  if (typeof min !== 'number' && typeof max !== 'number') return 'Pay details in full advert'
  const format = (amount: unknown) => typeof amount === 'number' ? `${currency} ${amount.toLocaleString('en-ZA')}` : '?'
  return typeof max === 'number' && max !== min ? `${format(min)} – ${format(max)}` : format(min ?? max)
}

function yubhubListing(raw: unknown): Record<string, unknown> | null {
  const job = object(raw)
  const title = text(job.title)
  const applicationUrl = text(job['x-apply-url'] ?? job.url ?? job.sameAs)
  if (!title || !/^https:\/\//i.test(applicationUrl)) return null
  const country = getCountry(job)
  const locationText = JSON.stringify(job.jobLocation ?? '')
  if (!/south africa|\bza\b/i.test(country) && !/south africa|\bza\b/i.test(locationText)) return null
  const employer = schemaText(job.hiringOrganization, 'Employer not listed')
  const description = cleanDescription(schemaText(job.description))
  const advertDetails = extractAdvertDetails(description)
  const requiredSkills = Array.isArray(job['x-skills-required']) ? job['x-skills-required'].map((skill: unknown) => text(skill)).filter(Boolean) : []
  const identifier = object(job.identifier)
  const id = text(identifier.value ?? job.identifier, applicationUrl)
  const typeText = schemaText(job.employmentType)
  const categoryText = `${title} ${typeText} ${description}`
  const category = /learnership|apprentice/i.test(categoryText) ? 'Learnership'
    : /intern(ship)?|student/i.test(categoryText) ? 'Internship'
      : /bursary|scholarship/i.test(categoryText) ? 'Bursary'
        : /volunteer/i.test(categoryText) ? 'Volunteering'
          : /training|trainee|graduate/i.test(categoryText) ? 'Training' : 'Job'
  const validThrough = text(job.validThrough)
  const closing = validThrough ? new Date(validThrough).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : 'See source'
  const datePosted = Date.parse(text(job.datePosted))
  if (validThrough && Date.parse(validThrough) < Date.now()) return null
  if (datePosted && datePosted < Date.now() - 120 * 24 * 60 * 60 * 1000) return null
  return {
    id: `yubhub-${id}`,
    title,
    organisation: employer,
    initials: employer.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase(),
    category,
    place: southAfricanPlace(job),
    pay: text(job['x-salary-range']) || salaryText(job),
    closing,
    description,
    requirements: advertDetails.requirements.length ? advertDetails.requirements : requiredSkills.map(label => ({ label, met: false })),
    skills: [...new Set([...requiredSkills, ...advertDetails.skills])].slice(0, 10),
    colour: 'mint',
    screened: false,
    reports: 0,
    sourceName: 'YubHub',
    sourceUrl: text(job.url, 'https://yubhub.co/free-job-feeds/'),
    applicationUrl,
    verifiedByUs: false,
  }
}

async function loadYubhubListings(): Promise<Record<string, unknown>[]> {
  const feeds = await Promise.allSettled(yubhubCategories.map(async category => {
    const url = `https://feeds.yubhub.co/facet/category/${encodeURIComponent(category)}.json`
    const response = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`YubHub feed unavailable (${response.status})`)
    const payload = await response.json()
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.['@graph']) ? payload['@graph'] : Array.isArray(payload?.jobs) ? payload.jobs : []
    return rows.map(yubhubListing).filter((job: Record<string, unknown> | null): job is Record<string, unknown> => job !== null)
  }))
  return feeds.flatMap(feed => feed.status === 'fulfilled' ? feed.value : [])
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
  if (feedCache && Date.now() < feedCacheExpiresAt) return json({ opportunities: feedCache })

  // Provider credentials stay in Supabase Edge Function secrets.
  const appId = Deno.env.get('adzuna_id')
  const appKey = Deno.env.get('adzuna_key')
  const joobleKey = Deno.env.get('jooble_api_key')
  try {
    const requests: Promise<Record<string, unknown>[]>[] = []
    if (appId && appKey) {
      // Keep searches focused. A single long query can exclude good beginner roles
      // because the advert rarely contains every search term.
      for (const searchTerm of ['learnership', 'internship', 'entry level']) {
        const url = new URL('https://api.adzuna.com/v1/api/jobs/za/search/1')
        url.searchParams.set('app_id', appId)
        url.searchParams.set('app_key', appKey)
        url.searchParams.set('results_per_page', '20')
        url.searchParams.set('what', searchTerm)
        url.searchParams.set('content-type', 'application/json')
        requests.push(fetch(url, { headers: { Accept: 'application/json' } }).then(async response => {
          if (!response.ok) {
            console.warn(`Adzuna ${searchTerm} search returned HTTP ${response.status}.`)
            throw new Error('Adzuna unavailable')
          }
          const payload = await response.json()
          if (!Array.isArray(payload?.results)) {
            console.warn(`Adzuna ${searchTerm} search returned no results list.`)
            throw new Error('Invalid Adzuna response')
          }
          return payload.results.map((job: Record<string, unknown>) => ({ ...job, _provider: 'Adzuna' }))
        }))
      }
    }
    if (joobleKey) {
      requests.push(fetch(`https://jooble.org/api/${encodeURIComponent(joobleKey)}`, {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: 'entry level no experience learnership internship trainee', location: 'South Africa', page: '1', ResultOnPage: 20 }),
      }).then(async response => {
        if (!response.ok) throw new Error('Jooble unavailable')
        const payload = await response.json()
        if (!Array.isArray(payload?.jobs)) throw new Error('Invalid Jooble response')
        return payload.jobs.map((job: Record<string, unknown>) => ({ ...job, _provider: 'Jooble' }))
      }))
    }
    const governmentRequest = loadGovernmentCircular()
    const yubhubRequest = loadYubhubListings()
    const feeds = await Promise.allSettled([...requests, governmentRequest, yubhubRequest])
    const records = feeds.slice(0, requests.length).flatMap(result =>
      result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : [])
    const circularResult = feeds[requests.length]
    const governmentCircular = circularResult?.status === 'fulfilled' && !Array.isArray(circularResult.value)
      ? circularResult.value
      : null
    const yubhubResult = feeds[requests.length + 1]
    const yubhubRecords = yubhubResult?.status === 'fulfilled' && Array.isArray(yubhubResult.value) ? yubhubResult.value : []
    if (!records.length && !governmentCircular && !yubhubRecords.length) return json({ error: 'Live job sources are temporarily unavailable.' }, 502)

    const opportunities = [...records.map((ad: Record<string, unknown>) => {
      const provider = text(ad._provider, 'Job board')
      const fromJooble = provider === 'Jooble'
      const company = ad.company as Record<string, unknown> | undefined
      const location = ad.location as Record<string, unknown> | undefined
      const employer = text(fromJooble ? ad.company : company?.display_name, 'Employer not listed')
      const title = text(ad.title, 'Opportunity')
      const description = cleanDescription(fromJooble ? ad.snippet : ad.description)
      const advertDetails = extractAdvertDetails(description)
      const salaryMin = typeof ad.salary_min === 'number' ? ad.salary_min : undefined
      const salaryMax = typeof ad.salary_max === 'number' ? ad.salary_max : undefined
      const salary = salaryMin === undefined && salaryMax === undefined
        ? text(ad.salary, 'Pay details in full advert')
        : `R${salaryMin?.toLocaleString('en-ZA') ?? '?'}${salaryMax ? ` – R${salaryMax.toLocaleString('en-ZA')}` : ''}`
      const applyUrl = text(fromJooble ? ad.link : ad.redirect_url)
      const safeApplyUrl = /^https:\/\//i.test(applyUrl) ? applyUrl : undefined
      const latitude = typeof ad.latitude === 'number' ? ad.latitude : undefined
      const longitude = typeof ad.longitude === 'number' ? ad.longitude : undefined
      const place = fromJooble ? text(ad.location, 'Location in full advert') : Array.isArray(location?.area)
        ? location.area.filter((part): part is string => typeof part === 'string').slice(-2).join(', ')
        : text(location?.display_name, 'Location on source listing')
      const category = ad.category as Record<string, unknown> | undefined
      const categoryText = `${title} ${description} ${text(category?.label)} ${text(ad.type)}`
      const opportunityCategory = /learnership/i.test(categoryText) ? 'Learnership' : /internship/i.test(categoryText) ? 'Internship' : /bursary|scholarship/i.test(categoryText) ? 'Bursary' : /volunteer/i.test(categoryText) ? 'Volunteering' : /training|trainee/i.test(categoryText) ? 'Training' : 'Job'

      return {
        id: `${provider.toLowerCase()}-${String(ad.id ?? crypto.randomUUID())}`,
        title,
        organisation: employer,
        initials: employer.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase(),
        category: opportunityCategory,
        place,
        pay: salary,
        closing: 'See source',
        description,
        requirements: advertDetails.requirements,
        skills: advertDetails.skills,
        colour: 'mint',
        screened: false,
        reports: 0,
        coordinates: latitude !== undefined && longitude !== undefined ? [latitude, longitude] : undefined,
        sourceName: provider,
        sourceUrl: provider === 'Jooble' ? 'https://za.jooble.org/' : 'https://www.adzuna.co.za',
        applicationUrl: safeApplyUrl,
        verifiedByUs: false,
        sourceCategory: text(category?.label),
      }
    }), ...yubhubRecords]

    const unique = new Map<string, Record<string, unknown>>()
    for (const opportunity of [...opportunities, ...(governmentCircular ? [governmentCircular] : [])]) {
      const key = `${text(opportunity.title).toLowerCase()}|${text(opportunity.organisation).toLowerCase()}|${text(opportunity.place).toLowerCase()}`
      if (!unique.has(key)) unique.set(key, opportunity)
    }
    feedCache = [...unique.values()]
    feedCacheExpiresAt = Date.now() + 30 * 60 * 1000
    return json({ opportunities: feedCache })
  } catch {
    return json({ error: 'The live job source is temporarily unavailable.' }, 502)
  }
})
