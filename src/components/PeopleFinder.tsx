import React, { useMemo, useState } from 'react'
import { Mail, MapPin, Phone, Search, UserRound } from 'lucide-react'
import { supabase } from '../lib/supabase'

type LeadRef = {
  id:string
  owner:string
  property:string
  city:string
}

type PersonResult = {
  id:string
  name:string
  phones:Array<{value:string; type:string; dnc:boolean|null}>
  emails:string[]
  mailingAddresses:string[]
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
  return { city, state:stateMatch?.[1] || '', zip:zipMatch?.[1] || '' }
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
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState('')
  const [copied,setCopied] = useState('')

  const selected = useMemo(()=>leads.find(l=>l.id===leadId) || null,[leads,leadId])

  const selectLead = (id:string) => {
    setLeadId(id)
    const lead = leads.find(l=>l.id===id)
    if (!lead) return
    const names = lead.owner.trim().split(/\s+/)
    setFirstName(names.length>1 ? names[0] : '')
    setLastName(names.length>1 ? names.slice(1).join(' ') : names[0] || '')
    setAddress(lead.property || '')
    const loc = parseLeadLocation(lead.city || '')
    setCity(loc.city)
    setState(loc.state)
    setZip(loc.zip)
    setResults([])
    setMessage('')
  }

  const searchPeople = async (e:React.FormEvent) => {
    e.preventDefault()
    if (!address.trim() || !city.trim() || state.trim().length!==2 || zip.trim().length!==5) {
      setMessage('Enter the property street address, city, 2-letter state, and ZIP.')
      return
    }

    setBusy(true)
    setMessage('')
    setResults([])
    try {
      const {data} = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Your sign-in session expired. Sign in again.')

      const response = await fetch('/api/people-finder',{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          Authorization:`Bearer ${token}`
        },
        body:JSON.stringify({
          first_name:firstName.trim(),
          last_name:lastName.trim(),
          address:address.trim(),
          city:city.trim(),
          state:state.trim().toUpperCase(),
          zip:zip.trim()
        })
      })
      const body = await response.json().catch(()=>({}))
      if (!response.ok) throw new Error(body.error || 'People Finder lookup failed.')
      const matches = Array.isArray(body.people) ? body.people : []
      setResults(matches)
      setMessage(matches.length ? `${matches.length} contact match${matches.length===1?'':'es'} found.` : 'No matching contact record was returned.')
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

  return <div className="workspaceStack">
    {message && <div className="loadingBanner">{message}</div>}

    <section className="workspaceHero card">
      <div><UserRound size={24}/><div>
        <h2>People Finder</h2>
        <p>Find contact information for the owner or claimant tied to a known property or DealFlow lead.</p>
      </div></div>
    </section>

    <section className="card workspaceSplit">
      <form className="workspaceForm" onSubmit={searchPeople}>
        <h3>Owner / claimant lookup</h3>

        <label>Use an existing lead
          <select value={leadId} onChange={e=>selectLead(e.target.value)}>
            <option value="">Manual lookup</option>
            {leads.map(l=><option key={l.id} value={l.id}>{l.owner} — {l.property}</option>)}
          </select>
        </label>

        <div className="fieldGrid">
          <label>First name<input value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="Optional"/></label>
          <label>Last name<input value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="Owner last name"/></label>
        </div>

        <label>Property street address<input value={address} onChange={e=>setAddress(e.target.value)} placeholder="123 Main St" required/></label>

        <div className="fieldGrid">
          <label>City<input value={city} onChange={e=>setCity(e.target.value)} placeholder="Fresno" required/></label>
          <label>State<input value={state} onChange={e=>setState(e.target.value.toUpperCase().slice(0,2))} placeholder="CA" maxLength={2} required/></label>
        </div>

        <label>ZIP<input value={zip} onChange={e=>setZip(e.target.value.replace(/\D/g,'').slice(0,5))} placeholder="93720" inputMode="numeric" required/></label>

        <button className="primary" disabled={busy}><Search size={16}/>{busy?' Finding contact…':' Find Contact'}</button>
        <small>For legitimate real-estate, claimant, and business contact research. Verify identity before outreach and honor DNC/TCPA requirements.</small>
      </form>

      <aside className="workspaceSide">
        <h3>What it returns</h3>
        <p>Matched name, phone numbers, email addresses, and mailing addresses when the provider has a confident match.</p>
        {selected && <div className="dataCard" style={{display:'block',marginTop:12}}>
          <b>{selected.owner}</b>
          <small>{selected.property}<br/>{selected.city}</small>
        </div>}
      </aside>
    </section>

    <section className="card">
      <div className="tableHead"><div><h2>Contact matches</h2><p>Only contact fields are shown. Demographic fields are intentionally excluded.</p></div></div>
      {results.length===0 ? <p className="emptyText">No results to display yet.</p> :
        <div className="dataCards">
          {results.map(person=><article className="dataCard" key={person.id} style={{display:'block'}}>
            <h3><UserRound size={16}/> {person.name || 'Matched person'}</h3>

            <div style={{marginTop:12}}>
              <b><Phone size={14}/> Phones</b>
              {person.phones.length===0 ? <small>No phone returned</small> :
                person.phones.map((p,i)=><div key={`${p.value}-${i}`} style={{display:'flex',gap:8,alignItems:'center',marginTop:7}}>
                  <span>{displayPhone(p.value)}{p.type ? ` · ${p.type}` : ''}{p.dnc===true ? ' · DNC' : ''}</span>
                  <button className="secondary" onClick={()=>copy(`phone-${person.id}-${i}`,p.value)}>{copied===`phone-${person.id}-${i}`?'Copied':'Copy'}</button>
                </div>)}
            </div>

            <div style={{marginTop:14}}>
              <b><Mail size={14}/> Emails</b>
              {person.emails.length===0 ? <small>No email returned</small> :
                person.emails.map((email,i)=><div key={`${email}-${i}`} style={{display:'flex',gap:8,alignItems:'center',marginTop:7}}>
                  <span>{email}</span>
                  <button className="secondary" onClick={()=>copy(`email-${person.id}-${i}`,email)}>{copied===`email-${person.id}-${i}`?'Copied':'Copy'}</button>
                </div>)}
            </div>

            <div style={{marginTop:14}}>
              <b><MapPin size={14}/> Mailing addresses</b>
              {person.mailingAddresses.length===0 ? <small>No mailing address returned</small> :
                person.mailingAddresses.map((a,i)=><small key={`${a}-${i}`} style={{marginTop:6}}>{a}</small>)}
            </div>
          </article>)}
        </div>}
    </section>
  </div>
}
