import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { readSupabaseWebEnvironment } from "../config/environment";

let client: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient {
  if (client !== undefined) return client;
  const environment = readSupabaseWebEnvironment();
  client = createClient(
    environment.supabaseUrl,
    environment.supabasePublishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );
  return client;
}
