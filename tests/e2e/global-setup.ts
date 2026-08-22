import { resetLocalDatabase } from "@/tests/helpers/local-supabase";

export default function globalSetup(): void {
  resetLocalDatabase();
}
