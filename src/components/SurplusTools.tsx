import React, { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Landmark, Mail, MapPin, Phone, Search, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'

type SurplusCase = {
  id:string
  claimant_name:string
  property_address:string
  county:string
  state:string
  parcel_number:string
  case_number:string
  claimant_phone:string
  claimant_email:string
  mailing_address:string
  surplus_amount:number
  source_url:string
}

const countyLinks = [
  {
    state:'CA',
    county:'Fresno County',
    title:'Tax Sale & Excess Proceeds',
    url:'https://www.fresnocountyca.gov/Departments/Auditor-Controller-Treasurer-Tax-Collector/Property-Tax-Information/Tax-Sale-Excess-Proceeds'
  },
  {
    state:'CA',
    county:'Madera County',
    title:'Excess Proceeds',
    url:'https://www.maderacounty.com/government/treasurer-tax-collector/property-tax/defaulted-taxes/excess-proceeds'
  },
  {
    state:'CA',
    county:'Tulare County',
    title:'Excess Proceeds',
    url:'https://tularecounty.ca.gov/auditor/2026-excess-proceeds'
  },
  {
    state:'CA',
    county:'Kings County',
    title:'Tax Sale / Excess Proceeds',
    url:'https://www.countyofkingsca.gov/departments/administration/finance-department/tax-collector/delinquent-taxes/tax-sale'
  },
  {
    state:'CA',
    county:'Merced County',
    title:'Defaulted Tax Information',
    url:'https://www.countyofmerced.com/2515/Defaulted-Tax-Information'
  }
]

const money=(n:number)=>'$'+Math.round(Number(n)||0).toLocaleString()

export default function SurplusTools(){
  const [cases,setCases]=useState<SurplusCase[]>([])
  const [stateFilter,setStateFilter]=useState('ALL')
  const [query,setQuery]=useState('')
  const [message,setMessage]=useState('')
  const [enriching,setEnriching]=useState<string|null>(null)

  const load=async()=>{
    const {data,error}=await supabase.from('surplus_cases')
      .select('id,claimant_name,property_address,county,state,parcel_number,case_number,claimant_phone,claimant_email,mailing_address,surplus_amount,source_url')
      .order('surplus_amount',{ascending:false})
    if(error){setMessage(error.message);return}
    setCases((data||[]) as SurplusCase[])
  }

  useEffect(()=>{load()},[])

  const states=useMemo(()=>Array.from(new Set(cases.map(c=>(c.state||'').toUpperCase()).filter(Boolean))).sort(),[cases])
  const visible=useMemo(()=>{
    const q=query.trim().toLowerCase()
    return cases.filter(c=>{
      if(stateFilter!=='ALL' && (c.state||'').toUpperCase()!==stateFilter) return false
      if(!q) return true
      return `${c.claimant_name} ${c.property_address} ${c.county} ${c.state} ${c.case_number} ${c.parcel_number}`.toLowerCase().includes(q)
    })
  },[cases,stateFilter,query])

  const high=visible.filter(c=>Number(c.surplus_amount||0)>=5000)
  const low=visible.filter(c=>Number(c.surplus_amount||0)<5000)
  const links=countyLinks.filter(l=>stateFilter==='ALL' || l.state===stateFilter)

  const enrich=async(c:SurplusCase)=>{
    setEnriching(c.id)
    setMessage('')
    try{
      const {data}=await supabase.auth.getSession()
      const token=data.session?.access_token
      if(!token) throw new Error('Your sign-in session expired. Sign in again.')

      const response=await fetch('/api/surplus-people-finder',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
        body:JSON.stringify({
          case_id:c.id,
          claimant_name:c.claimant_name,
          state:c.state,
          county:c.county,
          property_address:c.property_address
        })
      })
      const body=await response.json().catch(()=>({}))
      if(!response.ok) throw new Error(body.error||'Claimant lookup failed.')

      if(body.status==='needs_verification'){
        setMessage(`${c.claimant_name}: ${body.matches?.length||0} possible people found. Needs verification before saving contact data.`)
      }else if(body.status==='no_match'){
        setMessage(`${c.claimant_name}: no contact match found.`)
      }else{
        const patch={
          mailing_address:body.person?.address||c.mailing_address||'',
          claimant_phone:(body.person?.phones||[])[0]||c.claimant_phone||'',
          claimant_email:(body.person?.emails||[])[0]||c.claimant_email||'',
          next_action:'Verify enriched claimant contact, then begin compliant outreach'
        }
        const {error}=await supabase.from('surplus_cases').update(patch).eq('id',c.id)
        if(error) throw error
        setMessage(`${c.claimant_name}: address, phone and email fields updated where available.`)
        await load()
      }
    }catch(err:any){
      setMessage(err.message||'Claimant lookup failed.')
    }finally{
      setEnriching(null)
    }
  }

  const renderRows=(rows:SurplusCase[])=><div className="tableWrap"><table>
    <thead><tr><th>Amount</th><th>Claimant</th><th>County / State</th><th>Contact</th><th></th></tr></thead>
    <tbody>
      {rows.length===0 && <tr><td colSpan={5}>No cases in this group.</td></tr>}
      {rows.map(c=><tr key={c.id}>
        <td><b>{money(c.surplus_amount)}</b></td>
        <td><b>{c.claimant_name}</b><small>{c.property_address||'No property address'}{c.case_number?<><br/>Case {c.case_number}</>:null}</small></td>
        <td>{c.county||'—'}{c.state?`, ${c.state}`:''}</td>
        <td>
          <small>
            {c.mailing_address?<><MapPin size={12}/> {c.mailing_address}<br/></>:null}
            {c.claimant_phone?<><Phone size={12}/> {c.claimant_phone}<br/></>:null}
            {c.claimant_email?<><Mail size={12}/> {c.claimant_email}</>:null}
            {!c.mailing_address&&!c.claimant_phone&&!c.claimant_email?'Not enriched yet':null}
          </small>
        </td>
        <td><button className="secondary" disabled={enriching===c.id} onClick={()=>enrich(c)}>
          <Sparkles size={14}/>{enriching===c.id?' Looking up…':' Find Person'}
        </button></td>
      </tr>)}
    </tbody>
  </table></div>

  return <div className="workspaceStack">
    {message && <div className="loadingBanner">{message}</div>}

    <section className="card">
      <div className="sectionHeading"><Landmark size={20}/><div>
        <h2>Official County Surplus Funds</h2>
        <p>County recovery links are grouped by state. Add more states and counties as you expand.</p>
      </div></div>

      <div className="formGrid" style={{marginTop:14}}>
        <label><span>State</span><select value={stateFilter} onChange={e=>setStateFilter(e.target.value)}>
          <option value="ALL">All states</option>
          {states.map(s=><option key={s} value={s}>{s}</option>)}
          {!states.includes('CA') && <option value="CA">CA</option>}
        </select></label>
        <label><span>Search cases</span><div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Claimant, county, case, APN..."/></div></label>
      </div>

      <div className="dataCards" style={{marginTop:14}}>
        {links.map(l=><article className="dataCard" key={`${l.state}-${l.county}`} style={{display:'block'}}>
          <h3>{l.county}, {l.state}</h3>
          <small>{l.title}</small>
          <a className="secondary" href={l.url} target="_blank" rel="noreferrer"
             style={{display:'inline-flex',gap:6,alignItems:'center',marginTop:10,textDecoration:'none'}}>
            <ExternalLink size={14}/> Open Official County Page
          </a>
        </article>)}
      </div>
      <small style={{display:'block',marginTop:12}}>Use the county's own page to verify the current list, claim deadline, claimant eligibility, and filing requirements.</small>
    </section>

    <section className="card">
      <div className="tableHead"><div><h2>$5,000 and Up</h2><p>{high.length} case{high.length===1?'':'s'} · highest amounts first</p></div></div>
      {renderRows(high)}
    </section>

    <section className="card">
      <div className="tableHead"><div><h2>$4,999 and Down</h2><p>{low.length} case{low.length===1?'':'s'} · highest amounts first</p></div></div>
      {renderRows(low)}
    </section>

    <section className="card">
      <small>Claimant enrichment only saves a single confident match. Multiple possible people are flagged for verification instead of DealFlow guessing. DealFlow is not affiliated with any county or government agency.</small>
    </section>
  </div>
}
