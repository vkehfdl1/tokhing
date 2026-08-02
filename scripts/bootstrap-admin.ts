import { randomBytes, scrypt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const BootstrapEnvSchema = z.object({
  ADMIN_BOOTSTRAP_CONFIRM: z.literal("CREATE_INITIAL_OWNER"),
  ADMIN_BOOTSTRAP_USERNAME: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,50}$/),
  ADMIN_BOOTSTRAP_DISPLAY_NAME: z.string().trim().min(2).max(50),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(12).max(128),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_LOCAL_ONLY: z.string().optional(),
  ADMIN_BOOTSTRAP_PROJECT_REF: z.string().optional(),
});

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      { N: 16_384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

async function bootstrap(): Promise<void> {
  const env = BootstrapEnvSchema.parse(process.env);
  const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
  const isLocal = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  if (!isLocal && env.ADMIN_BOOTSTRAP_PROJECT_REF !== url.hostname.split(".")[0]) {
    throw new Error(
      "원격 초기 OWNER 생성에는 호스트와 일치하는 ADMIN_BOOTSTRAP_PROJECT_REF가 필요합니다.",
    );
  }

  const service = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        storageKey: "tokhin-admin-bootstrap",
      },
    },
  );
  const { count, error: countError } = await service
    .from("admin_operators")
    .select("*", { count: "exact", head: true });
  if (countError) throw countError;
  if ((count ?? 0) > 0) {
    throw new Error("운영자가 이미 존재하여 초기 OWNER 생성을 중단했습니다.");
  }

  const passwordHash = await hashPassword(env.ADMIN_BOOTSTRAP_PASSWORD);
  const { data, error } = await service
    .from("admin_operators")
    .insert({
      username: env.ADMIN_BOOTSTRAP_USERNAME,
      display_name: env.ADMIN_BOOTSTRAP_DISPLAY_NAME,
      role: "OWNER",
      password_hash: passwordHash,
      must_change_password: false,
      password_changed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;

  const { error: auditError } = await service.from("admin_audit_logs").insert({
    operator_id: data.id,
    action: "ADMIN_INITIAL_OWNER_BOOTSTRAPPED",
    target_type: "admin_operator",
    target_id: data.id,
    success: true,
  });
  if (auditError) throw auditError;
  console.log(`초기 OWNER 생성 완료: ${env.ADMIN_BOOTSTRAP_USERNAME}`);
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
