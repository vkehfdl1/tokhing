import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class AdminRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function adminErrorResponse(error: unknown): NextResponse {
  if (error instanceof AdminRequestError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "입력값을 확인해주세요.", code: "INVALID_INPUT" },
      { status: 400 },
    );
  }

  console.error("관리자 API 오류", error);
  return NextResponse.json(
    { error: "관리자 요청 처리에 실패했습니다.", code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}
