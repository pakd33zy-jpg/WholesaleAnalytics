const PROPERTY_TYPES = new Set([
  'Single Family','Condo','Townhouse','Manufactured','Multi-Family','Apartment','Land'
])

const text = value => Array.isArray(value) ? String(value[0] || '') : String(value || '')
const clamp = (value,min,max) => Math.min(max,Math.max(min,value))

function titleCaseCity(value) {
  return value.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

function yearsHeld(dateValue) {
  if (!dateValue) return null
  const d = new Date(dateValue)
  if (Number.isNaN(d.getTime())) return null
  const years = (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  return Math.max(0, Math.floor(years))
}

function latestAssessment(record) {
  const entries = Object.values(record?.taxAssessments || {})
    .filter(Boolean)
    .sort((a,b)=>Number(b?.year || 0)-Number(a?.year || 0))
  const value = Number(entries[0]?.value || 0)
  return value > 0 ? value : null
}

function scoreRecord(record) {
  let score = 35
  const reasons = []
  const held = yearsHeld(record?.lastSaleDate)

  if (record?.ownerOccupied === false) {
    score += 30
    reasons.push('absentee owner')
  }

  if (held != null) {
    if (held >= 15) { score += 20; reasons.push(`${held} years owned`) }
    else if (held >= 10) { score += 16; reasons.push(`${held} years owned`) }
    else if (held >= 5) { score += 10; reasons.push(`${held} years owned`) }
    else if (held >= 3) { score += 6; reasons.push(`${held} years owned`) }
  }

  const built = Number(record?.yearBuilt || 0)
  if (built > 0 && built <= 1985) {
    score += 10
    reasons.push('older property')
  } else if (built > 0 && built <= 2000) {
    score += 5
    reasons.push('mature property')
  }

  if (record?.owner?.type === 'Individual') {
    score += 4
    reasons.push('individual owner')
  }

  const mailingState = record?.owner?.mailingAddress?.state
  if (record?.ownerOccupied === false && mailingState && record?.state && mailingState !== record.state) {
    score += 5
    reasons.push('out-of-state owner')
  }

  return { score: clamp(score,0,99), reasons, held }
}

async function verifySupabaseUser(req) {
  const auth = text(req.headers.authorization)
  if (!auth.startsWith('Bearer ')) return false

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error('Server authentication is not configured.')

  const response = await fetch(`${url.replace(/\/$/,'')}/auth/v1/user`,{
    headers:{
      Authorization: auth,
      apikey: key
    }
  })
  return response.ok
}

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store')

  if (req.method !== 'GET') {
    res.setHeader('Allow','GET')
    return res.status(405).json({error:'Method not allowed'})
  }

  try {
    const authorized = await verifySupabaseUser(req)
    if (!authorized) return res.status(401).json({error:'Sign in to use Lead Finder.'})

    const apiKey = process.env.RENTCAST_API_KEY
    if (!apiKey) {
      return res.status(503).json({
        error:'Lead Finder is installed but RentCast is not connected yet. Add RENTCAST_API_KEY to the wholesale-analytics Vercel project.'
      })
    }

    const zipCode = text(req.query.zipCode).replace(/\D/g,'').slice(0,5)
    const city = titleCaseCity(text(req.query.city))
    const state = text(req.query.state).trim().toUpperCase().slice(0,2)
    const propertyType = text(req.query.propertyType).trim()
    const absenteeOnly = text(req.query.absenteeOnly) !== 'false'
    const minYears = clamp(Number(text(req.query.minYears) || 0),0,50)
    const minScore = clamp(Number(text(req.query.minScore) || 0),0,99)
    const limit = clamp(Number(text(req.query.limit) || 50),10,100)

    if (!zipCode && (!city || state.length !== 2)) {
      return res.status(400).json({error:'Enter a ZIP code, or a city plus 2-letter state.'})
    }
    if (propertyType && !PROPERTY_TYPES.has(propertyType)) {
      return res.status(400).json({error:'Unsupported property type.'})
    }

    const params = new URLSearchParams()
    if (zipCode) {
      params.set('zipCode',zipCode)
    } else {
      params.set('city',city)
      params.set('state',state)
    }
    if (propertyType) params.set('propertyType',propertyType)
    params.set('limit',String(Math.min(250,Math.max(100,limit * 3))))

    const upstream = await fetch(`https://api.rentcast.io/v1/properties?${params.toString()}`,{
      headers:{
        Accept:'application/json',
        'X-Api-Key':apiKey
      }
    })

    if (!upstream.ok) {
      if (upstream.status === 401) return res.status(502).json({error:'RentCast rejected the API key. Check RENTCAST_API_KEY in Vercel.'})
      if (upstream.status === 429) return res.status(429).json({error:'RentCast API quota or rate limit reached.'})
      return res.status(502).json({error:`Property provider returned ${upstream.status}.`})
    }

    const raw = await upstream.json()
    const records = Array.isArray(raw) ? raw : []

    const results = records.map(record=>{
      const ranked = scoreRecord(record)
      const ownerNames = Array.isArray(record?.owner?.names) ? record.owner.names.filter(Boolean) : []
      return {
        id: String(record?.id || record?.formattedAddress || Math.random()),
        ownerName: ownerNames.join(' & ') || 'Owner not listed',
        formattedAddress: String(record?.formattedAddress || ''),
        addressLine1: String(record?.addressLine1 || record?.formattedAddress || ''),
        city: String(record?.city || ''),
        state: String(record?.state || ''),
        zipCode: String(record?.zipCode || ''),
        propertyType: String(record?.propertyType || ''),
        yearBuilt: Number(record?.yearBuilt || 0) || null,
        ownerOccupied: typeof record?.ownerOccupied === 'boolean' ? record.ownerOccupied : null,
        ownerMailingAddress: String(record?.owner?.mailingAddress?.formattedAddress || ''),
        lastSaleDate: record?.lastSaleDate || null,
        lastSalePrice: Number(record?.lastSalePrice || 0) || null,
        assessedValue: latestAssessment(record),
        yearsHeld: ranked.held,
        score: ranked.score,
        reasons: ranked.reasons
      }
    })
    .filter(lead => !absenteeOnly || lead.ownerOccupied === false)
    .filter(lead => minYears <= 0 || (lead.yearsHeld != null && lead.yearsHeld >= minYears))
    .filter(lead => lead.score >= minScore)
    .sort((a,b)=>b.score-a.score)
    .slice(0,limit)

    return res.status(200).json({
      provider:'RentCast',
      results,
      count:results.length
    })
  } catch (error) {
    console.error('lead-finder error',error)
    return res.status(500).json({error:error instanceof Error ? error.message : 'Lead Finder failed.'})
  }
}
