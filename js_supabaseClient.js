/**
 * Global Supabase instance (v2).
 * 直接硬编码公共 anon key，方便前端静态托管。
 * 若需要隐藏，可改为读取 window.SUPABASE_*。
 */
const supabaseUrl = 'https://zcosfwmtatuheqrytvad.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpjb3Nmd210YXR1aGVxcnl0dmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk0MTE0ODUsImV4cCI6MjA2NDk4NzQ4NX0.y5T5cf8BNsbbM5Va0kjHX1i359J1aAB4RYO6p16TKqk';
const supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);