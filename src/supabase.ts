import { createClient } from '@supabase/supabase-js';
const defaultUrl = 'https://zcosfwmtatuheqrytvad.supabase.co';
const defaultKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpjb3Nmd210YXR1aGVxcnl0dmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk0MTE0ODUsImV4cCI6MjA2NDk4NzQ4NX0.y5T5cf8BNsbbM5Va0kjHX1i359J1aAB4RYO6p16TKqk';

export const supabase = createClient(
  (import.meta.env.VITE_SUPABASE_URL as string) || defaultUrl,
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || defaultKey
);
