"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useUserSession } from "@/lib/hooks/useUserSession";

export default function MarketDetailPlaceholderPage() {
  const { session, isLoading } = useUserSession({ requireAuth: true });
  const params = useParams<{ id: string }>();

  if (isLoading) {
    return <p className="py-20 text-center text-zinc-500">로딩 중...</p>;
  }

  if (!session?.user_id) {
    return null;
  }

  return (
    <div className="w-full pt-2">
      <h1 className="text-xl font-bold text-black">마켓 #{params.id}</h1>
      <p className="mt-2 text-sm text-zinc-500">
        마켓 상세/거래 화면은 다음 스토리에서 구현됩니다.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex h-12 items-center rounded-lg bg-tokhin-green px-4 text-sm font-semibold text-white shadow-[0px_0px_8px_0px_rgba(0,0,0,0.12)]"
      >
        마켓 목록으로 돌아가기
      </Link>
    </div>
  );
}
