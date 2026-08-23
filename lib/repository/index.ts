import { isProduction, readEnv } from "@/lib/config/env";
import { devRepository } from "./dev-store";
import { SupabaseRestRepository } from "./supabase-rest";
import type { Repository } from "./types";

let cached: Repository | null = null;

export function getRepository(): Repository {
  if (cached) {
    return cached;
  }

  const hasSupabase =
    Boolean(readEnv("SUPABASE_URL")) && Boolean(readEnv("SUPABASE_SERVICE_ROLE_KEY"));

  if (hasSupabase) {
    cached = new SupabaseRestRepository();
    return cached;
  }

  if (isProduction()) {
    throw new Error("Production requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  cached = devRepository;
  return cached;
}
