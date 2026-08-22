const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://wnbavlsinslqyfbrobgx.supabase.co'
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Zu_8eyZC4vspm1X3Np0pjw_TMuTRQXw'
const txt=v=>String(v==null?'':v).trim()

async function authorized(req){
  const auth=txt(req.headers.authorization)
  if(!auth.startsWith('Bearer ')) return false
  const response=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{Authorization:auth,apikey:SUPABASE_KEY}})
  return response.ok
}

function formatAddress(a){
  if(!a) return ''
  return [txt(a.AddressLine1),txt(a.Suite),txt(a.City),txt(a.State),txt(a.PostalCode)].filter(Boolean).join(', ')
}

function normalize(r){
  return {
    id:txt(r?.MelissaIdentityKey||r?.RecordID||r?.FullName),
    name:txt(r?.FullName),
    address:formatAddress(r?.CurrentAddress),
    phones:(Array.isArray(r?.PhoneRecords)?r.PhoneRecords:[]).map(p=>txt(p?.phoneNumber)).filter(Boolean).slice(0,8),
    emails:(Array.isArray(r?.EmailRecords)?r.EmailRecords:[]).map(e=>txt(e?.email)).filter(Boolean).slice(0,8),
    resultCodes:txt(r?.Results)
  }
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store')
  if(req.method!=='POST'){
    res.setHeader('Allow','POST')
    return res.status(405).json({error:'Method not allowed'})
  }

  try{
    if(!(await authorized(req))) return res.status(401).json({error:'Sign in to use claimant People Finder.'})

    const key=process.env.MELISSA_LICENSE_KEY
    if(!key){
      return res.status(503).json({error:'Name-first claimant lookup is installed, but MELISSA_LICENSE_KEY is not connected in Vercel yet.'})
    }

    const body=req.body||{}
    const full=txt(body.claimant_name)
    const state=txt(body.state).toUpperCase().slice(0,2)
    if(!full) return res.status(400).json({error:'Claimant name is required.'})

    const params=new URLSearchParams({
      id:key,
      format:'JSON',
      full,
      cols:'Phone,Email,MelissaIdentityKey',
      opt:'SearchType:NameSearch,SearchConditions:progressive,RecordsPerPage:5'
    })
    if(state) params.set('state',state)

    const upstream=await fetch(`https://personatorsearch.melissadata.net/WEB/doPersonatorSearch?${params.toString()}`,{
      headers:{Accept:'application/json'}
    })

    const raw=await upstream.json().catch(()=>({}))
    if(!upstream.ok) return res.status(502).json({error:`Claimant People Finder provider returned ${upstream.status}.`})

    const matches=(Array.isArray(raw?.Records)?raw.Records:[]).map(normalize)
      .filter(p=>p.name && (p.address || p.phones.length || p.emails.length))

    if(matches.length===0) return res.status(200).json({status:'no_match',matches:[]})
    if(matches.length>1) return res.status(200).json({status:'needs_verification',matches})
    return res.status(200).json({status:'matched',person:matches[0],matches})
  }catch(err){
    console.error('surplus-people-finder error',err)
    return res.status(500).json({error:err instanceof Error?err.message:'Claimant People Finder failed.'})
  }
}
