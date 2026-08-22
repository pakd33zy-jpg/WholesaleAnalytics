const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://wnbavlsinslqyfbrobgx.supabase.co'
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Zu_8eyZC4vspm1X3Np0pjw_TMuTRQXw'

const txt = v => String(v == null ? '' : v).trim()

async function authorized(req) {
  const auth = txt(req.headers.authorization)
  if (!auth.startsWith('Bearer ')) return false

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`,{
    headers:{ Authorization:auth, apikey:SUPABASE_KEY }
  })
  return response.ok
}

function phoneValue(p) {
  if (typeof p === 'string') return p
  return txt(p?.phone || p?.number || p?.phoneNumber || p?.display)
}

function phoneType(p) {
  if (!p || typeof p === 'string') return ''
  return txt(p?.type || p?.phoneType || p?.lineType)
}

function phoneDnc(p) {
  if (!p || typeof p === 'string') return null
  const value = p?.dnc ?? p?.doNotCall ?? p?.isDnc
  return typeof value === 'boolean' ? value : null
}

function normalizeAddress(a) {
  if (!a) return ''
  if (typeof a === 'string') return a
  return txt(
    a.formattedAddress ||
    a.address ||
    [a.street || a.address1 || a.line1, a.city, a.state, a.zip || a.zipCode].filter(Boolean).join(', ')
  )
}

function normalizePerson(person,index) {
  const first = txt(person?.firstName || person?.first_name || person?.first)
  const middle = txt(person?.middleName || person?.middle_name || person?.middle)
  const last = txt(person?.lastName || person?.last_name || person?.last)
  const name = txt(person?.name || person?.fullName || [first,middle,last].filter(Boolean).join(' ')) || 'Matched person'

  const phonesRaw = Array.isArray(person?.phones) ? person.phones :
                    Array.isArray(person?.phoneNumbers) ? person.phoneNumbers : []
  const phones = phonesRaw
    .map(p=>({value:phoneValue(p),type:phoneType(p),dnc:phoneDnc(p)}))
    .filter(p=>p.value)
    .slice(0,8)

  const emailsRaw = Array.isArray(person?.emails) ? person.emails :
                    Array.isArray(person?.emailAddresses) ? person.emailAddresses : []
  const emails = emailsRaw
    .map(e=>typeof e === 'string' ? e : txt(e?.email || e?.address || e?.value))
    .filter(Boolean)
    .slice(0,8)

  const addressesRaw = [
    ...(Array.isArray(person?.addresses) ? person.addresses : []),
    ...(Array.isArray(person?.mailingAddresses) ? person.mailingAddresses : []),
    person?.mailingAddress
  ].filter(Boolean)

  const mailingAddresses = [...new Set(addressesRaw.map(normalizeAddress).filter(Boolean))].slice(0,6)

  return {
    id:txt(person?.id || person?.personId || `${index}-${name}`),
    name,
    phones,
    emails,
    mailingAddresses
  }
}

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store')

  if (req.method !== 'POST') {
    res.setHeader('Allow','POST')
    return res.status(405).json({error:'Method not allowed'})
  }

  try {
    if (!(await authorized(req))) {
      return res.status(401).json({error:'Sign in to use People Finder.'})
    }

    const apiKey = process.env.REALESTATEAPI_KEY
    if (!apiKey) {
      return res.status(503).json({
        error:'People Finder is installed but the contact-data provider is not connected yet. Add REALESTATEAPI_KEY to the wholesale-analytics Vercel project.'
      })
    }

    const body = req.body || {}
    const address = txt(body.address)
    const city = txt(body.city)
    const state = txt(body.state).toUpperCase().slice(0,2)
    const zip = txt(body.zip).replace(/\D/g,'').slice(0,5)
    const firstName = txt(body.first_name)
    const lastName = txt(body.last_name)

    if (!address || !city || state.length!==2 || zip.length!==5) {
      return res.status(400).json({error:'Property address, city, state, and ZIP are required.'})
    }

    const payload = {
      address,
      city,
      state,
      zip
    }
    if (firstName) payload.first_name = firstName
    if (lastName) payload.last_name = lastName

    const upstream = await fetch('https://api.realestateapi.com/v2/SkipTrace',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key':apiKey
      },
      body:JSON.stringify(payload)
    })

    const raw = await upstream.json().catch(()=>({}))
    if (!upstream.ok) {
      if (upstream.status===401 || upstream.status===403) {
        return res.status(502).json({error:'The People Finder provider rejected the API key. Check REALESTATEAPI_KEY in Vercel.'})
      }
      if (upstream.status===402) {
        return res.status(402).json({error:'The People Finder provider account needs credits or an active plan.'})
      }
      if (upstream.status===429) {
        return res.status(429).json({error:'People Finder provider rate limit reached. Try again later.'})
      }
      return res.status(502).json({error:`People Finder provider returned ${upstream.status}.`})
    }

    const persons =
      Array.isArray(raw?.persons) ? raw.persons :
      Array.isArray(raw?.data?.persons) ? raw.data.persons :
      Array.isArray(raw?.output?.persons) ? raw.output.persons :
      raw?.person ? [raw.person] :
      raw?.data?.person ? [raw.data.person] :
      []

    const people = persons.map(normalizePerson)
      .filter(p=>p.phones.length || p.emails.length || p.mailingAddresses.length)

    return res.status(200).json({people,count:people.length})
  } catch (err) {
    console.error('people-finder error',err)
    return res.status(500).json({error:err instanceof Error ? err.message : 'People Finder failed.'})
  }
}
