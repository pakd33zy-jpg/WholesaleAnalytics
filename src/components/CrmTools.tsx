import React, { useEffect, useState } from 'react'
import { Upload, Check, Phone, MessageSquareText, Mail, BadgeDollarSign, Users, Plus } from 'lucide-react'
import { parseLeadCsv } from '../lib/csv'
import { addBuyer, addTask, completeTask, createOffer, importLeads, listBuyers, listTasks, logOutreach } from '../lib/crm'

type LeadLite = { id:string; owner:string; property:string; mao:number }

export default function CrmTools({ leads, onImported }:{ leads:LeadLite[]; onImported:()=>void }) {
  const [tasks, setTasks] = useState<any[]>([])
  const [buyers, setBuyers] = useState<any[]>([])
  const [tab, setTab] = useState<'tasks'|'import'|'outreach'|'offers'|'buyers'>('tasks')
  const [message, setMessage] = useState('')

  const refresh = async () => {
    try {
      const [t,b] = await Promise.all([listTasks(), listBuyers()])
      setTasks(t); setBuyers(b)
    } catch (e:any) { setMessage(e.message) }
  }
  useEffect(()=>{ refresh() },[])

  const uploadCsv = async (e:React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const rows = parseLeadCsv(await file.text())
      await importLeads(rows)
      setMessage(`Imported ${rows.length} leads.`)
      onImported()
    } catch (e:any) { setMessage(e.message) }
  }

  const submitTask = async (e:React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    await addTask({
      lead_id: String(f.get('lead_id')||'') || null,
      title: String(f.get('title')||'Follow up'),
      due_at: String(f.get('due_at')||'') || null,
      priority: String(f.get('priority')||'normal') as any
    })
    e.currentTarget.reset(); await refresh()
  }

  const submitOutreach = async (e:React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    await logOutreach({
      lead_id: String(f.get('lead_id')||'') || null,
      channel: String(f.get('channel')||'call') as any,
      body: String(f.get('body')||''),
      status: 'logged'
    })
    setMessage('Outreach logged.')
    e.currentTarget.reset()
  }

  const submitOffer = async (e:React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    await createOffer({
      lead_id: String(f.get('lead_id')),
      amount: Number(f.get('amount')||0),
      status: String(f.get('status')||'draft') as any,
      expires_at: String(f.get('expires_at')||'') || null,
      notes: String(f.get('notes')||'')
    })
    setMessage('Offer saved.')
    e.currentTarget.reset()
  }

  const submitBuyer = async (e:React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    await addBuyer({
      name: String(f.get('name')),
      company: String(f.get('company')||''),
      email: String(f.get('email')||''),
      phone: String(f.get('phone')||''),
      markets: String(f.get('markets')||'').split(',').map(x=>x.trim()).filter(Boolean),
      max_price: Number(f.get('max_price')||0) || null,
      property_types: String(f.get('property_types')||'').split(',').map(x=>x.trim()).filter(Boolean),
      proof_of_funds: f.get('proof_of_funds') === 'on'
    })
    e.currentTarget.reset(); await refresh()
  }

  const leadOptions = <>{leads.map(l=><option key={l.id} value={l.id}>{l.owner} — {l.property}</option>)}</>

  return <section className="card crmTools">
    <div className="crmTabs">
      <button className={tab==='tasks'?'on':''} onClick={()=>setTab('tasks')}>Tasks</button>
      <button className={tab==='import'?'on':''} onClick={()=>setTab('import')}>Import</button>
      <button className={tab==='outreach'?'on':''} onClick={()=>setTab('outreach')}>Outreach</button>
      <button className={tab==='offers'?'on':''} onClick={()=>setTab('offers')}>Offers</button>
      <button className={tab==='buyers'?'on':''} onClick={()=>setTab('buyers')}>Buyers</button>
    </div>

    {message && <div className="loadingBanner">{message}</div>}

    {tab==='tasks' && <div className="crmPane">
      <div>
        <h2>Follow-up queue</h2>
        <div className="miniList">
          {tasks.length===0 && <p>No open tasks yet.</p>}
          {tasks.slice(0,8).map(t=><div className="miniRow" key={t.id}>
            <div><b>{t.title}</b><small>{t.leads?.owner_name || 'General'} · {t.priority}</small></div>
            <button onClick={async()=>{await completeTask(t.id);refresh()}}><Check size={15}/></button>
          </div>)}
        </div>
      </div>
      <form onSubmit={submitTask}>
        <h3>Add task</h3>
        <select name="lead_id"><option value="">General task</option>{leadOptions}</select>
        <input name="title" placeholder="Call seller, verify title..." required/>
        <input name="due_at" type="datetime-local"/>
        <select name="priority"><option>normal</option><option>high</option><option>urgent</option><option>low</option></select>
        <button className="primary"><Plus size={15}/> Save task</button>
      </form>
    </div>}

    {tab==='import' && <div className="crmPane single">
      <div>
        <h2>CSV lead import</h2>
        <p>Headers supported: owner/owner_name, address/property_address, city, source, score, arv, asking, repairs.</p>
        <label className="uploadBox"><Upload size={28}/><b>Choose CSV</b><span>Rows are inserted into your private Supabase lead table.</span><input hidden type="file" accept=".csv,text/csv" onChange={uploadCsv}/></label>
      </div>
    </div>}

    {tab==='outreach' && <div className="crmPane">
      <div>
        <h2>Outreach log</h2><p>Log calls, SMS, email and mail now. Provider automation plugs into this event table later.</p>
      </div>
      <form onSubmit={submitOutreach}>
        <select name="lead_id" required><option value="">Select lead</option>{leadOptions}</select>
        <select name="channel"><option value="call">Call</option><option value="sms">SMS</option><option value="email">Email</option><option value="mail">Mail</option></select>
        <textarea name="body" placeholder="Outcome or message body"/>
        <button className="primary">Log outreach</button>
      </form>
    </div>}

    {tab==='offers' && <div className="crmPane">
      <div><h2>Offers</h2><p>Create a draft or mark it sent. Suggested starting point is the lead MAO shown in the dashboard.</p></div>
      <form onSubmit={submitOffer}>
        <select name="lead_id" required><option value="">Select lead</option>{leadOptions}</select>
        <input name="amount" type="number" placeholder="Offer amount" required/>
        <select name="status"><option>draft</option><option>sent</option><option>accepted</option><option>rejected</option></select>
        <input name="expires_at" type="datetime-local"/>
        <textarea name="notes" placeholder="Terms / notes"/>
        <button className="primary">Save offer</button>
      </form>
    </div>}

    {tab==='buyers' && <div className="crmPane">
      <div>
        <h2>Cash buyers</h2>
        <div className="miniList">
          {buyers.slice(0,6).map(b=><div className="miniRow" key={b.id}><div><b>{b.name}</b><small>{(b.markets||[]).join(', ') || 'No markets set'} · {b.proof_of_funds?'POF':'No POF'}</small></div></div>)}
        </div>
      </div>
      <form onSubmit={submitBuyer}>
        <input name="name" placeholder="Buyer name" required/>
        <input name="company" placeholder="Company"/>
        <input name="email" type="email" placeholder="Email"/>
        <input name="phone" placeholder="Phone"/>
        <input name="markets" placeholder="Fresno, Clovis, Madera"/>
        <input name="property_types" placeholder="SFR, Duplex, Land"/>
        <input name="max_price" type="number" placeholder="Max purchase price"/>
        <label className="checkline"><input type="checkbox" name="proof_of_funds"/> Proof of funds verified</label>
        <button className="primary">Add buyer</button>
      </form>
    </div>}
  </section>
}
