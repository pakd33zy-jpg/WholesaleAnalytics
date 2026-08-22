import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://wnbavlsinslqyfbrobgx.supabase.co'

const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_Zu_8eyZC4vspm1X3Np0pjw_TMuTRQXw'

export const supabase = createClient(supabaseUrl, supabaseKey)
