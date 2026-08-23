import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./supabase/migrations/drizzle",
  schema: "./db/schema.ts",
  dialect: "postgresql",
});
