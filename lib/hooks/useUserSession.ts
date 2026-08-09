"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearUserSession,
  getUserSession,
  type UserSession,
  USER_SESSION_CHANGED_EVENT,
  USER_SESSION_KEY,
  validateUserSession,
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
    let active = true;

    const syncSession = async () => {
      const storedSession = getUserSession();
      const isValid =
        storedSession !== null && (await validateUserSession(storedSession));

      if (!active) return;
      if (storedSession && !isValid) clearUserSession();
      setSession(isValid ? storedSession : null);
      setIsLoading(false);
    };

    queueMicrotask(() => {
      void syncSession();
    });

    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === USER_SESSION_KEY) {
        void syncSession();
      }
    };

    const handleSessionChanged = () => void syncSession();
    window.addEventListener("storage", handleStorage);
    window.addEventListener(USER_SESSION_CHANGED_EVENT, handleSessionChanged);

    return () => {
      active = false;
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(
        USER_SESSION_CHANGED_EVENT,
        handleSessionChanged,
      );
    };
  }, []);

  useEffect(() => {
    if (!isLoading && requireAuth && !session) {
      router.replace("/login");
    }
  }, [isLoading, requireAuth, router, session]);

  return { session, isLoading };
};
