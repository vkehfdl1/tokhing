import { resetLocalDatabase } from "@/tests/helpers/local-supabase";

export default function globalTeardown(): void {
  resetLocalDatabase();
}
