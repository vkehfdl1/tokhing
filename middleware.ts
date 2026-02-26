import { NextResponse, type NextRequest } from "next/server";

/**
 * US-001 인증은 localStorage/sessionStorage 기반 클라이언트 세션으로 동작한다.
 * Supabase Auth 미들웨어 리다이렉트를 비활성화해 /change-password 접근을 허용한다.
 */
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
