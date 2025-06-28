import { supabase } from '../supabaseClient';

export async function addTrade(payload) {
  const { error } = await supabase.from('trades').insert(payload);
  if (error) throw error;
}
