export interface UserSession {
  user_id: string;
  username: string;
  student_number: string;
}

const USER_SESSION_KEY = "tokhin_user_session";
const PENDING_PASSWORD_CHANGE_KEY = "tokhin_pending_password_change";

const isBrowser = () => typeof window !== "undefined";

const parseSession = (value: string | null): UserSession | null => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<UserSession>;

    if (
      typeof parsed.user_id === "string" &&
      typeof parsed.username === "string" &&
      typeof parsed.student_number === "string"
    ) {
      return {
        user_id: parsed.user_id,
        username: parsed.username,
        student_number: parsed.student_number,
      };
    }
  } catch {
    return null;
  }

  return null;
};

export const getUserSession = (): UserSession | null => {
  if (!isBrowser()) return null;
  return parseSession(window.localStorage.getItem(USER_SESSION_KEY));
};

export const setUserSession = (session: UserSession) => {
  if (!isBrowser()) return;
  window.localStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
};

export const clearUserSession = () => {
  if (!isBrowser()) return;
  window.localStorage.removeItem(USER_SESSION_KEY);
};

export const getPendingPasswordChangeSession = (): UserSession | null => {
  if (!isBrowser()) return null;
  return parseSession(window.sessionStorage.getItem(PENDING_PASSWORD_CHANGE_KEY));
};

export const setPendingPasswordChangeSession = (session: UserSession) => {
  if (!isBrowser()) return;
  window.sessionStorage.setItem(
    PENDING_PASSWORD_CHANGE_KEY,
    JSON.stringify(session)
  );
};

export const clearPendingPasswordChangeSession = () => {
  if (!isBrowser()) return;
  window.sessionStorage.removeItem(PENDING_PASSWORD_CHANGE_KEY);
};

export const clearAllAuthState = () => {
  clearUserSession();
  clearPendingPasswordChangeSession();
};
