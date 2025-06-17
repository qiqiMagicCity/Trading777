import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://zcosfwmtatuheqrytvad.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS...'

export const supabase = createClient(supabaseUrl, supabaseKey)
