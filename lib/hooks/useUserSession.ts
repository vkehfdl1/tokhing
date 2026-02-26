"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getUserSession,
  type UserSession,
  USER_SESSION_CHANGED_EVENT,
  USER_SESSION_KEY,
} from "@/lib/auth";

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
    const syncSession = () => {
      setSession(getUserSession());
    };

    syncSession();
    setIsLoading(false);

    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === USER_SESSION_KEY) {
        syncSession();
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(USER_SESSION_CHANGED_EVENT, syncSession);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(USER_SESSION_CHANGED_EVENT, syncSession);
    };
  }, []);

  useEffect(() => {
    if (!isLoading && requireAuth && !session) {
      router.replace("/login");
    }
  }, [isLoading, requireAuth, router, session]);

  return { session, isLoading };
};
