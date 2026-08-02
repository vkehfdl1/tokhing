import { execFileSync } from "node:child_process";
import { resetLocalDatabase } from "@/tests/helpers/local-supabase";

export default function globalSetup(): void {
  resetLocalDatabase();
  execFileSync("npm", ["run", "admin:bootstrap:local"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ADMIN_BOOTSTRAP_CONFIRM: "CREATE_INITIAL_OWNER",
      ADMIN_BOOTSTRAP_USERNAME: "owner",
      ADMIN_BOOTSTRAP_DISPLAY_NAME: "초기 운영자",
      ADMIN_BOOTSTRAP_PASSWORD: "OwnerPass!234",
    },
    stdio: "inherit",
  });
}
