import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('[Supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Auth verification will be skipped.');
}

export const supabaseAdmin = createClient(
    supabaseUrl || 'http://placeholder.invalid',
    supabaseServiceKey || 'placeholder'
);
