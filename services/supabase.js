// services/supabase.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// SUBSTITUA PELAS SUAS CREDENCIAIS
const SUPABASE_URL = 'https://egiyirxtsglfoxjomoik.supabase.co';  // ← SUA URL
const SUPABASE_ANON_KEY = 'sb_publishable_9PMCuOmhLt1gmk8OuxGVag_0v4t3PyM';  // ← SUA CHAVE

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});

export default supabase;