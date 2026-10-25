export type Opportunity = {
  id: string; title: string; organisation: string; initials: string; category: string; place: string
  distance?: number; transport?: number; pay: string; closing: string; description: string
  requirements: { label: string; met: boolean; blocker?: boolean }[]; skills: string[]
  colour: string; verifiedUntil?: string; verifiedAt?: string; verificationMethod?: string; screened: boolean; reports: number; coordinates?: [number, number]
  sourceName?: string; sourceUrl?: string; applicationUrl?: string; verifiedByUs?: boolean; verificationStatus?: 'verified' | 'source' | 'unavailable'
}

export type OpportunityLoadStatus = 'loading' | 'live' | 'empty' | 'unconfigured' | 'error'
