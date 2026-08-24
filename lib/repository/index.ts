import { getAppEnv, isHostedRuntime, isProduction, readEnv } from "@/lib/config/env";
import { devRepository } from "./dev-store";
import { SupabaseRestRepository } from "./supabase-rest";
import type { Repository } from "./types";

let cached: { key: string; repository: Repository } | null = null;

export function getRepositoryDiagnostics() {
  const supabaseUrlConfigured = Boolean(readEnv("SUPABASE_URL"));
  const serviceRoleKeyConfigured = Boolean(readEnv("SUPABASE_SERVICE_ROLE_KEY"));

  return {
    appEnv: getAppEnv(),
    hostedRuntime: isHostedRuntime(),
    source:
      supabaseUrlConfigured && serviceRoleKeyConfigured
        ? "supabase"
        : "development",
    supabaseUrlConfigured,
    serviceRoleKeyConfigured,
  };
}

export function getRepository(): Repository {
  const diagnostics = getRepositoryDiagnostics();
  const cacheKey = `${diagnostics.source}:${diagnostics.appEnv}`;

  if (cached?.key === cacheKey) {
    return cached.repository;
  }

  if (diagnostics.source === "supabase") {
    const repository = new SupabaseRestRepository();
    cached = { key: cacheKey, repository };
    return repository;
  }

  if (isProduction() || isHostedRuntime()) {
    throw new Error("Hosted runtime requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  cached = { key: cacheKey, repository: devRepository };
  return devRepository;
}
