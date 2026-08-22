const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://wnbavlsinslqyfbrobgx.supabase.co'
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Zu_8eyZC4vspm1X3Np0pjw_TMuTRQXw'

const text = value => String(value == null ? '' : value).trim()
const clamp = (value,min,max) => Math.min(max,Math.max(min,value))

async function verifyUser(req) {
  const auth=text(req.headers.authorization)
  if (!auth.startsWith('Bearer ')) return false
  const r=await fetch(`${SUPABASE_URL}/auth/v1/user`,{
    headers:{Authorization:auth,apikey:SUPABASE_KEY}
  })
  return r.ok
}

function ownerName(r) {
  const one=[r?.owner1FirstName,r?.owner1LastName].filter(Boolean).join(' ').trim()
  const two=[r?.owner2FirstName,r?.owner2LastName].filter(Boolean).join(' ').trim()
  return [one,two].filter(Boolean).join(' & ') || text(r?.ownerName) || 'Owner not listed'
}

function addressParts(r) {
  const a=r?.address || r?.propertyInfo?.address || {}
  return {
    address:text(a.address || a.label || [a.street,a.city,a.state,a.zip].filter(Boolean).join(', ')),
    street:text(a.street || a.address),
    city:text(a.city),
    state:text(a.state),
    zip:text(a.zip)
  }
}

function score(r,reasons) {
  let s=70
  if (reasons.includes('Pre-Foreclosure')) s=95
  else if (reasons.includes('Tax Lien')) s=92
  else if (reasons.includes('Tax Delinquent')) s=90
  else if (reasons.includes('Inherited')) s=88

  if (r?.absenteeOwner) s+=2
  if (r?.vacant) s+=2
  if (r?.highEquity || Number(r?.equityPercent||0)>=50) s+=2
  return clamp(s,0,99)
}

function normalize(r,mode,index) {
  const reasons=[]
  if (r?.preForeclosure || mode==='preforeclosure') reasons.push('Pre-Foreclosure')
  if (r?.taxLien) reasons.push('Tax Lien')
  if (r?.taxDelinquentYear) reasons.push('Tax Delinquent')
  if (r?.inherited || mode==='inherited') reasons.push('Inherited')
  if (mode==='tax' && reasons.length===0) reasons.push('Tax Distress')

  const addr=addressParts(r)
  return {
    id:text(r?.id || r?.propertyId || `${mode}-${index}-${addr.address}`),
    ownerName:ownerName(r),
    ...addr,
    propertyType:text(r?.propertyType || r?.propertyUse),
    estimatedValue:Number(r?.estimatedValue || 0) || null,
    estimatedEquity:Number(r?.estimatedEquity || 0) || null,
    equityPercent:Number.isFinite(Number(r?.equityPercent)) ? Number(r.equityPercent) : null,
    absenteeOwner:Boolean(r?.absenteeOwner),
    vacant:Boolean(r?.vacant),
    yearsOwned:Number.isFinite(Number(r?.yearsOwned)) ? Number(r.yearsOwned) : null,
    distressReasons:[...new Set(reasons)],
    taxDelinquentYear:Number(r?.taxDelinquentYear || 0) || null,
    score:score(r,reasons)
  }
}

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store')

  if (req.method!=='POST') {
    res.setHeader('Allow','POST')
    return res.status(405).json({error:'Method not allowed'})
  }

  try {
    if (!(await verifyUser(req))) {
      return res.status(401).json({error:'Sign in to use Distress Leads.'})
    }

    const apiKey=process.env.REALESTATEAPI_KEY
    if (!apiKey) {
      return res.status(503).json({
        error:'Distress Leads is installed but RealEstateAPI is not connected yet. Add REALESTATEAPI_KEY to the wholesale-analytics Vercel project.'
      })
    }

    const body=req.body || {}
    const mode=text(body.mode)
    const city=text(body.city)
    const state=text(body.state).toUpperCase().slice(0,2)
    const zip=text(body.zip).replace(/\D/g,'').slice(0,5)
    const limit=clamp(Number(body.limit || 50),1,200)

    if (!['preforeclosure','tax','inherited'].includes(mode)) {
      return res.status(400).json({error:'Invalid distress search type.'})
    }
    if (!zip && (!city || state.length!==2)) {
      return res.status(400).json({error:'Enter a ZIP code, or a city plus 2-letter state.'})
    }

    const payload={size:limit}
    if (zip) payload.zip=zip
    else {
      payload.city=city
      payload.state=state
    }

    if (body.absenteeOnly) payload.absentee_owner=true
    if (body.highEquityOnly) payload.high_equity=true
    if (body.vacantOnly) payload.vacant=true

    if (mode==='preforeclosure') {
      payload.pre_foreclosure=true
      payload.search_range='6_MONTH'
    } else if (mode==='tax') {
      payload.tax_lien=true
    } else if (mode==='inherited') {
      payload.inherited=true
    }

    const upstream=await fetch('https://api.realestateapi.com/v2/PropertySearch',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key':apiKey
      },
      body:JSON.stringify(payload)
    })

    const raw=await upstream.json().catch(()=>({}))
    if (!upstream.ok) {
      const detail=text(raw?.message || raw?.error || raw?.statusMessage).slice(0,300)
      console.error('Distress Leads provider error',{status:upstream.status,detail,mode})

      if (upstream.status===401 || upstream.status===403) {
        return res.status(502).json({error:'RealEstateAPI rejected REALESTATEAPI_KEY. Check the key in Vercel.'})
      }
      if (upstream.status===402) {
        return res.status(402).json({error:'RealEstateAPI needs credits or an active plan for Property Search.'})
      }
      if (upstream.status===429) {
        return res.status(429).json({error:'RealEstateAPI rate limit reached. Try again later.'})
      }
      return res.status(502).json({error:detail || `Property Search returned ${upstream.status}.`})
    }

    const records=
      Array.isArray(raw?.data) ? raw.data :
      Array.isArray(raw?.results) ? raw.results :
      Array.isArray(raw?.properties) ? raw.properties :
      Array.isArray(raw) ? raw : []

    const results=records.map((r,i)=>normalize(r,mode,i)).filter(r=>r.address)

    console.log('Distress Leads search',{
      mode,
      location:zip || `${city}, ${state}`,
      returned:results.length,
      resultCount:raw?.resultCount ?? raw?.count ?? null
    })

    return res.status(200).json({
      mode,
      results,
      count:results.length,
      resultCount:raw?.resultCount ?? raw?.count ?? null
    })
  } catch (err) {
    console.error('distress-leads error',err)
    return res.status(500).json({error:err instanceof Error ? err.message : 'Distress Leads failed.'})
  }
}
