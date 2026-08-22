import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowRight, BadgeDollarSign, Building2, Calculator,
  CalendarClock, CheckCircle2, CircleDollarSign, FileText, Flame,
  Home, Mail, MessageSquareText, Phone, Plus, Search, Send, Target,
  TrendingUp, Users, X
} from 'lucide-react'
import { supabase } from './lib/supabase'
import { fetchLeads, createLead, updateLeadStage, type LeadRow } from './lib/leads'
import WorkspacePage, { type WorkspaceLead, type WorkspaceView } from './components/WorkspacePage'

type Stage = 'New' | 'Contacted' | 'Qualified' | 'Offer Sent' | 'Under Contract' | 'Closed'

const stages: Stage[] = ['New', 'Contacted', 'Qualified', 'Offer Sent', 'Under Contract', 'Closed']
const views: WorkspaceView[] = ['dashboard','leads','pipeline','outreach','offers','buyers','tasks','calculator','contracts']

const pageMeta: Record<WorkspaceView, { title:string; subtitle:string }> = {
  dashboard: { title:'Deal Dashboard', subtitle:'See what needs attention, what can close, and where the money is.' },
  leads: { title:'Leads', subtitle:'Manage motivated sellers, deal economics, and lead priority.' },
  pipeline: { title:'Pipeline', subtitle:'Move opportunities from new lead through closing.' },
  outreach: { title:'Outreach', subtitle:'Track seller calls, texts, emails, and follow-up history.' },
  offers: { title:'Offers', subtitle:'Build and track seller offers from draft to acceptance.' },
  buyers: { title:'Cash Buyers', subtitle:'Manage your disposition list, buy boxes, and proof of funds.' },
  tasks: { title:'Tasks', subtitle:'Keep every follow-up and deadline in one queue.' },
  calculator: { title:'Offer Calculator', subtitle:'Calculate a seller offer, buyer price, and assignment spread.' },
  contracts: { title:'Contract Maker', subtitle:'Create purchase and assignment agreement drafts from live deal data.' }
}

type Lead = WorkspaceLead

const rowToLead = (r: LeadRow): Lead => ({
  id: r.id,
  owner: r.owner_name,
  property: r.property_address,
  city: r.city || '',
  source: r.source || 'Manual',
  stage: r.stage,
  score: Number(r.score || 0),
  arv: Number(r.arv || 0),
  asking: Number(r.asking || 0),
  repairs: Number(r.repairs || 0),
  mao: Number(r.mao || 0),
  lastTouch: r.last_touch || 'Never',
  nextAction: r.next_action || 'First contact'
})

const money = (n:number) => '$' + Math.round(n || 0).toLocaleString()

const readView = (): WorkspaceView => {
  const raw = window.location.hash.replace('#','')
  return views.includes(raw as WorkspaceView) ? raw as WorkspaceView : 'dashboard'
}

function App() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Lead | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [view, setView] = useState<WorkspaceView>(readView)

  const loadLeads = async () => {
    setLoading(true)
    try {
      const rows = await fetchLeads()
      setLeads(rows.map(rowToLead))
      setError('')
    } catch (err:any) {
      setError(err.message || 'Could not load leads')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadLeads() }, [])
  useEffect(() => {
    const onHash = () => setView(readView())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (next:WorkspaceView) => {
    window.location.hash = next
    setView(next)
  }

  const active = leads.filter(l => l.stage !== 'Closed')
  const hot = active.filter(l => l.score >= 90)
  const contracts = active.filter(l => l.stage === 'Under Contract')
  const offers = active.filter(l => l.stage === 'Offer Sent')
  const projected = contracts.reduce((a,l)=>a+Math.max(0,l.mao-l.asking+15000),0)
  const filtered = leads.filter(l => `${l.owner} ${l.property} ${l.city} ${l.source}`.toLowerCase().includes(query.toLowerCase()))
  const avgScore = active.length ? Math.round(active.reduce((a,l)=>a+l.score,0)/active.length) : 0
  const stageCounts = useMemo(() => stages.map(s => ({ stage:s, count:leads.filter(l=>l.stage===s).length })), [leads])

  const advance = async (lead:Lead) => {
    const idx = stages.indexOf(lead.stage)
    const nextStage = stages[Math.min(idx+1, stages.length-1)]
    try {
      const row = await updateLeadStage(lead.id, nextStage)
      const updated = rowToLead(row)
      setLeads(prev => prev.map(l => l.id === lead.id ? updated : l))
      setSelected(updated)
    } catch (err:any) {
      setError(err.message || 'Could not update lead')
    }
  }

  const addLead = async (e:React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const arv = Number(f.get('arv')) || 0
    const repairs = Number(f.get('repairs')) || 0
    const asking = Number(f.get('asking')) || 0
    try {
      const row = await createLead({
        owner_name: String(f.get('owner')||'New Owner'),
        property_address: String(f.get('property')||'Unknown property'),
        city: String(f.get('city')||''),
        source: String(f.get('source')||'Manual'),
        stage: 'New',
        score: Number(f.get('score'))||70,
        arv, asking, repairs,
        last_touch: 'Never',
        next_action: 'First contact'
      })
      setLeads(prev => [rowToLead(row), ...prev])
      setShowAdd(false)
    } catch (err:any) {
      setError(err.message || 'Could not save lead')
    }
  }

  const meta = pageMeta[view]

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="logo">WA</div><div><strong>Wholesale Analytics</strong><span>Deal Command Center</span></div></div>
      <nav>
        <a href="#dashboard" className={view==='dashboard'?'active':''}><Home size={18}/> Dashboard</a>
        <a href="#leads" className={view==='leads'?'active':''}><Users size={18}/> Leads <b>{active.length}</b></a>
        <a href="#pipeline" className={view==='pipeline'?'active':''}><Target size={18}/> Pipeline</a>
        <a href="#outreach" className={view==='outreach'?'active':''}><Send size={18}/> Outreach</a>
        <a href="#offers" className={view==='offers'?'active':''}><BadgeDollarSign size={18}/> Offers</a>
        <a href="#buyers" className={view==='buyers'?'active':''}><Building2 size={18}/> Buyers</a>
        <a href="#tasks" className={view==='tasks'?'active':''}><CalendarClock size={18}/> Tasks</a>
        <a href="#calculator" className={view==='calculator'?'active':''}><Calculator size={18}/> Offer Calculator</a>
        <a href="#contracts" className={view==='contracts'?'active':''}><FileText size={18}/> Contracts</a>
      </nav>
      <div className="sideFoot"><Activity size={16}/><div><b>System ready</b><span>Live Supabase CRM</span></div></div>
    </aside>

    <main>
      <header>
        <div>
          <p className="eyebrow">Keller Home Solutions</p>
          <h1>{meta.title}</h1>
          <p>{meta.subtitle}</p>
          <select className="mobilePagePicker" value={view} onChange={e=>go(e.target.value as WorkspaceView)}>
            {views.map(v=><option key={v} value={v}>{pageMeta[v].title}</option>)}
          </select>
        </div>
        <div className="headerActions">
          <button className="secondary" onClick={()=>supabase.auth.signOut()}>Sign out</button>
          <button className="primary" onClick={()=>setShowAdd(true)}><Plus size={17}/> Add Lead</button>
        </div>
      </header>

      {error && <div className="errorBanner">{error}</div>}
      {loading && <div className="loadingBanner">Loading live CRM data…</div>}

      {view === 'dashboard' ? <>
        <section className="metrics">
          <Metric icon={<Users/>} label="Active leads" value={String(active.length)} note={`${hot.length} hot leads`} />
          <Metric icon={<Flame/>} label="Avg lead score" value={String(avgScore)} note="Focus 85+" />
          <Metric icon={<BadgeDollarSign/>} label="Offers out" value={String(offers.length)} note="Needs follow-up" />
          <Metric icon={<CheckCircle2/>} label="Under contract" value={String(contracts.length)} note="Disposition now" />
          <Metric icon={<CircleDollarSign/>} label="Projected fees" value={money(projected)} note="Current contracts" />
        </section>

        <section className="grid two">
          <div className="card">
            <div className="cardTitle"><div><h2>Pipeline</h2><p>Lead movement by stage</p></div><TrendingUp size={20}/></div>
            <div className="funnel">
              {stageCounts.map(s=><div className="funnelRow" key={s.stage}>
                <span>{s.stage}</span>
                <div className="bar"><i style={{width:`${Math.max(8, (s.count/Math.max(1,leads.length))*100)}%`}}/></div>
                <b>{s.count}</b>
              </div>)}
            </div>
            <button className="textAction" onClick={()=>go('pipeline')}>Open pipeline <ArrowRight size={15}/></button>
          </div>

          <div className="card">
            <div className="cardTitle"><div><h2>Today’s priorities</h2><p>Highest-value actions first</p></div><CalendarClock size={20}/></div>
            <div className="tasks">
              {hot.length===0 && <p className="emptyText">No hot leads yet.</p>}
              {hot.slice(0,4).map(l=><button key={l.id} onClick={()=>setSelected(l)} className="task">
                <span className="score">{l.score}</span>
                <div><b>{l.owner}</b><small>{l.nextAction} · {l.property}</small></div>
                <ArrowRight size={16}/>
              </button>)}
            </div>
          </div>
        </section>

        <section className="card quickTools">
          <div><h2>Deal tools</h2><p>Calculate an offer, then turn it into a purchase or assignment agreement.</p></div>
          <div className="quickToolBtns">
            <button className="primary" onClick={()=>go('calculator')}><Calculator size={17}/> Calculate Offer</button>
            <button className="secondary" onClick={()=>go('contracts')}><FileText size={17}/> Make Contract</button>
          </div>
        </section>

        <section className="card leadsCard">
          <div className="tableHead">
            <div><h2>Lead command center</h2><p>Sort attention by score, stage and deal economics.</p></div>
            <div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search owner, address, city..." /></div>
          </div>
          <div className="tableWrap">
            <table>
              <thead><tr><th>Score</th><th>Owner / Property</th><th>Source</th><th>Stage</th><th>ARV</th><th>Asking</th><th>Repairs</th><th>MAO</th><th>Next action</th></tr></thead>
              <tbody>
                {filtered.sort((a,b)=>b.score-a.score).map(l=><tr key={l.id} onClick={()=>setSelected(l)}>
                  <td><span className={`pill scorePill ${l.score>=90?'hot':''}`}>{l.score}</span></td>
                  <td><b>{l.owner}</b><small>{l.property}<br/>{l.city}</small></td>
                  <td>{l.source}</td>
                  <td><span className="pill stagePill">{l.stage}</span></td>
                  <td>{money(l.arv)}</td><td>{money(l.asking)}</td><td>{money(l.repairs)}</td><td><b>{money(l.mao)}</b></td>
                  <td><small>{l.nextAction}</small></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>
      </> : <WorkspacePage
        view={view}
        leads={leads}
        onSelectLead={setSelected}
        onAddLead={()=>setShowAdd(true)}
        onRefreshLeads={loadLeads}
      />}
    </main>

    {selected && <div className="overlay" onClick={()=>setSelected(null)}>
      <aside className="drawer" onClick={e=>e.stopPropagation()}>
        <button className="close" onClick={()=>setSelected(null)}><X/></button>
        <p className="eyebrow">Lead #{selected.id.slice(0,8)}</p><h2>{selected.owner}</h2><p>{selected.property}, {selected.city}</p>
        <div className="leadScore"><Flame/><div><b>{selected.score}/100</b><span>Motivation score</span></div></div>
        <div className="economics">
          <div><span>ARV</span><b>{money(selected.arv)}</b></div>
          <div><span>Asking</span><b>{money(selected.asking)}</b></div>
          <div><span>Repairs</span><b>{money(selected.repairs)}</b></div>
          <div><span>70% MAO</span><b>{money(selected.mao)}</b></div>
        </div>
        <div className="detail"><span>Source</span><b>{selected.source}</b></div>
        <div className="detail"><span>Stage</span><b>{selected.stage}</b></div>
        <div className="detail"><span>Next action</span><b>{selected.nextAction}</b></div>
        <div className="contactBtns">
          <button onClick={()=>go('outreach')}><Phone size={17}/> Call</button><button onClick={()=>go('outreach')}><MessageSquareText size={17}/> SMS</button><button onClick={()=>go('outreach')}><Mail size={17}/> Email</button>
        </div>
        <button className="secondary full" onClick={()=>{setSelected(null);go('calculator')}}><Calculator size={17}/> Calculate offer</button>
        <button className="secondary full" onClick={()=>{setSelected(null);go('contracts')}}><FileText size={17}/> Make contract</button>
        {selected.stage !== 'Closed' && <button className="primary full" onClick={()=>advance(selected)}>Advance to next stage <ArrowRight size={17}/></button>}
      </aside>
    </div>}

    {showAdd && <div className="overlay" onClick={()=>setShowAdd(false)}>
      <form className="modal" onSubmit={addLead} onClick={e=>e.stopPropagation()}>
        <button type="button" className="close" onClick={()=>setShowAdd(false)}><X/></button>
        <h2>Add lead</h2><p>Base MAO is stored as 70% of ARV minus repairs. Use Offer Calculator for assignment fee and holding-cost adjustments.</p>
        <label>Owner<input name="owner" required /></label>
        <label>Property<input name="property" required /></label>
        <div className="formGrid"><label>City<input name="city"/></label><label>Source<input name="source" placeholder="Probate, vacant..."/></label></div>
        <div className="formGrid"><label>ARV<input name="arv" type="number"/></label><label>Asking<input name="asking" type="number"/></label></div>
        <div className="formGrid"><label>Repairs<input name="repairs" type="number"/></label><label>Lead score<input name="score" type="number" min="0" max="100" defaultValue="70"/></label></div>
        <button className="primary full">Save lead</button>
      </form>
    </div>}
  </div>
}

function Metric({icon,label,value,note}:{icon:React.ReactNode,label:string,value:string,note:string}) {
  return <div className="metric"><span className="metricIcon">{icon}</span><div><p>{label}</p><h3>{value}</h3><small>{note}</small></div></div>
}

export default App
