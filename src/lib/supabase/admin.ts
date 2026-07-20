import { createClient } from "@supabase/supabase-js";

import { getServerEnvironment } from "@/lib/env";

export function createAdminClient() {
  const environment = getServerEnvironment();
  return createClient(environment.NEXT_PUBLIC_SUPABASE_URL, environment.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
