"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUserSession, type UserSession } from "@/lib/auth";

interface UseUserSessionOptions {
  requireAuth?: boolean;
}

export const useUserSession = ({
  requireAuth = false,
}: UseUserSessionOptions = {}) => {
  const router = useRouter();
  const [session, setSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedSession = getUserSession();
    setSession(storedSession);
    setIsLoading(false);

    if (requireAuth && !storedSession) {
      router.replace("/login");
    }
  }, [requireAuth, router]);

  return { session, isLoading };
};
