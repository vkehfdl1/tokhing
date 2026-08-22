import { NextResponse } from "next/server";
import { adminErrorResponse } from "@/lib/admin/errors";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin/session";

export async function POST(): Promise<NextResponse> {
  try {
    const response = NextResponse.json({ success: true });
    response.cookies.set(ADMIN_SESSION_COOKIE, "", {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return adminErrorResponse(error);
  }
}
