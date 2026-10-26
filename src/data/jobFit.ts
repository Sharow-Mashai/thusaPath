import type { Opportunity } from './types'

const skillVocabulary = [
  'communication', 'customer service', 'teamwork', 'problem solving', 'computer literacy', 'Microsoft Office', 'Excel',
  'data entry', 'driving', 'sales', 'retail', 'cleaning', 'cooking', 'stock control', 'cash handling', 'time management',
  'writing', 'numeracy', 'organisation', 'attention to detail', 'people skills', 'English', 'isiZulu', 'Afrikaans',
  'first aid', 'food handling', 'security', 'administration', 'telephone skills', 'lifting', 'typing',
]

const normalise = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function isNearLocation(place: string, profileLocation: string): boolean {
  const generalAreas = new Set(['south africa', 'rsa', 'remote', 'anywhere'])
  const areas = profileLocation.split(/[,;/]/).map(normalise).filter(area => area.length > 1 && !generalAreas.has(area))
  const listingPlace = normalise(place)
  return Boolean(listingPlace && areas.some(area => listingPlace.includes(area)))
}

export type DeviceCoordinates = [number, number]
export const NEARBY_RADIUS_KM = 50

export function distanceInKm(from: DeviceCoordinates, to: DeviceCoordinates): number {
  const radians = (degrees: number) => degrees * Math.PI / 180
  const [lat1, lon1] = from.map(radians)
  const [lat2, lon2] = to.map(radians)
  const deltaLat = lat2 - lat1
  const deltaLon = lon2 - lon1
  const haversine = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

export function isNearbyOpportunity(item: Opportunity, deviceLocation: DeviceCoordinates | null, profileLocation: string): boolean {
  if (deviceLocation) return item.coordinates ? distanceInKm(deviceLocation, item.coordinates) <= NEARBY_RADIUS_KM : false
  return isNearLocation(item.place, profileLocation)
}

export function sortByProximity<T extends Opportunity>(items: T[], deviceLocation: DeviceCoordinates | null, profileLocation: string, tieBreaker: (a: T, b: T) => number = () => 0): T[] {
  return [...items].sort((a, b) => {
    if (deviceLocation) {
      const distanceA = a.coordinates ? distanceInKm(deviceLocation, a.coordinates) : Number.POSITIVE_INFINITY
      const distanceB = b.coordinates ? distanceInKm(deviceLocation, b.coordinates) : Number.POSITIVE_INFINITY
      if (distanceA !== distanceB) return distanceA - distanceB
    }
    const areaOrder = Number(isNearLocation(b.place, profileLocation)) - Number(isNearLocation(a.place, profileLocation))
    return areaOrder || tieBreaker(a, b)
  })
}

function profileTerms(profile: { skills: string[]; education: string }): string[] {
  const education = normalise(profile.education)
  const aliases = /grade 12|matric/.test(education) ? ['grade 12', 'matric'] : []
  return [...new Set([profile.education, ...profile.skills, ...aliases].map(normalise).filter(term => term.length > 1))]
}

export function advertSkills(item: Opportunity): string[] {
  const text = `${item.title}\n${item.description}`
  const mentioned = skillVocabulary.filter(skill => new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text))
  const explicit = item.skills.filter(Boolean)
  const extra = [...text.matchAll(/(?:experience with|knowledge of|proficient in|skilled in|ability to use|skills include)\s+([^.;\n]{3,70})/gi)]
    .map(match => match[1].trim().replace(/\s+/g, ' '))
  return [...new Set([...explicit, ...mentioned, ...extra])].slice(0, 8)
}

export function advertRequirements(item: Opportunity): string[] {
  const source = item.requirements.map(requirement => requirement.label).filter(Boolean)
  if (source.length) return [...new Set(source)].slice(0, 8)
  const text = item.description.replace(/\s+/g, ' ').trim()
  const clauses = text.split(/(?<=[.!?])\s+|\s*[•;]\s*/).map(part => part.replace(/^[-–*\s]+/, '').trim())
  const requirementCue = /\b(requirements?|must have|must be|need(?:ed)? to|qualification|matric|grade\s*12|experience|licen[cs]e|certificate|degree|diploma|fluent|proficien|able to|ability to|minimum of|at least|skills include|knowledge of)\b/i
  const seen = new Set<string>()
  return clauses.filter(part => part.length >= 10 && part.length <= 240 && requirementCue.test(part)).filter(part => {
    const key = normalise(part)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 8)
}

export function isBeginnerFriendly(item: Opportunity): boolean {
  const text = `${item.title} ${item.description}`
  return /\b(no experience (?:needed|required)|without (?:any )?experience|entry[- ]level|first[- ]job|school leaver|learnership|internship|trainee|training provided|willing to train|junior)\b/i.test(text)
}

export function profileFit(item: Opportunity, profile: { skills: string[]; education: string; location?: string }): number {
  const requirements = [...advertSkills(item), ...advertRequirements(item)]
  const terms = profileTerms(profile)
  const matches = requirements.filter(requirement => {
    const target = normalise(requirement)
    return terms.some(term => target.includes(term) || term.includes(target))
  }).length
  const requirementsScore = requirements.length ? matches / requirements.length : 0
  const place = normalise(item.place)
  const wantedPlace = normalise(profile.location || '')
  const locationMatch = Boolean(wantedPlace && place && (place.includes(wantedPlace) || wantedPlace.includes(place)))
  return Math.min(1, requirementsScore * 0.75 + Number(locationMatch) * 0.25)
}
