import React, { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, BadgeDollarSign, Building2, Calculator, CalendarClock,
  Check, FileText, Mail, MessageSquareText, Phone, Plus, Search, Send,
  Target, Upload, Users
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { addBuyer, addTask, completeTask, createOffer, importLeads, listBuyers, listTasks, logOutreach } from '../lib/crm'
import { parseLeadCsv } from '../lib/csv'
import { updateLeadStage } from '../lib/leads'

export type WorkspaceView = 'dashboard'|'leads'|'pipeline'|'outreach'|'offers'|'buyers'|'tasks'|'calculator'|'contracts'
export type WorkspaceStage = 'New' | 'Contacted' | 'Qualified' | 'Offer Sent' | 'Under Contract' | 'Closed'

export type WorkspaceLead = {
  id: string
  owner: string
  property: string
  city: string
  source: string
  stage: WorkspaceStage
  score: number
  arv: number
  asking: number
  repairs: number
  mao: number
  lastTouch: string
  nextAction: string
}

type Props = {
  view: Exclude<WorkspaceView,'dashboard'>
  leads: WorkspaceLead[]
  onSelectLead: (lead:WorkspaceLead)=>void
  onAddLead: ()=>void
  onRefreshLeads: ()=>Promise<void>
}

const stages: WorkspaceStage[] = ['New','Contacted','Qualified','Offer Sent','Under Contract','Closed']
const money = (n:number) => '$' + Math.round(Number(n) || 0).toLocaleString()
const number = (value:FormDataEntryValue|null) => Number(value || 0) || 0
const isoDate = (days:number) => {
  const d = new Date()
  d.setDate(d.getDate()+days)
  return d.toISOString().slice(0,10)
}

const escapeHtml = (value:string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c] || c))

export default function WorkspacePage({view,leads,onSelectLead,onAddLead,onRefreshLeads}:Props) {
  const [tasks, setTasks] = useState<any[]>([])
  const [buyers, setBuyers] = useState<any[]>([])
  const [offers, setOffers] = useState<any[]>([])
  const [outreach, setOutreach] = useState<any[]>([])
  const [contracts, setContracts] = useState<any[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [leadQuery, setLeadQuery] = useState('')

  const loadWorkspace = async () => {
    setBusy(true)
    try {
      const [t,b,o,e,c] = await Promise.all([
        listTasks(),
        listBuyers(),
        supabase.from('offers').select('*, leads(owner_name, property_address)').order('created_at',{ascending:false}),
        supabase.from('outreach_events').select('*, leads(owner_name, property_address)').order('created_at',{ascending:false}).limit(50),
        supabase.from('contracts').select('*, leads(owner_name, property_address)').order('updated_at',{ascending:false}).limit(50)
      ])
      setTasks(t)
      setBuyers(b)
      if (o.error) throw o.error
      if (e.error) throw e.error
      if (c.error) throw c.error
      setOffers(o.data || [])
      setOutreach(e.data || [])
      setContracts(c.data || [])
      setMessage('')
    } catch (err:any) {
      setMessage(err.message || 'Could not load workspace data')
    } finally {
      setBusy(false)
    }
  }

  useEffect(()=>{ loadWorkspace() },[view])

  const leadOptions = <>{leads.map(l=><option key={l.id} value={l.id}>{l.owner} — {l.property}</option>)}</>

  const uploadCsv = async (e:React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const rows = parseLeadCsv(await file.text())
      await importLeads(rows)
      setMessage(`Imported ${rows.length} leads.`)
      await onRefreshLeads()
    } catch (err:any) { setMessage(err.message || 'CSV import failed') }
  }

  const submitTask = async (e:React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    try {
      await addTask({
        lead_id: String(f.get('lead_id')||'') || null,
        title: String(f.get('title')||'Follow up'),
        due_at: String(f.get('due_at')||'') || null,
        priority: String(f.get('priority')||'normal') as 'low'|'normal'|'high'|'urgent'
      })
      e.currentTarget.reset()
      await loadWorkspace()
    } catch (err:any) { setMessage(err.message || 'Could not save task') }
  }

  const submitOutreach = async (e:React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    try {
      await logOutreach({
        lead_id: String(f.get('lead_id')||'') || null,
        channel: String(f.get('channel')||'call') as 'call'|'sms'|'email'|'mail'|'other',
        direction: String(f.get('direction')||'outbound') as 'outbound'|'inbound',
        body: String(f.get('body')||''),
        status: 'logged'
      })
      setMessage('Outreach logged.')
      e.currentTarget.reset()
      await loadWorkspace()
    } catch (err:any) { setMessage(err.message || 'Could not log outreach') }
  }

  const submitOffer = async (e:React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    try {
      await createOffer({
        lead_id: String(f.get('lead_id')),
        amount: number(f.get('amount')),
        status: String(f.get('status')||'draft') as 'draft'|'sent'|'accepted'|'rejected'|'expired'|'withdrawn',
        expires_at: String(f.get('expires_at')||'') || null,
        notes: String(f.get('notes')||'')
      })
      setMessage('Offer saved.')
      e.currentTarget.reset()
      await loadWorkspace()
    } catch (err:any) { setMessage(err.message || 'Could not save offer') }
  }

  const submitBuyer = async (e:React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    try {
      await addBuyer({
        name: String(f.get('name')),
        company: String(f.get('company')||''),
        email: String(f.get('email')||''),
        phone: String(f.get('phone')||''),
        markets: String(f.get('markets')||'').split(',').map(x=>x.trim()).filter(Boolean),
        max_price: number(f.get('max_price')) || null,
        property_types: String(f.get('property_types')||'').split(',').map(x=>x.trim()).filter(Boolean),
        proof_of_funds: f.get('proof_of_funds') === 'on'
      })
      e.currentTarget.reset()
      await loadWorkspace()
    } catch (err:any) { setMessage(err.message || 'Could not add buyer') }
  }

  if (view==='leads') return <LeadsPage leads={leads} query={leadQuery} setQuery={setLeadQuery} onSelectLead={onSelectLead} onAddLead={onAddLead} uploadCsv={uploadCsv} message={message} />
  if (view==='pipeline') return <PipelinePage leads={leads} onRefreshLeads={onRefreshLeads} onSelectLead={onSelectLead} setMessage={setMessage} />
  if (view==='outreach') return <OutreachPage leads={leads} outreach={outreach} submitOutreach={submitOutreach} busy={busy} message={message} />
  if (view==='offers') return <OffersPage leads={leads} offers={offers} submitOffer={submitOffer} busy={busy} message={message} />
  if (view==='buyers') return <BuyersPage buyers={buyers} submitBuyer={submitBuyer} busy={busy} message={message} />
  if (view==='tasks') return <TasksPage leads={leads} tasks={tasks} submitTask={submitTask} refresh={loadWorkspace} busy={busy} message={message} />
  if (view==='calculator') return <OfferCalculator leads={leads} createDraft={async(leadId,amount,notes)=>{
    await createOffer({lead_id:leadId,amount,status:'draft',notes})
    setMessage('Calculated offer saved as a draft offer.')
    await loadWorkspace()
  }} message={message} />
  return <ContractMaker leads={leads} offers={offers} contracts={contracts} refresh={loadWorkspace} message={message} setMessage={setMessage} />
}

function LeadsPage({leads,query,setQuery,onSelectLead,onAddLead,uploadCsv,message}:{
  leads:WorkspaceLead[]; query:string; setQuery:(q:string)=>void; onSelectLead:(l:WorkspaceLead)=>void; onAddLead:()=>void;
  uploadCsv:(e:React.ChangeEvent<HTMLInputElement>)=>void; message:string
}) {
  const filtered = useMemo(()=>leads.filter(l=>`${l.owner} ${l.property} ${l.city} ${l.source}`.toLowerCase().includes(query.toLowerCase())),[leads,query])
  return <div className="workspaceStack">
    {message && <div className="loadingBanner">{message}</div>}
    <section className="workspaceHero card">
      <div><Users size={24}/><div><h2>Lead database</h2><p>{leads.length} total leads. Open a lead to review deal economics and advance it.</p></div></div>
      <button className="primary" onClick={onAddLead}><Plus size={16}/> Add lead</button>
    </section>
    <section className="card workspaceSplit">
      <div className="workspaceMain">
        <div className="workspaceToolbar"><div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search leads..."/></div></div>
        <div className="tableWrap"><table>
          <thead><tr><th>Score</th><th>Owner / Property</th><th>Stage</th><th>ARV</th><th>Asking</th><th>Repairs</th><th>MAO</th></tr></thead>
          <tbody>{filtered.map(l=><tr key={l.id} onClick={()=>onSelectLead(l)}><td><span className={`pill scorePill ${l.score>=90?'hot':''}`}>{l.score}</span></td><td><b>{l.owner}</b><small>{l.property}<br/>{l.city}</small></td><td><span className="pill stagePill">{l.stage}</span></td><td>{money(l.arv)}</td><td>{money(l.asking)}</td><td>{money(l.repairs)}</td><td><b>{money(l.mao)}</b></td></tr>)}</tbody>
        </table></div>
      </div>
      <aside className="workspaceSide">
        <h3>Import leads</h3><p>Upload a CSV with owner, address, city, source, score, ARV, asking and repairs.</p>
        <label className="uploadBox"><Upload size={28}/><b>Choose CSV</b><span>Imported rows go directly into your private CRM.</span><input hidden type="file" accept=".csv,text/csv" onChange={uploadCsv}/></label>
      </aside>
    </section>
  </div>
}

function PipelinePage({leads,onRefreshLeads,onSelectLead,setMessage}:{leads:WorkspaceLead[];onRefreshLeads:()=>Promise<void>;onSelectLead:(l:WorkspaceLead)=>void;setMessage:(s:string)=>void}) {
  const advance = async (lead:WorkspaceLead) => {
    const idx = stages.indexOf(lead.stage)
    if (idx >= stages.length-1) return
    try {
      await updateLeadStage(lead.id,stages[idx+1])
      await onRefreshLeads()
    } catch (err:any) { setMessage(err.message || 'Could not advance lead') }
  }
  return <div className="pipelineBoard">
    {stages.map(stage=><section className="pipelineColumn" key={stage}>
      <div className="pipelineHead"><span>{stage}</span><b>{leads.filter(l=>l.stage===stage).length}</b></div>
      <div className="pipelineCards">
        {leads.filter(l=>l.stage===stage).map(l=><article className="pipelineCard" key={l.id}>
          <button className="pipelineOpen" onClick={()=>onSelectLead(l)}><b>{l.owner}</b><span>{l.property}</span><small>Score {l.score} · MAO {money(l.mao)}</small></button>
          {stage!=='Closed' && <button className="miniAction" onClick={()=>advance(l)}>Advance <ArrowRight size={13}/></button>}
        </article>)}
      </div>
    </section>)}
  </div>
}

function OutreachPage({leads,outreach,submitOutreach,busy,message}:{leads:WorkspaceLead[];outreach:any[];submitOutreach:(e:React.FormEvent<HTMLFormElement>)=>void;busy:boolean;message:string}) {
  return <div className="workspaceStack">
    {message && <div className="loadingBanner">{message}</div>}
    <section className="card workspaceSplit">
      <div className="workspaceMain"><div className="sectionHeading"><Send size={20}/><div><h2>Outreach history</h2><p>Calls, SMS, emails and mail logged against each seller.</p></div></div>
        <div className="activityList">{busy && <p>Loading…</p>}{!busy && outreach.length===0 && <p className="emptyText">No outreach logged yet.</p>}{outreach.map(o=><div className="activityRow" key={o.id}><span className="activityIcon">{o.channel==='call'?<Phone/>:o.channel==='sms'?<MessageSquareText/>:o.channel==='email'?<Mail/>:<Send/>}</span><div><b>{o.leads?.owner_name || 'General outreach'}</b><small>{o.channel} · {o.direction} · {new Date(o.created_at).toLocaleString()}</small><p>{o.body || 'No note'}</p></div></div>)}</div>
      </div>
      <form className="workspaceForm" onSubmit={submitOutreach}>
        <h3>Log outreach</h3>
        <select name="lead_id" required><option value="">Select lead</option>{leads.map(l=><option key={l.id} value={l.id}>{l.owner} — {l.property}</option>)}</select>
        <div className="fieldGrid"><select name="channel"><option value="call">Call</option><option value="sms">SMS</option><option value="email">Email</option><option value="mail">Mail</option><option value="other">Other</option></select><select name="direction"><option value="outbound">Outbound</option><option value="inbound">Inbound</option></select></div>
        <textarea name="body" placeholder="Outcome, message, seller response..."/>
        <button className="primary"><Send size={15}/> Save outreach</button>
      </form>
    </section>
  </div>
}

function OffersPage({leads,offers,submitOffer,busy,message}:{leads:WorkspaceLead[];offers:any[];submitOffer:(e:React.FormEvent<HTMLFormElement>)=>void;busy:boolean;message:string}) {
  return <div className="workspaceStack">
    {message && <div className="loadingBanner">{message}</div>}
    <section className="card workspaceSplit">
      <div className="workspaceMain"><div className="sectionHeading"><BadgeDollarSign size={20}/><div><h2>Seller offers</h2><p>Track draft, sent, accepted and rejected offers.</p></div></div>
        <div className="dataCards">{busy && <p>Loading…</p>}{!busy && offers.length===0 && <p className="emptyText">No offers yet.</p>}{offers.map(o=><article className="dataCard" key={o.id}><div><b>{o.leads?.owner_name || 'Lead'}</b><span>{o.leads?.property_address || ''}</span></div><strong>{money(o.amount)}</strong><span className="pill stagePill">{o.status}</span><small>{new Date(o.created_at).toLocaleDateString()}</small></article>)}</div>
      </div>
      <form className="workspaceForm" onSubmit={submitOffer}>
        <h3>Create offer</h3>
        <select name="lead_id" required><option value="">Select lead</option>{leads.map(l=><option key={l.id} value={l.id}>{l.owner} — {l.property}</option>)}</select>
        <input name="amount" type="number" min="0" placeholder="Offer amount" required/>
        <select name="status"><option value="draft">Draft</option><option value="sent">Sent</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option><option value="withdrawn">Withdrawn</option></select>
        <label>Expires<input name="expires_at" type="datetime-local"/></label>
        <textarea name="notes" placeholder="Terms, notes, seller response..."/>
        <button className="primary">Save offer</button>
      </form>
    </section>
  </div>
}

function BuyersPage({buyers,submitBuyer,busy,message}:{buyers:any[];submitBuyer:(e:React.FormEvent<HTMLFormElement>)=>void;busy:boolean;message:string}) {
  return <div className="workspaceStack">
    {message && <div className="loadingBanner">{message}</div>}
    <section className="card workspaceSplit">
      <div className="workspaceMain"><div className="sectionHeading"><Building2 size={20}/><div><h2>Cash buyer list</h2><p>Keep buy boxes and proof-of-funds status ready for disposition.</p></div></div>
        <div className="dataCards">{busy && <p>Loading…</p>}{!busy && buyers.length===0 && <p className="emptyText">No buyers yet.</p>}{buyers.map(b=><article className="dataCard buyerCard" key={b.id}><div><b>{b.name}</b><span>{b.company || 'Independent buyer'}</span><small>{(b.markets||[]).join(', ') || 'No markets set'}</small></div><strong>{b.max_price?money(b.max_price):'No max'}</strong><span className={`pill ${b.proof_of_funds?'goodPill':''}`}>{b.proof_of_funds?'POF verified':'No POF'}</span></article>)}</div>
      </div>
      <form className="workspaceForm" onSubmit={submitBuyer}>
        <h3>Add cash buyer</h3><input name="name" placeholder="Buyer name" required/><input name="company" placeholder="Company"/><div className="fieldGrid"><input name="email" type="email" placeholder="Email"/><input name="phone" placeholder="Phone"/></div><input name="markets" placeholder="Fresno, Clovis, Madera"/><input name="property_types" placeholder="SFR, Duplex, Land"/><input name="max_price" type="number" placeholder="Maximum purchase price"/><label className="checkline"><input type="checkbox" name="proof_of_funds"/> Proof of funds verified</label><button className="primary"><Plus size={15}/> Add buyer</button>
      </form>
    </section>
  </div>
}

function TasksPage({leads,tasks,submitTask,refresh,busy,message}:{leads:WorkspaceLead[];tasks:any[];submitTask:(e:React.FormEvent<HTMLFormElement>)=>void;refresh:()=>Promise<void>;busy:boolean;message:string}) {
  return <div className="workspaceStack">
    {message && <div className="loadingBanner">{message}</div>}
    <section className="card workspaceSplit">
      <div className="workspaceMain"><div className="sectionHeading"><CalendarClock size={20}/><div><h2>Follow-up queue</h2><p>Open tasks ordered by due date.</p></div></div>
        <div className="taskList">{busy && <p>Loading…</p>}{!busy && tasks.length===0 && <p className="emptyText">No open tasks.</p>}{tasks.map(t=><article className="taskRow" key={t.id}><div><b>{t.title}</b><span>{t.leads?.owner_name || 'General'} · {t.priority}</span><small>{t.due_at?new Date(t.due_at).toLocaleString():'No due date'}</small></div><button onClick={async()=>{await completeTask(t.id);await refresh()}}><Check size={16}/> Done</button></article>)}</div>
      </div>
      <form className="workspaceForm" onSubmit={submitTask}>
        <h3>Add task</h3><select name="lead_id"><option value="">General task</option>{leads.map(l=><option key={l.id} value={l.id}>{l.owner} — {l.property}</option>)}</select><input name="title" placeholder="Call seller, verify title..." required/><input name="due_at" type="datetime-local"/><select name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select><button className="primary"><Plus size={15}/> Save task</button>
      </form>
    </section>
  </div>
}

type CalculatorProps = { leads:WorkspaceLead[]; createDraft:(leadId:string,amount:number,notes:string)=>Promise<void>; message:string }
function OfferCalculator({leads,createDraft,message}:CalculatorProps) {
  const [leadId,setLeadId] = useState('')
  const [arv,setArv] = useState(0)
  const [repairs,setRepairs] = useState(0)
  const [asking,setAsking] = useState(0)
  const [rule,setRule] = useState(70)
  const [fee,setFee] = useState(10000)
  const [buffer,setBuffer] = useState(3000)
  const [saved,setSaved] = useState('')

  useEffect(()=>{ if (!leadId && leads[0]) setLeadId(leads[0].id) },[leadId,leads])
  useEffect(()=>{
    const lead = leads.find(l=>l.id===leadId)
    if (!lead) return
    setArv(lead.arv); setRepairs(lead.repairs); setAsking(lead.asking)
  },[leadId,leads])

  const buyerMax = Math.max(0, arv*(rule/100)-repairs-buffer)
  const sellerOffer = Math.max(0,buyerMax-fee)
  const disposition = sellerOffer+fee
  const belowAsking = asking-sellerOffer
  const notes = `Offer Calculator: ${rule}% rule; ARV ${money(arv)}; repairs ${money(repairs)}; closing/holding buffer ${money(buffer)}; target assignment fee ${money(fee)}; buyer max ${money(buyerMax)}.`

  const save = async () => {
    if (!leadId) { setSaved('Select a lead first.'); return }
    try {
      await createDraft(leadId,sellerOffer,notes)
      localStorage.setItem(`dealflow:lastOffer:${leadId}`,JSON.stringify({sellerOffer,buyerMax,fee,rule,buffer,arv,repairs,asking}))
      setSaved('Saved as draft offer. Contract Maker can use it.')
    } catch (err:any) { setSaved(err.message || 'Could not save offer') }
  }

  return <div className="workspaceStack">
    {(message||saved) && <div className="loadingBanner">{saved || message}</div>}
    <section className="calculatorGrid">
      <div className="card calculatorInputs">
        <div className="sectionHeading"><Calculator size={21}/><div><h2>Deal inputs</h2><p>Adjust the rule for your buyer market and risk tolerance.</p></div></div>
        <label>Lead<select value={leadId} onChange={e=>setLeadId(e.target.value)}><option value="">Select lead</option>{leads.map(l=><option key={l.id} value={l.id}>{l.owner} — {l.property}</option>)}</select></label>
        <div className="fieldGrid"><label>ARV<input type="number" value={arv} onChange={e=>setArv(Number(e.target.value)||0)}/></label><label>Repairs<input type="number" value={repairs} onChange={e=>setRepairs(Number(e.target.value)||0)}/></label></div>
        <div className="fieldGrid"><label>Seller asking<input type="number" value={asking} onChange={e=>setAsking(Number(e.target.value)||0)}/></label><label>Investor rule %<input type="number" min="50" max="90" step="1" value={rule} onChange={e=>setRule(Number(e.target.value)||70)}/></label></div>
        <div className="fieldGrid"><label>Target assignment fee<input type="number" value={fee} onChange={e=>setFee(Number(e.target.value)||0)}/></label><label>Closing / holding buffer<input type="number" value={buffer} onChange={e=>setBuffer(Number(e.target.value)||0)}/></label></div>
        <p className="formulaNote">Seller offer = (ARV × {rule}%) − repairs − buffer − assignment fee.</p>
      </div>
      <div className="card offerResult">
        <span className="resultEyebrow">Recommended seller offer</span><strong>{money(sellerOffer)}</strong><p>Use this as a starting point, not an automatic promise to the seller.</p>
        <div className="resultBreakdown"><div><span>Buyer / disposition max</span><b>{money(disposition)}</b></div><div><span>Target assignment fee</span><b>{money(fee)}</b></div><div><span>Seller asking</span><b>{money(asking)}</b></div><div><span>{belowAsking>=0?'Below asking':'Above asking'}</span><b>{money(Math.abs(belowAsking))}</b></div></div>
        <button className="primary full" onClick={save}><BadgeDollarSign size={16}/> Save as draft offer</button>
      </div>
    </section>
    <section className="card calcGuide"><h2>What the numbers mean</h2><div className="guideGrid"><div><b>Investor rule</b><span>Common quick-screen percentage of ARV. It is adjustable because markets and exit costs differ.</span></div><div><b>Buyer max</b><span>Estimated price your end buyer could pay after repairs and your risk buffer.</span></div><div><b>Seller offer</b><span>Buyer max minus your target assignment fee.</span></div><div><b>Final verification</b><span>Confirm comps, title, repairs, taxes, closing costs and buyer demand before signing.</span></div></div></section>
  </div>
}

type ContractMakerProps = {leads:WorkspaceLead[];offers:any[];contracts:any[];refresh:()=>Promise<void>;message:string;setMessage:(s:string)=>void}
function ContractMaker({leads,offers,contracts,refresh,message,setMessage}:ContractMakerProps) {
  const [contractId,setContractId] = useState('')
  const [contractType,setContractType] = useState<'purchase'|'assignment'>('purchase')
  const [leadId,setLeadId] = useState('')
  const [sellerName,setSellerName] = useState('')
  const [buyerName,setBuyerName] = useState('Keller Home Solutions')
  const [assigneeName,setAssigneeName] = useState('')
  const [propertyAddress,setPropertyAddress] = useState('')
  const [purchasePrice,setPurchasePrice] = useState(0)
  const [earnestMoney,setEarnestMoney] = useState(100)
  const [assignmentFee,setAssignmentFee] = useState(10000)
  const [closingDate,setClosingDate] = useState(isoDate(14))
  const [inspectionDays,setInspectionDays] = useState(10)
  const [additionalTerms,setAdditionalTerms] = useState('Property to be conveyed as-is, subject to buyer inspection and clear/marketable title.')

  useEffect(()=>{ if (!leadId && leads[0]) setLeadId(leads[0].id) },[leadId,leads])
  useEffect(()=>{
    const lead = leads.find(l=>l.id===leadId)
    if (!lead || contractId) return
    setSellerName(lead.owner)
    setPropertyAddress(`${lead.property}${lead.city?`, ${lead.city}`:''}`)
    const latestOffer = offers.find(o=>o.lead_id===leadId)
    let amount = Number(latestOffer?.amount || 0)
    try {
      const saved = JSON.parse(localStorage.getItem(`dealflow:lastOffer:${leadId}`)||'null')
      if (saved?.sellerOffer) amount = Number(saved.sellerOffer)
      if (saved?.fee) setAssignmentFee(Number(saved.fee))
    } catch { /* ignore invalid local cache */ }
    setPurchasePrice(amount || lead.mao || lead.asking || 0)
  },[leadId,leads,offers,contractId])

  const buildDocument = () => {
    const today = new Date().toLocaleDateString()
    if (contractType==='assignment') {
      return `ASSIGNMENT OF REAL ESTATE PURCHASE AGREEMENT\n\nTemplate for transaction preparation — review with a California real-estate attorney, broker, title or escrow professional before use.\n\nDate: ${today}\nProperty: ${propertyAddress}\nOriginal Seller: ${sellerName}\nAssignor: ${buyerName}\nAssignee: ${assigneeName || '[Assignee Name]'}\nUnderlying Purchase Price: ${money(purchasePrice)}\nAssignment Fee: ${money(assignmentFee)}\nClosing Date: ${closingDate || '[Closing Date]'}\n\n1. ASSIGNMENT. Assignor assigns to Assignee Assignor's contractual rights in the underlying purchase agreement for the property identified above, subject to the terms of that agreement and applicable law.\n\n2. ASSIGNMENT FEE. Assignee will pay Assignor an assignment fee of ${money(assignmentFee)} at or before closing through the closing/escrow process unless the parties agree otherwise in writing.\n\n3. ASSUMPTION OF OBLIGATIONS. Assignee accepts the assigned contractual position and agrees to timely perform buyer obligations under the underlying purchase agreement.\n\n4. DUE DILIGENCE. Assignee acknowledges responsibility for its own inspection, valuation, title review, financing and legal review.\n\n5. NO GUARANTEE. Assignor makes no guarantee regarding value, condition, financing, title or profitability except as expressly stated in writing.\n\n6. ADDITIONAL TERMS. ${additionalTerms || 'None.'}\n\n7. ENTIRE AGREEMENT. This assignment and the referenced underlying purchase agreement contain the parties' agreement regarding this assignment. Amendments must be in writing and signed.\n\nASSIGNOR: ${buyerName}\nSignature: ______________________________   Date: __________\n\nASSIGNEE: ${assigneeName || '[Assignee Name]'}\nSignature: ______________________________   Date: __________\n`
    }
    return `REAL ESTATE PURCHASE AGREEMENT\n\nTemplate for transaction preparation — review with a California real-estate attorney, broker, title or escrow professional before use.\n\nDate: ${today}\nSeller: ${sellerName}\nBuyer: ${buyerName}\nProperty: ${propertyAddress}\nPurchase Price: ${money(purchasePrice)}\nEarnest Money Deposit: ${money(earnestMoney)}\nClosing Date: ${closingDate || '[Closing Date]'}\nInspection / Due Diligence Period: ${inspectionDays} days\n\n1. PURCHASE AND SALE. Seller agrees to sell and Buyer agrees to purchase the property identified above for ${money(purchasePrice)}, subject to the terms of this agreement.\n\n2. EARNEST MONEY. Buyer will deposit ${money(earnestMoney)} with the agreed escrow/title holder within the time agreed by the parties.\n\n3. CLOSING. Closing is targeted for ${closingDate || '[Closing Date]'}, subject to title/escrow requirements and any written extension signed by the parties.\n\n4. INSPECTION AND DUE DILIGENCE. Buyer has ${inspectionDays} days after acceptance to inspect the property, review title and other material information, and approve or disapprove the transaction as permitted by this agreement and applicable law.\n\n5. PROPERTY CONDITION. Unless otherwise agreed in writing, the property will be conveyed in its present as-is condition, subject to Buyer's inspection rights and Seller's legal disclosure obligations.\n\n6. TITLE. Seller will convey marketable title subject to permitted exceptions. Existing monetary liens that must be cleared for closing are to be handled through escrow/title from Seller proceeds unless otherwise agreed.\n\n7. CLOSING COSTS. Escrow, title, transfer, recording and other closing charges will be allocated as stated in escrow instructions or a written addendum signed by the parties.\n\n8. ASSIGNMENT. Buyer's assignment rights are subject to the underlying transaction terms, lender/title/escrow requirements, and applicable law.\n\n9. ACCESS. Seller will provide reasonable access for inspections, contractors, partners, lenders, buyers, title and escrow personnel as mutually arranged.\n\n10. ADDITIONAL TERMS. ${additionalTerms || 'None.'}\n\n11. ENTIRE AGREEMENT. This agreement and signed addenda contain the parties' agreement. Changes must be in writing and signed by the parties.\n\nSELLER: ${sellerName}\nSignature: ______________________________   Date: __________\n\nBUYER: ${buyerName}\nSignature: ______________________________   Date: __________\n`
  }

  const loadDraft = (c:any) => {
    setContractId(c.id)
    setContractType(c.contract_type)
    setLeadId(c.lead_id || '')
    setSellerName(c.seller_name || '')
    setBuyerName(c.buyer_name || 'Keller Home Solutions')
    setAssigneeName(c.assignee_name || '')
    setPropertyAddress(c.property_address || '')
    setPurchasePrice(Number(c.purchase_price)||0)
    setEarnestMoney(Number(c.earnest_money)||0)
    setAssignmentFee(Number(c.assignment_fee)||0)
    setClosingDate(c.closing_date || isoDate(14))
    setInspectionDays(Number(c.inspection_days)||0)
    setAdditionalTerms(c.additional_terms || '')
    setMessage(`Loaded ${c.title || 'contract draft'}.`)
  }

  const newDraft = () => {
    setContractId('')
    setContractType('purchase')
    setLeadId(leads[0]?.id || '')
    setSellerName(leads[0]?.owner || '')
    setBuyerName('Keller Home Solutions')
    setAssigneeName('')
    setPropertyAddress(leads[0]?`${leads[0].property}${leads[0].city?`, ${leads[0].city}`:''}`:'')
    setPurchasePrice(leads[0]?.mao || 0)
    setEarnestMoney(100); setAssignmentFee(10000); setClosingDate(isoDate(14)); setInspectionDays(10)
    setAdditionalTerms('Property to be conveyed as-is, subject to buyer inspection and clear/marketable title.')
  }

  const saveDraft = async () => {
    if (!leadId) { setMessage('Select a lead first.'); return }
    const documentText = buildDocument()
    const payload = {
      lead_id: leadId,
      contract_type: contractType,
      title: contractType==='purchase' ? `Purchase Agreement — ${propertyAddress}` : `Assignment Agreement — ${propertyAddress}`,
      status: 'draft',
      seller_name: sellerName,
      buyer_name: buyerName,
      assignee_name: assigneeName,
      property_address: propertyAddress,
      purchase_price: purchasePrice,
      earnest_money: earnestMoney,
      assignment_fee: assignmentFee,
      closing_date: closingDate || null,
      inspection_days: inspectionDays,
      additional_terms: additionalTerms,
      document_text: documentText,
      updated_at: new Date().toISOString()
    }
    try {
      if (contractId) {
        const {error} = await supabase.from('contracts').update(payload).eq('id',contractId)
        if (error) throw error
      } else {
        const {data,error} = await supabase.from('contracts').insert(payload).select().single()
        if (error) throw error
        setContractId(data.id)
      }
      setMessage('Contract draft saved.')
      await refresh()
    } catch (err:any) { setMessage(err.message || 'Could not save contract') }
  }

  const printDocument = () => {
    const text = buildDocument()
    const win = window.open('','_blank')
    if (!win) { setMessage('Allow pop-ups for this site, then try Print / Save PDF again.'); return }
    win.opener = null
    win.document.write(`<html><head><title>DealFlow Contract</title><style>body{font-family:Arial,sans-serif;color:#111;max-width:850px;margin:40px auto;padding:0 28px;line-height:1.45}pre{white-space:pre-wrap;font-family:Arial,sans-serif;font-size:12pt}.note{font-size:10pt;color:#555;margin-bottom:18px}@media print{body{margin:0;max-width:none}.note{display:none}}</style></head><body><div class="note">Use your browser Print dialog and choose “Save as PDF”.</div><pre>${escapeHtml(text)}</pre></body></html>`)
    win.document.close()
    win.focus()
    setTimeout(()=>win.print(),250)
  }

  const preview = buildDocument()

  return <div className="workspaceStack">
    {message && <div className="loadingBanner">{message}</div>}
    <div className="legalNotice"><FileText size={17}/><div><b>Contract templates</b><span>These are editable transaction-prep templates, not legal advice. Have California-specific wording and disclosures reviewed before use.</span></div></div>
    <section className="contractLayout">
      <div className="card contractEditor">
        <div className="contractTop"><div className="sectionHeading"><FileText size={20}/><div><h2>Contract Maker</h2><p>Auto-fill from a lead, edit the terms, save the draft, then print to PDF.</p></div></div><button className="secondary" onClick={newDraft}>New</button></div>
        <div className="contractTypeSwitch"><button className={contractType==='purchase'?'on':''} onClick={()=>setContractType('purchase')}>Purchase Agreement</button><button className={contractType==='assignment'?'on':''} onClick={()=>setContractType('assignment')}>Assignment Agreement</button></div>
        <label>Lead<select value={leadId} onChange={e=>{setContractId('');setLeadId(e.target.value)}}><option value="">Select lead</option>{leads.map(l=><option key={l.id} value={l.id}>{l.owner} — {l.property}</option>)}</select></label>
        <div className="fieldGrid"><label>Seller<input value={sellerName} onChange={e=>setSellerName(e.target.value)}/></label><label>{contractType==='assignment'?'Assignor':'Buyer'}<input value={buyerName} onChange={e=>setBuyerName(e.target.value)}/></label></div>
        {contractType==='assignment' && <label>Assignee / end buyer<input value={assigneeName} onChange={e=>setAssigneeName(e.target.value)} placeholder="End buyer name or company"/></label>}
        <label>Property<input value={propertyAddress} onChange={e=>setPropertyAddress(e.target.value)}/></label>
        <div className="fieldGrid"><label>Purchase price<input type="number" value={purchasePrice} onChange={e=>setPurchasePrice(Number(e.target.value)||0)}/></label><label>{contractType==='assignment'?'Assignment fee':'Earnest money'}<input type="number" value={contractType==='assignment'?assignmentFee:earnestMoney} onChange={e=>contractType==='assignment'?setAssignmentFee(Number(e.target.value)||0):setEarnestMoney(Number(e.target.value)||0)}/></label></div>
        <div className="fieldGrid"><label>Closing date<input type="date" value={closingDate} onChange={e=>setClosingDate(e.target.value)}/></label><label>Inspection days<input type="number" min="0" value={inspectionDays} onChange={e=>setInspectionDays(Number(e.target.value)||0)}/></label></div>
        <label>Additional terms<textarea value={additionalTerms} onChange={e=>setAdditionalTerms(e.target.value)}/></label>
        <div className="contractActions"><button className="primary" onClick={saveDraft}>Save draft</button><button className="secondary" onClick={printDocument}>Print / Save PDF</button></div>
      </div>
      <div className="card contractPreview"><div className="previewHead"><div><h3>Document preview</h3><p>{contractType==='purchase'?'Purchase agreement':'Assignment agreement'}</p></div><span className="pill stagePill">Draft</span></div><pre>{preview}</pre></div>
    </section>
    <section className="card"><div className="sectionHeading"><FileText size={19}/><div><h2>Saved drafts</h2><p>Open a draft to edit, reprint or update it.</p></div></div><div className="dataCards">{contracts.length===0 && <p className="emptyText">No contract drafts yet.</p>}{contracts.map(c=><article className="dataCard" key={c.id}><div><b>{c.title}</b><span>{c.contract_type} · {c.status}</span><small>{c.leads?.owner_name || c.seller_name || ''}</small></div><strong>{money(c.contract_type==='assignment'?c.assignment_fee:c.purchase_price)}</strong><button className="miniAction" onClick={()=>loadDraft(c)}>Open</button></article>)}</div></section>
  </div>
}
