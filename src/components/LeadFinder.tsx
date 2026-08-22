import React, { useMemo, useState } from 'react'
import { Building2, LoaderCircle, MapPin, Plus, Search, UserRound } from 'lucide-react'
import { createLead } from '../lib/leads'
import { supabase } from '../lib/supabase'

type FinderLead = {
  id: string
  ownerName: string
  formattedAddress: string
  addressLine1: string
  city: string
  state: string
  zipCode: string
  propertyType: string
  yearBuilt: number | null
  ownerOccupied: boolean | null
  ownerMailingAddress: string
  lastSaleDate: string | null
  lastSalePrice: number | null
  assessedValue: number | null
  yearsHeld: number | null
  score: number
  reasons: string[]
}

type Props = {
  existingAddresses: string[]
  onRefreshLeads: () => Promise<void>
}

const money = (n:number|null) => n ? '$' + Math.round(n).toLocaleString() : '—'
const niceDate = (value:string|null) => value ? new Date(value).toLocaleDateString() : '—'

export default function LeadFinder({existingAddresses,onRefreshLeads}:Props) {
  const [city,setCity] = useState('')
  const [state,setState] = useState('')
  const [zip,setZip] = useState('')
  const [propertyType,setPropertyType] = useState('')
  const [absenteeOnly,setAbsenteeOnly] = useState(true)
  const [minYears,setMinYears] = useState(5)
  const [minScore,setMinScore] = useState(60)
  const [limit,setLimit] = useState(50)
  const [results,setResults] = useState<FinderLead[]>([])
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState('')
  const [adding,setAdding] = useState<string|null>(null)
  const [added,setAdded] = useState<Set<string>>(new Set())

  const existing = useMemo(()=>new Set(existingAddresses.map(x=>x.trim().toLowerCase()).filter(Boolean)),[existingAddresses])

  const search = async (e:React.FormEvent) => {
    e.preventDefault()
    if (!zip.trim() && (!city.trim() || state.trim().length !== 2)) {
      setMessage('Enter a ZIP code, or a city plus 2-letter state.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Your sign-in session expired. Sign in again and retry.')

      const q = new URLSearchParams()
      if (zip.trim()) q.set('zipCode',zip.trim())
      if (city.trim()) q.set('city',city.trim())
      if (state.trim()) q.set('state',state.trim().toUpperCase())
      if (propertyType) q.set('propertyType',propertyType)
      q.set('absenteeOnly',String(absenteeOnly))
      q.set('minYears',String(Math.max(0,minYears)))
      q.set('minScore',String(Math.max(0,minScore)))
      q.set('limit',String(Math.min(100,Math.max(10,limit))))

      const response = await fetch(`/api/lead-finder?${q.toString()}`,{
        headers:{ Authorization:`Bearer ${token}` }
      })
      const body = await response.json().catch(()=>({}))
      if (!response.ok) throw new Error(body.error || 'Lead search failed')
      setResults(Array.isArray(body.results) ? body.results : [])
      setMessage(`${body.results?.length || 0} lead candidates found.`)
    } catch (err:any) {
      setResults([])
      setMessage(err.message || 'Lead search failed')
    } finally {
      setBusy(false)
    }
  }

  const addToCrm = async (lead:FinderLead) => {
    setAdding(lead.id)
    setMessage('')
    try {
      await createLead({
        owner_name: lead.ownerName || 'Owner not listed',
        property_address: lead.addressLine1 || lead.formattedAddress,
        city: [lead.city,lead.state,lead.zipCode].filter(Boolean).join(' '),
        source: 'Lead Finder · RentCast',
        stage: 'New',
        score: lead.score,
        arv: 0,
        asking: 0,
        repairs: 0,
        last_touch: 'Never',
        next_action: 'Verify owner contact and property condition'
      })
      setAdded(prev=>new Set(prev).add(lead.id))
      setMessage(`${lead.ownerName || 'Lead'} added to the CRM.`)
      await onRefreshLeads()
    } catch (err:any) {
      setMessage(err.message || 'Could not add lead')
    } finally {
      setAdding(null)
    }
  }

  return <div className="workspaceStack">
    {message && <div className="loadingBanner">{message}</div>}

    <section className="workspaceHero card">
      <div><Search size={24}/><div><h2>Nationwide lead finder</h2><p>Search property records and rank likely wholesale prospects by absentee ownership, ownership length and property age.</p></div></div>
    </section>

    <section className="card">
      <form onSubmit={search} className="formGrid">
        <label><span>City</span><input value={city} onChange={e=>setCity(e.target.value)} placeholder="Fresno" /></label>
        <label><span>State</span><input value={state} onChange={e=>setState(e.target.value.toUpperCase().slice(0,2))} placeholder="CA" maxLength={2} /></label>
        <label><span>ZIP code</span><input value={zip} onChange={e=>setZip(e.target.value.replace(/\D/g,'').slice(0,5))} placeholder="93720" inputMode="numeric" /></label>

        <label><span>Property type</span>
          <select value={propertyType} onChange={e=>setPropertyType(e.target.value)}>
            <option value="">All residential</option>
            <option value="Single Family">Single Family</option>
            <option value="Multi-Family">Multi-Family</option>
            <option value="Manufactured">Manufactured</option>
            <option value="Townhouse">Townhouse</option>
            <option value="Condo">Condo</option>
            <option value="Apartment">Apartment</option>
            <option value="Land">Land</option>
          </select>
        </label>

        <label><span>Minimum years owned</span><input type="number" min="0" max="50" value={minYears} onChange={e=>setMinYears(Number(e.target.value)||0)} /></label>
        <label><span>Minimum lead score</span><input type="number" min="0" max="99" value={minScore} onChange={e=>setMinScore(Number(e.target.value)||0)} /></label>
        <label><span>Maximum results</span><select value={limit} onChange={e=>setLimit(Number(e.target.value))}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label>

        <label className="checkRow"><input type="checkbox" checked={absenteeOnly} onChange={e=>setAbsenteeOnly(e.target.checked)} /><span>Absentee owners only</span></label>
        <div className="formActions"><button className="primary" disabled={busy}>{busy ? <LoaderCircle size={16}/> : <Search size={16}/>} {busy?'Searching…':'Find leads'}</button></div>
      </form>
      <p className="emptyText">Tip: a ZIP-only search is fastest. One search can return many properties while using one provider request.</p>
    </section>

    <section className="card">
      <div className="tableHead"><div><h2>Lead candidates</h2><p>{results.length ? 'Highest scores are shown first.' : 'Run a search to find potential sellers.'}</p></div></div>
      <div className="tableWrap"><table>
        <thead><tr><th>Score</th><th>Owner / Property</th><th>Why it scored</th><th>Ownership</th><th>Property</th><th>Last sale</th><th></th></tr></thead>
        <tbody>
          {results.map(lead=>{
            const duplicate = existing.has((lead.addressLine1 || '').trim().toLowerCase())
            const isAdded = added.has(lead.id) || duplicate
            return <tr key={lead.id}>
              <td><span className={`pill scorePill ${lead.score>=85?'hot':''}`}>{lead.score}</span></td>
              <td><b>{lead.ownerName || 'Owner not listed'}</b><small><MapPin size={12}/> {lead.formattedAddress}</small></td>
              <td><small>{lead.reasons.join(' · ') || 'Property record match'}</small></td>
              <td><small><UserRound size={12}/> {lead.ownerOccupied===false?'Absentee owner':lead.ownerOccupied===true?'Owner occupied':'Occupancy unknown'}<br/>{lead.yearsHeld==null?'Ownership length unknown':`${lead.yearsHeld} years owned`}</small></td>
              <td><small><Building2 size={12}/> {lead.propertyType || 'Unknown'}<br/>{lead.yearBuilt?`Built ${lead.yearBuilt}`:'Year unknown'}<br/>Assessed {money(lead.assessedValue)}</small></td>
              <td><small>{niceDate(lead.lastSaleDate)}<br/>{money(lead.lastSalePrice)}</small></td>
              <td><button className="secondary" disabled={isAdded || adding===lead.id} onClick={()=>addToCrm(lead)}>{isAdded?'In CRM':adding===lead.id?'Adding…':<><Plus size={14}/> Add</>}</button></td>
            </tr>
          })}
        </tbody>
      </table></div>
    </section>
  </div>
}
