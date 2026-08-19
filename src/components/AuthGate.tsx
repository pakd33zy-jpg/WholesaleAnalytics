import React, { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export default function AuthGate({ children }:{ children:React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin'|'signup'>('signin')
  const [message, setMessage] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  const submit = async (e:React.FormEvent) => {
    e.preventDefault()
    setMessage('')
    const result = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })
    if (result.error) setMessage(result.error.message)
    else if (mode === 'signup' && !result.data.session) setMessage('Check your email to confirm your account.')
  }

  if (loading) return <div className="authScreen"><div className="authCard">Loading CRM…</div></div>
  if (session) return <>{children}</>

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
