import React, { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type Profile = {
  id: string
  email: string | null
  display_name: string | null
  role: 'admin' | 'staff'
}

export default function AuthGate({ children }:{ children:React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin'|'signup'>('signin')
  const [message, setMessage] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [showAdmin, setShowAdmin] = useState(false)
  const [adminMessage, setAdminMessage] = useState('')

  const loadProfile = async (userId:string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,display_name,role')
      .eq('id', userId)
      .single()
    if (!error && data) setProfile(data as Profile)
  }

  const loadProfiles = async () => {
    setAdminMessage('')
    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,display_name,role')
      .order('created_at', { ascending: true })
    if (error) setAdminMessage(error.message)
    else setProfiles((data || []) as Profile[])
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session?.user.id) loadProfile(data.session.user.id)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setProfile(null)
      if (next?.user.id) loadProfile(next.user.id)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (showAdmin && profile?.role === 'admin') loadProfiles()
  }, [showAdmin, profile?.role])

  const submit = async (e:React.FormEvent) => {
    e.preventDefault()
    setMessage('')
    const result = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })
    if (result.error) setMessage(result.error.message)
    else if (mode === 'signup' && !result.data.session) setMessage('Check your email to confirm your account.')
  }

  const setRole = async (id:string, role:'admin'|'staff') => {
    setAdminMessage('')
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
    if (error) setAdminMessage(error.message)
    else {
      setProfiles(prev => prev.map(p => p.id === id ? { ...p, role } : p))
      if (id === session?.user.id) setProfile(prev => prev ? { ...prev, role } : prev)
    }
  }

  if (loading) return <div className="authScreen"><div className="authCard">Loading CRM…</div></div>

  if (session) return <>
    {profile?.role === 'admin' && <>
      <button
        onClick={()=>setShowAdmin(true)}
        style={{position:'fixed',right:18,bottom:18,zIndex:50,border:0,borderRadius:999,padding:'11px 16px',fontWeight:900,cursor:'pointer',background:'linear-gradient(135deg,#f7b733,#fc4a1a)',color:'#160b02',boxShadow:'0 12px 30px rgba(0,0,0,.35)'}}
      >ADMIN</button>
      {showAdmin && <div onClick={()=>setShowAdmin(false)} style={{position:'fixed',inset:0,zIndex:60,background:'rgba(1,8,16,.78)',backdropFilter:'blur(5px)',display:'grid',placeItems:'center',padding:20}}>
        <div onClick={e=>e.stopPropagation()} style={{width:'min(720px,96vw)',maxHeight:'82vh',overflow:'auto',background:'#0a1625',border:'1px solid #263b54',borderRadius:16,padding:24,color:'#edf4fa'}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'center'}}>
            <div><div style={{fontSize:10,letterSpacing:'.14em',textTransform:'uppercase',color:'#ffb45b',fontWeight:900}}>Administrator</div><h2 style={{margin:'5px 0'}}>User access</h2></div>
            <button onClick={()=>setShowAdmin(false)} style={{background:'#14263a',border:'1px solid #2b435d',color:'#dce8f3',borderRadius:9,padding:'8px 11px',cursor:'pointer'}}>Close</button>
          </div>
          <p style={{fontSize:12,color:'#8195ad'}}>Admin authorization is enforced by Supabase Row Level Security. Changing a role here updates the protected database record.</p>
          {adminMessage && <div style={{padding:10,borderRadius:8,background:'#3a1720',color:'#ffb8c4',marginBottom:10,fontSize:11}}>{adminMessage}</div>}
          <div style={{display:'grid',gap:8}}>
            {profiles.map(p => <div key={p.id} style={{display:'grid',gridTemplateColumns:'1fr auto',gap:12,alignItems:'center',padding:12,border:'1px solid #1d3148',borderRadius:10,background:'#0c1b2b'}}>
              <div><b style={{display:'block',fontSize:12}}>{p.display_name || p.email || p.id}</b><span style={{fontSize:10,color:'#7e92aa'}}>{p.email || p.id}{p.id===session.user.id?' · You':''}</span></div>
              <select value={p.role} onChange={e=>setRole(p.id,e.target.value as 'admin'|'staff')} disabled={p.id===session.user.id} style={{background:'#091522',border:'1px solid #29435e',color:'#eef5fb',borderRadius:8,padding:'8px 10px'}}>
                <option value="admin">Admin</option><option value="staff">Staff</option>
              </select>
            </div>)}
          </div>
        </div>
      </div>}
    </>}
    {children}
  </>

  return <div className="authScreen">
    <form className="authCard" onSubmit={submit}>
      <div className="logo authLogo">WA</div>
      <p className="eyebrow">Keller Home Solutions</p>
      <h1>{mode === 'signin' ? 'Sign in' : 'Create account'}</h1>
      <p>Access your private wholesaling CRM and deal pipeline.</p>
      <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
      <label>Password<input type="password" minLength={6} value={password} onChange={e=>setPassword(e.target.value)} required /></label>
      {message && <div className="authMessage">{message}</div>}
      <button className="primary full">{mode === 'signin' ? 'Sign in' : 'Create account'}</button>
      <button type="button" className="linkBtn" onClick={()=>setMode(mode==='signin'?'signup':'signin')}>
        {mode === 'signin' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
      </button>
    </form>
  </div>
}
