import React, { useMemo, useState } from 'react'
import { BadgeDollarSign, Building2, CircleAlert, Gavel, LoaderCircle, MapPin, Plus, Search, UserRound } from 'lucide-react'
import { createLead } from '../lib/leads'
import { supabase } from '../lib/supabase'

type Mode = 'preforeclosure'|'tax'|'inherited'

type DistressLead = {
  id:string
  ownerName:string
  address:string
  street:string
  city:string
  state:string
  zip:string
  propertyType:string
  estimatedValue:number|null
  estimatedEquity:number|null
  equityPercent:number|null
  absenteeOwner:boolean
  vacant:boolean
  yearsOwned:number|null
  distressReasons:string[]
  taxDelinquentYear:number|null
  score:number
}

type Props = {
  existingAddresses:string[]
  onRefreshLeads:()=>Promise<void>
}

const money = (n:number|null) => n == null ? '—' : '$' + Math.round(n).toLocaleString()

const modeInfo:Record<Mode,{label:string;help:string}> = {
  preforeclosure:{
    label:'Pre-Foreclosure',
    help:'Recent pre-foreclosure records. This is the strongest direct distress search in the module.'
  },
  tax:{
    label:'Tax Lien / Delinquent',
    help:'Properties flagged with tax liens or delinquent-tax year data.'
  },
  inherited:{
    label:'Inherited / Probate Leads',
    help:'Inherited-property signals. These are not confirmation that an active probate court case exists.'
  }
}

export default function DistressLeads({existingAddresses,onRefreshLeads}:Props) {
  const [mode,setMode] = useState<Mode>('preforeclosure')
  const [city,setCity] = useState('')
  const [state,setState] = useState('')
  const [zip,setZip] = useState('')
  const [absenteeOnly,setAbsenteeOnly] = useState(false)
  const [highEquityOnly,setHighEquityOnly] = useState(false)
  const [vacantOnly,setVacantOnly] = useState(false)
  const [limit,setLimit] = useState(50)
  const [results,setResults] = useState<DistressLead[]>([])
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState('')
  const [adding,setAdding] = useState<string|null>(null)
  const [added,setAdded] = useState<Set<string>>(new Set())

  const existing = useMemo(
    ()=>new Set(existingAddresses.map(x=>x.trim().toLowerCase()).filter(Boolean)),
    [existingAddresses]
  )

  const runSearch = async (e:React.FormEvent) => {
    e.preventDefault()
    if (!zip.trim() && (!city.trim() || state.trim().length!==2)) {
      setMessage('Enter a ZIP code, or a city plus 2-letter state.')
      return
    }

    setBusy(true)
    setMessage('')
    setResults([])

    try {
      const {data} = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Your sign-in session expired. Sign in again.')

      const response = await fetch('/api/distress-leads',{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          Authorization:`Bearer ${token}`
        },
        body:JSON.stringify({
          mode,
          city:city.trim(),
          state:state.trim().toUpperCase(),
          zip:zip.trim(),
          absenteeOnly,
          highEquityOnly,
          vacantOnly,
          limit
        })
      })

      const body = await response.json().catch(()=>({}))
      if (!response.ok) throw new Error(body.error || 'Distress lead search failed.')

      const rows = Array.isArray(body.results) ? body.results : []
      setResults(rows)
      setMessage(`${rows.length} ${modeInfo[mode].label.toLowerCase()} lead${rows.length===1?'':'s'} found${body.resultCount != null ? ` · ${body.resultCount} total provider matches` : ''}.`)
    } catch (err:any) {
      setMessage(err.message || 'Distress lead search failed.')
    } finally {
      setBusy(false)
    }
  }

  const addToCrm = async (lead:DistressLead) => {
    setAdding(lead.id)
    try {
      await createLead({
        owner_name:lead.ownerName || 'Owner not listed',
        property_address:lead.street || lead.address,
        city:[lead.city,lead.state,lead.zip].filter(Boolean).join(' '),
        source:`Distress Leads · ${lead.distressReasons.join(' + ') || modeInfo[mode].label}`,
        stage:'New',
        score:lead.score,
        arv:lead.estimatedValue || 0,
        asking:0,
        repairs:0,
        last_touch:'Never',
        next_action:'Verify distress record, run People Finder, then contact owner'
      })
      setAdded(prev=>new Set(prev).add(lead.id))
      setMessage(`${lead.ownerName || 'Lead'} added to CRM. Next: verify the record and run People Finder.`)
      await onRefreshLeads()
    } catch (err:any) {
      setMessage(err.message || 'Could not add distress lead.')
    } finally {
      setAdding(null)
    }
  }

  return <div className="workspaceStack">
    {message && <div className="loadingBanner">{message}</div>}

    <section className="workspaceHero card">
      <div><CircleAlert size={24}/><div>
        <h2>Distress Leads</h2>
        <p>Search actual property distress signals instead of relying only on generic motivation scoring.</p>
      </div></div>
    </section>

    <section className="card">
      <div className="quickToolBtns" style={{marginBottom:18}}>
        {(Object.keys(modeInfo) as Mode[]).map(m=>
          <button
            key={m}
            type="button"
            className={mode===m?'primary':'secondary'}
            onClick={()=>{setMode(m);setResults([]);setMessage('')}}
          >
            {m==='preforeclosure'?<Gavel size={16}/>:m==='tax'?<BadgeDollarSign size={16}/>:<UserRound size={16}/>}
            {modeInfo[m].label}
          </button>
        )}
      </div>

      <p className="emptyText" style={{marginBottom:14}}>{modeInfo[mode].help}</p>

      <form className="formGrid" onSubmit={runSearch}>
        <label><span>City</span><input value={city} onChange={e=>setCity(e.target.value)} placeholder="Fresno"/></label>
        <label><span>State</span><input value={state} onChange={e=>setState(e.target.value.toUpperCase().slice(0,2))} placeholder="CA" maxLength={2}/></label>
        <label><span>ZIP code</span><input value={zip} onChange={e=>setZip(e.target.value.replace(/\D/g,'').slice(0,5))} placeholder="93720" inputMode="numeric"/></label>
        <label><span>Maximum results</span>
          <select value={limit} onChange={e=>setLimit(Number(e.target.value))}>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </label>

        <label className="checkRow"><input type="checkbox" checked={absenteeOnly} onChange={e=>setAbsenteeOnly(e.target.checked)}/><span>Absentee owners only</span></label>
        <label className="checkRow"><input type="checkbox" checked={highEquityOnly} onChange={e=>setHighEquityOnly(e.target.checked)}/><span>High equity only</span></label>
        <label className="checkRow"><input type="checkbox" checked={vacantOnly} onChange={e=>setVacantOnly(e.target.checked)}/><span>Vacant only</span></label>

        <div className="formActions">
          <button className="primary" disabled={busy}>
            {busy?<LoaderCircle size={16}/>:<Search size={16}/>}
            {busy?' Searching…':` Find ${modeInfo[mode].label}`}
          </button>
        </div>
      </form>
    </section>

    <section className="card">
      <div className="tableHead"><div>
        <h2>{modeInfo[mode].label} results</h2>
        <p>{results.length ? 'Each row shows the distress signal returned by the property-data provider.' : 'Run a search to load distressed-property leads.'}</p>
      </div></div>

      <div className="tableWrap"><table>
        <thead><tr>
          <th>Score</th><th>Owner / Property</th><th>Distress reason</th><th>Value / Equity</th><th>Ownership</th><th>Property</th><th></th>
        </tr></thead>
        <tbody>
          {results.map(lead=>{
            const duplicate=existing.has((lead.street || '').trim().toLowerCase())
            const isAdded=added.has(lead.id)||duplicate
            return <tr key={lead.id}>
              <td><span className={`pill scorePill ${lead.score>=90?'hot':''}`}>{lead.score}</span></td>
              <td><b>{lead.ownerName || 'Owner not listed'}</b><small><MapPin size={12}/> {lead.address}</small></td>
              <td>
                {lead.distressReasons.map(reason=><span className="pill stagePill" key={reason} style={{marginRight:5,marginBottom:4}}>{reason}</span>)}
                {lead.taxDelinquentYear && <small>Tax delinquent year: {lead.taxDelinquentYear}</small>}
              </td>
              <td><b>{money(lead.estimatedValue)}</b><small>Equity {money(lead.estimatedEquity)}{lead.equityPercent!=null?` · ${Math.round(lead.equityPercent)}%`:''}</small></td>
              <td><small>{lead.absenteeOwner?'Absentee owner':'Owner occupied/unknown'}<br/>{lead.vacant?'Vacant · ':''}{lead.yearsOwned!=null?`${lead.yearsOwned} years owned`:''}</small></td>
              <td><small><Building2 size={12}/> {lead.propertyType || 'Unknown'}</small></td>
              <td><button className="secondary" disabled={isAdded||adding===lead.id} onClick={()=>addToCrm(lead)}>
                {isAdded?'In CRM':adding===lead.id?'Adding…':<><Plus size={14}/> Add</>}
              </button></td>
            </tr>
          })}
        </tbody>
      </table></div>
    </section>
  </div>
}
