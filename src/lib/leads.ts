import { supabase } from './supabase'

export type LeadRow = {
  id: string
  owner_name: string
  property_address: string
  city: string
  source: string
  stage: 'New' | 'Contacted' | 'Qualified' | 'Offer Sent' | 'Under Contract' | 'Closed'
  score: number
  arv: number
  asking: number
  repairs: number
  mao: number
  last_touch: string
  next_action: string
}

export async function fetchLeads() {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('score', { ascending: false })
  if (error) throw error
  return (data || []) as LeadRow[]
}

export async function createLead(input: Omit<LeadRow, 'id' | 'mao'>) {
  const { data, error } = await supabase
    .from('leads')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data as LeadRow
}

export async function updateLeadStage(id: string, stage: LeadRow['stage']) {
  const { data, error } = await supabase
    .from('leads')
    .update({ stage })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as LeadRow
}
