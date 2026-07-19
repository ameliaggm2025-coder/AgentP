import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Server-only Supabase client using the service_role key.
 * 繞過 RLS，只可在 server component / route handler 使用，絕不可送到瀏覽器。
 */
export function supabaseAdmin() {
  if (!url || !serviceKey) {
    throw new Error(
      'Supabase 環境變數未設定：請填入 NEXT_PUBLIC_SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY'
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
