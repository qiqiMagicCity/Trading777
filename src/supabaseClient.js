// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://zcosfwmtatuheqrytvad.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5...'

export const supabase = createClient(supabaseUrl, supabaseKey)
