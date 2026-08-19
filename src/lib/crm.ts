import { supabase } from './supabase'

export async function listTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, leads(owner_name, property_address)')
    .eq('status', 'open')
    .order('due_at', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data || []
}

export async function addTask(input: {
  lead_id?: string | null
  title: string
  due_at?: string | null
  priority?: 'low'|'normal'|'high'|'urgent'
}) {
  const { data, error } = await supabase.from('tasks').insert(input).select().single()
  if (error) throw error
  return data
}

export async function completeTask(id: string) {
  const { error } = await supabase.from('tasks').update({ status: 'done' }).eq('id', id)
  if (error) throw error
}

export async function logOutreach(input: {
  lead_id?: string | null
  channel: 'call'|'sms'|'email'|'mail'|'other'
  direction?: 'outbound'|'inbound'
  status?: string
  body?: string
}) {
  const { data, error } = await supabase.from('outreach_events').insert(input).select().single()
  if (error) throw error
  return data
}

export async function createOffer(input: {
  lead_id: string
  amount: number
  status?: 'draft'|'sent'|'accepted'|'rejected'|'expired'|'withdrawn'
  expires_at?: string | null
  notes?: string
}) {
  const { data, error } = await supabase.from('offers').insert(input).select().single()
  if (error) throw error
  return data
}

export async function listBuyers() {
  const { data, error } = await supabase.from('buyers').select('*').eq('active', true).order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function addBuyer(input: {
  name: string
  company?: string
  email?: string
  phone?: string
  markets?: string[]
  min_price?: number | null
  max_price?: number | null
  property_types?: string[]
  proof_of_funds?: boolean
  notes?: string
}) {
  const { data, error } = await supabase.from('buyers').insert(input).select().single()
  if (error) throw error
  return data
}

export async function importLeads(rows: Array<{
  owner_name: string
  property_address: string
  city?: string
  source?: string
  stage?: string
  score?: number
  arv?: number
  asking?: number
  repairs?: number
  last_touch?: string
  next_action?: string
}>) {
  if (!rows.length) return []
  const { data, error } = await supabase.from('leads').insert(rows).select()
  if (error) throw error
  return data || []
}
