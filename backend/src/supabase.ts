/**
 * Supabase client for backend API (Drive transfer, hardening).
 * Uses SERVICE ROLE key; validates connection at startup.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

function getConfig(): { url: string; serviceKey: string; table: string; idColumn: string } {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!url || url.trim() === "") {
    throw new Error(
      "SUPABASE_URL is not set. Add it to backend/.env (or copy from project root .env)."
    );
  }
  if (!serviceKey || serviceKey.trim() === "") {
    throw new Error(
      "SUPABASE_SERVICE_KEY is not set. Use the service role key from Supabase Dashboard → API."
    );
  }

  const table = process.env.SUPABASE_TABLE?.trim() || "documents";
  const idColumn = process.env.SUPABASE_ID_COLUMN?.trim() || "id";
  return { url, serviceKey, table, idColumn };
}

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;
  const { url, serviceKey } = getConfig();
  _client = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return _client;
}

export async function validateSupabaseConnection(): Promise<void> {
  const { table, idColumn } = getConfig();
  const client = getSupabaseClient();
  const { error } = await client.from(table).select(idColumn).limit(1);

  if (error) {
    const hint =
      error.message === "Invalid API key" || error.code === "PGRST301"
        ? "Use the SERVICE ROLE key (secret), not the anon key. Supabase Dashboard → Project Settings → API → service_role."
        : "";
    throw new Error(
      `Supabase connection validation failed: ${error.message}\n` +
        `  Table: ${table}, Column: ${idColumn}. Check SUPABASE_* in backend/.env${hint ? `\n  ${hint}` : ""}`
    );
  }
  console.log(`[supabase] Connection validated — table="${table}"`);
}
