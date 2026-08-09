import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import localSupabase from "./scripts/local-supabase-env.mjs";

const { loadLocalSupabaseEnv } = localSupabase;
Object.assign(process.env, loadLocalSupabaseEnv());

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    clearMocks: true,
    restoreMocks: true,
  },
});
