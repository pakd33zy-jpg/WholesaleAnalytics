import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Mail, MapPin, Phone, Search, Sparkles, UserRound } from 'lucide-react'
import { supabase } from '../lib/supabase'

type LeadRef = {
  id:string
  owner:string
  property:string
  city:string
  source?:string
  score?:number
}

type PersonResult = {
  id:string
  name:string
  phones:Array<{value:string; type:string; dnc:boolean|null}>
  emails:string[]
  mailingAddresses:string[]
}

type SavedContact = {
  id:string
  lead_id:string
  person_name:string
  phones:Array<{value:string; type:string; dnc:boolean|null}>
  emails:string[]
  mailing_addresses:string[]
  provider:string
  match_status:'best_match'|'needs_verification'|'no_match'
  created_at:string
  updated_at:string
}

type Props = {
  leads: LeadRef[]
}

const cleanPhone = (value:string) => value.replace(/\D/g,'')
const displayPhone = (value:string) => {
  const d = cleanPhone(value)
  return d.length===10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : value
}

function parseLeadLocation(cityField:string) {
  const raw = cityField.trim()
  const zipMatch = raw.match(/\b(\d{5})(?:-\d{4})?\b/)
  const stateMatch = raw.match(/\b([A-Z]{2})\b(?=\s+\d{5}\b|\s*$)/)
  let city = raw
  if (zipMatch) city = city.replace(zipMatch[0],'').trim()
  if (stateMatch) city = city.replace(stateMatch[0],'').trim()
  city = city.replace(/[,\s]+$/,'').trim()
  return { city, state:stateMatch?.[1] || '', zip:zipMatch?.[1] || '' }
}

function splitOwnerName(name:string) {
  const clean = name.trim().replace(/\s+/g,' ')
  const parts = clean.split(' ').filter(Boolean)
  if (parts.length<=1) return {firstName:'',lastName:parts[0] || ''}
  return {firstName:parts[0],lastName:parts.slice(1).join(' ')}
}

export default function PeopleFinder({leads}:Props) {
  const [leadId,setLeadId] = useState('')
  const [firstName,setFirstName] = useState('')
  const [lastName,setLastName] = useState('')
  const [address,setAddress] = useState('')
  const [city,setCity] = useState('')
  const [state,setState] = useState('')
  const [zip,setZip] = useState('')
  const [results,setResults] = useState<PersonResult[]>([])
  const [saved,setSaved] = useState<SavedContact[]>([])
  const [contactsLoaded,setContactsLoaded] = useState(false)
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState('')
  const [progress,setProgress] = useState('')
  const [copied,setCopied] = useState('')
  const [threshold,setThreshold] = useState(85)
  const [includeDistress,setIncludeDistress] = useState(true)
  const [maxBatch,setMaxBatch] = useState(10)
  const [autoMode,setAutoMode] = useState(()=> {
    try { return window.localStorage.getItem('dealflow_auto_enrich') === '1' } catch { return false }
  })
  const autoRunRef = useRef('')

  const selected = useMemo(()=>leads.find(l=>l.id===leadId) || null,[leads,leadId])
  const savedLeadIds = useMemo(()=>new Set(saved.map(x=>x.lead_id)),[saved])

  const qualified = useMemo(()=>{
    return leads
      .filter(l=>{
        const distress = String(l.source || '').toLowerCase().includes('distress leads')
        return Number(l.score || 0) >= threshold || (includeDistress && distress)
      })
      .filter(l=>!savedLeadIds.has(l.id))
  },[leads,threshold,includeDistress,savedLeadIds])

  const batchCandidates = qualified.slice(0,maxBatch)

  const loadSaved = async () => {
    try {
      const {data,error} = await supabase
        .from('lead_contacts')
        .select('*')
        .order('updated_at',{ascending:false})
      if (error) throw error
      setSaved((data || []) as SavedContact[])
    } catch (err:any) {
      setMessage(err.message || 'Could not load saved contact enrichment.')
    } finally {
      setContactsLoaded(true)
    }
  }

  useEffect(()=>{ loadSaved() },[leads.length])

  useEffect(()=>{
    try { window.localStorage.setItem('dealflow_auto_enrich',autoMode?'1':'0') } catch {}
  },[autoMode])

  const selectLead = (id:string) => {
    setLeadId(id)
    const lead = leads.find(l=>l.id===id)
    if (!lead) return
    const names = splitOwnerName(lead.owner)
    setFirstName(names.firstName)
    setLastName(names.lastName)
    setAddress(lead.property || '')
    const loc = parseLeadLocation(lead.city || '')
    setCity(loc.city)
    setState(loc.state)
    setZip(loc.zip)
    setResults([])
    setMessage('')
  }

  const lookup = async (token:string, input:{
    firstName:string; lastName:string; address:string; city:string; state:string; zip:string
  }) => {
    const response = await fetch('/api/people-finder',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        Authorization:`Bearer ${token}`
      },
      body:JSON.stringify({
        first_name:input.firstName.trim(),
        last_name:input.lastName.trim(),
        address:input.address.trim(),
        city:input.city.trim(),
        state:input.state.trim().toUpperCase(),
        zip:input.zip.trim()
      })
    })
    const body = await response.json().catch(()=>({}))
    if (!response.ok) throw new Error(body.error || 'People Finder lookup failed.')
    return Array.isArray(body.people) ? body.people as PersonResult[] : []
  }

  const persistMatches = async (lead:LeadRef, people:PersonResult[]) => {
    const {error:deleteError} = await supabase.from('lead_contacts').delete().eq('lead_id',lead.id)
    if (deleteError) throw deleteError

    if (people.length===0) {
      const {error} = await supabase.from('lead_contacts').insert({
        lead_id:lead.id,
        person_name:lead.owner || 'Owner not listed',
        phones:[],
        emails:[],
        mailing_addresses:[],
        provider:'RealEstateAPI',
        match_status:'no_match'
      })
      if (error) throw error
      return
    }

    const status = people.length===1 ? 'best_match' : 'needs_verification'
    const rows = people.map(person=>({
      lead_id:lead.id,
      person_name:person.name || lead.owner || 'Matched person',
      phones:person.phones || [],
      emails:person.emails || [],
      mailing_addresses:person.mailingAddresses || [],
      provider:'RealEstateAPI',
      match_status:status
    }))

    const {error} = await supabase.from('lead_contacts').insert(rows)
    if (error) throw error
  }

  const enrichLead = async (lead:LeadRef, token:string) => {
    const loc = parseLeadLocation(lead.city || '')
    if (!lead.property || !loc.city || loc.state.length!==2 || loc.zip.length!==5) {
      return {status:'skipped' as const, detail:'missing city/state/ZIP'}
    }
    const names = splitOwnerName(lead.owner || '')
    const people = await lookup(token,{
      firstName:names.firstName,
      lastName:names.lastName,
      address:lead.property,
      city:loc.city,
      state:loc.state,
      zip:loc.zip
    })
    await persistMatches(lead,people)
    return {
      status:people.length===0 ? 'no_match' as const : people.length===1 ? 'matched' as const : 'verify' as const,
      detail:`${people.length} match${people.length===1?'':'es'}`
    }
  }

  const runBatch = async (candidates:LeadRef[], automatic=false) => {
    if (!candidates.length || busy) return
    setBusy(true)
    setMessage('')
    let matched=0, verify=0, noMatch=0, skipped=0, errors=0
    try {
      const {data} = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Your sign-in session expired. Sign in again.')

      for (let i=0;i<candidates.length;i++) {
        const lead=candidates[i]
        setProgress(`${automatic?'Auto-enriching':'Enriching'} ${i+1} of ${candidates.length}: ${lead.owner}`)
        try {
          const result=await enrichLead(lead,token)
          if (result.status==='matched') matched++
          else if (result.status==='verify') verify++
          else if (result.status==='no_match') noMatch++
          else skipped++
        } catch (err) {
          console.error('lead enrichment failed',lead.id,err)
          errors++
        }
      }

      await loadSaved()
      setMessage(`Enrichment complete: ${matched} matched · ${verify} need verification · ${noMatch} no match · ${skipped} skipped · ${errors} errors.`)
    } catch (err:any) {
      setMessage(err.message || 'Lead enrichment failed.')
    } finally {
      setProgress('')
      setBusy(false)
    }
  }

  useEffect(()=>{
    if (!autoMode || !contactsLoaded || busy || batchCandidates.length===0) return
    const key=batchCandidates.map(x=>x.id).join('|')
    if (!key || autoRunRef.current===key) return
    autoRunRef.current=key
    runBatch(batchCandidates,true)
    // run only when the pending qualified set changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[autoMode,contactsLoaded,batchCandidates.map(x=>x.id).join('|')])

  const searchPeople = async (e:React.FormEvent) => {
    e.preventDefault()
    if (!address.trim() || !city.trim() || state.trim().length!==2 || zip.trim().length!==5) {
      setMessage('For the current provider, enter a street address, city, 2-letter state, and ZIP. Selecting a home-list lead fills these automatically.')
      return
    }

    setBusy(true)
    setMessage('')
    setResults([])
    try {
      const {data} = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Your sign-in session expired. Sign in again.')

      const matches = await lookup(token,{firstName,lastName,address,city,state,zip})
      setResults(matches)

      if (selected) {
        await persistMatches(selected,matches)
        await loadSaved()
        setMessage(matches.length
          ? `${matches.length} contact match${matches.length===1?'':'es'} found and saved to ${selected.owner}.`
          : `No contact match was returned. The no-match result was saved so DealFlow will not spend another lookup on it automatically.`)
      } else {
        setMessage(matches.length ? `${matches.length} contact match${matches.length===1?'':'es'} found.` : 'No matching contact record was returned.')
      }
    } catch (err:any) {
      setMessage(err.message || 'People Finder lookup failed.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async (label:string,value:string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      window.setTimeout(()=>setCopied(''),1400)
    } catch {}
  }

  const savedGroups = useMemo(()=>{
    return leads
      .map(lead=>({lead,contacts:saved.filter(c=>c.lead_id===lead.id)}))
      .filter(group=>group.contacts.length>0)
  },[leads,saved])

  return <div className="workspaceStack">
    {message && <div className="loadingBanner">{message}{progress && <small style={{display:'block',marginTop:4}}>{progress}</small>}</div>}

    <section className="workspaceHero card">
      <div><UserRound size={24}/><div>
        <h2>People Finder + Auto Enrichment</h2>
        <p>Use your property lists to find owner contact data automatically, save it to the CRM, and flag ambiguous matches for verification.</p>
      </div></div>
    </section>

    <section className="card">
      <div className="sectionHeading"><Sparkles size={20}/><div>
        <h2>Enrich qualified home-list leads</h2>
        <p>DealFlow uses the owner and property location already stored on each lead. You do not have to retype the address.</p>
      </div></div>

      <div className="formGrid" style={{marginTop:16}}>
        <label><span>Minimum score</span><input type="number" min="0" max="99" value={threshold} onChange={e=>setThreshold(Number(e.target.value)||0)}/></label>
        <label><span>Maximum lookups per batch</span>
          <select value={maxBatch} onChange={e=>setMaxBatch(Number(e.target.value))}>
            <option value={5}>5</option><option value={10}>10</option><option value={25}>25</option>
          </select>
        </label>
        <label className="checkRow"><input type="checkbox" checked={includeDistress} onChange={e=>setIncludeDistress(e.target.checked)}/><span>Always include Distress Leads</span></label>
        <label className="checkRow"><input type="checkbox" checked={autoMode} onChange={e=>setAutoMode(e.target.checked)}/><span>Automatic mode when People Finder opens</span></label>
      </div>

      <div className="formActions" style={{marginTop:14}}>
        <button className="primary" disabled={busy || batchCandidates.length===0} onClick={()=>runBatch(batchCandidates)}>
          <Sparkles size={16}/> {busy?'Enriching…':`Enrich ${batchCandidates.length} Qualified Lead${batchCandidates.length===1?'':'s'}`}
        </button>
      </div>

      <p className="emptyText" style={{marginTop:10}}>
        {qualified.length} qualified lead{qualified.length===1?'':'s'} still need enrichment. The batch is capped at {maxBatch} to control paid lookup usage.
        A saved “no match” also prevents automatic repeat spending.
      </p>
    </section>

    <section className="card workspaceSplit">
      <form className="workspaceForm" onSubmit={searchPeople}>
        <h3>Single owner lookup</h3>

        <label>Use an existing home-list lead
          <select value={leadId} onChange={e=>selectLead(e.target.value)}>
            <option value="">Manual lookup</option>
            {leads.map(l=><option key={l.id} value={l.id}>{l.owner} — {l.property}</option>)}
          </select>
        </label>

        <div className="fieldGrid">
          <label>First name<input value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="Optional"/></label>
          <label>Last name<input value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="Optional"/></label>
        </div>

        <label>Property street address<input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Filled automatically from a lead"/></label>

        <div className="fieldGrid">
          <label>City<input value={city} onChange={e=>setCity(e.target.value)} placeholder="Fresno"/></label>
          <label>State<input value={state} onChange={e=>setState(e.target.value.toUpperCase().slice(0,2))} placeholder="CA" maxLength={2}/></label>
        </div>

        <label>ZIP<input value={zip} onChange={e=>setZip(e.target.value.replace(/\D/g,'').slice(0,5))} placeholder="93720" inputMode="numeric"/></label>

        <button className="primary" disabled={busy}><Search size={16}/>{busy?' Finding contact…':' Find Contact'}</button>
        <small>Current RealEstateAPI lookup uses the property address, but the automated workflow pulls that information from the home list for you.</small>
      </form>

      <aside className="workspaceSide">
        <h3>Match safety</h3>
        <p>One provider match is marked Best Match. Multiple possible people are saved as Needs Verification instead of DealFlow guessing who the owner is.</p>
        <div className="dataCard" style={{display:'block',marginTop:12}}>
          <b>{savedGroups.length} enriched leads</b>
          <small>{saved.filter(c=>c.match_status==='needs_verification').length} contact records need verification<br/>{saved.filter(c=>c.match_status==='no_match').length} saved no-match results</small>
        </div>
      </aside>
    </section>

    {results.length>0 && <section className="card">
      <div className="tableHead"><div><h2>Current lookup results</h2><p>Manual lookup results from this search.</p></div></div>
      <div className="dataCards">
        {results.map(person=><article className="dataCard" key={person.id} style={{display:'block'}}>
          <h3><UserRound size={16}/> {person.name || 'Matched person'}</h3>
          <small>{person.phones.length} phone(s) · {person.emails.length} email(s)</small>
        </article>)}
      </div>
    </section>}

    <section className="card">
      <div className="tableHead"><div>
        <h2>Enriched call / email queue</h2>
        <p>Only leads that have been processed by People Finder appear here. DNC flags are shown when the provider returns them.</p>
      </div></div>

      {savedGroups.length===0 ? <p className="emptyText">No enriched leads yet.</p> :
        <div className="dataCards">
          {savedGroups.map(({lead,contacts})=><article className="dataCard" key={lead.id} style={{display:'block'}}>
            <h3>{lead.owner}</h3>
            <small><MapPin size={12}/> {lead.property}<br/>{lead.city}</small>

            {contacts.map((person,pi)=><div key={person.id} style={{marginTop:14,paddingTop:12,borderTop:'1px solid rgba(148,163,184,.22)'}}>
              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                <b>{person.person_name || 'Matched person'}</b>
                {person.match_status==='best_match' && <span className="pill stagePill"><CheckCircle2 size={12}/> Best Match</span>}
                {person.match_status==='needs_verification' && <span className="pill stagePill"><AlertTriangle size={12}/> Needs Verification</span>}
                {person.match_status==='no_match' && <span className="pill stagePill">No Match</span>}
              </div>

              {person.phones.map((p,i)=><div key={`phone-${person.id}-${i}`} style={{display:'flex',gap:8,alignItems:'center',marginTop:8,flexWrap:'wrap'}}>
                <Phone size={13}/><span>{displayPhone(p.value)}{p.type?` · ${p.type}`:''}{p.dnc===true?' · DNC':''}</span>
                <button className="secondary" onClick={()=>copy(`phone-${person.id}-${i}`,p.value)}>{copied===`phone-${person.id}-${i}`?'Copied':'Copy'}</button>
              </div>)}

              {person.emails.map((email,i)=><div key={`email-${person.id}-${i}`} style={{display:'flex',gap:8,alignItems:'center',marginTop:8,flexWrap:'wrap'}}>
                <Mail size={13}/><span>{email}</span>
                <button className="secondary" onClick={()=>copy(`email-${person.id}-${i}`,email)}>{copied===`email-${person.id}-${i}`?'Copied':'Copy'}</button>
              </div>)}

              {person.mailing_addresses.map((a,i)=><small key={`addr-${person.id}-${i}`} style={{marginTop:7}}><MapPin size={12}/> {a}</small>)}

              {person.phones.some(p=>p.dnc===true) && <small style={{marginTop:8}}>DNC-marked numbers should not be placed into an outbound calling campaign.</small>}
            </div>)}
          </article>)}
        </div>}
    </section>

    <section className="card">
      <small>For legitimate real-estate, claimant, and business contact research. Verify identity before outreach. DNC/TCPA, state telemarketing, email, and privacy rules still apply; this feature does not automatically send calls, texts, or emails.</small>
    </section>
  </div>
}
