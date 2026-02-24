"use client";

import { useUserSession } from "@/lib/hooks/useUserSession";

const OUTCOME_ITEMS = ["HOME", "AWAY", "DRAW"] as const;

const MARKET_STATUS_ITEMS = [
  { status: "OPEN", description: "주문 가능 상태입니다." },
  { status: "CLOSED", description: "신규 주문은 막혀 있고 정산 대기 상태입니다." },
  { status: "SETTLED", description: "결과 확정 및 정산이 완료된 상태입니다." },
  { status: "CANCELED", description: "마켓 취소로 원가 환급이 처리된 상태입니다." },
] as const;

export default function TutorialPage() {
  const { session, isLoading } = useUserSession({ requireAuth: true });

  if (isLoading) {
    return <p className="py-20 text-center text-zinc-500">로딩 중...</p>;
  }

  if (!session) {
    return null;
  }

  return (
    <div className="w-full pt-1">
      <h1 className="mb-4 text-center text-xl font-bold text-black">
        ToKHin&apos; LMSR 튜토리얼
      </h1>

      <p className="text-center text-xs text-zinc-700">
        시즌 3부터 ToKHin&apos;은 점수제가 아닌 LMSR 예측시장 방식으로 운영됩니다.
      </p>

      <div className="mt-8 space-y-8">
        <section className="border-l-4 border-tokhin-green pl-4">
          <h2 className="mb-3 text-base font-bold text-black">1. 마켓이란?</h2>
          <div className="rounded-2xl bg-green-50 p-5">
            <p className="text-xs leading-relaxed text-zinc-700">
              각 경기는 하나의 마켓으로 열리며, 결과 토큰을 사고팔 수 있습니다.
              결과 후보는 아래 3가지입니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {OUTCOME_ITEMS.map((outcome) => (
                <span
                  key={outcome}
                  className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-zinc-700"
                >
                  {outcome}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="border-l-4 border-blue-500 pl-4">
          <h2 className="mb-3 text-base font-bold text-black">2. 가격과 주문</h2>
          <div className="rounded-2xl bg-blue-50 p-5">
            <p className="text-xs leading-relaxed text-zinc-700">
              마켓 가격은 LMSR 수식으로 계산되며, HOME/AWAY/DRAW 가격 합은 항상
              100입니다. 매수(BUY)는 해당 결과 토큰 수량이 늘고, 매도(SELL)는 보유
              토큰 수량이 줄어듭니다.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-700">
              주문은 수량 기준 매수/매도와 금액 기준 매수(Amount Buy)를 지원합니다.
              주문이 체결되면 시장 수량(q)이 바뀌고 즉시 현재가도 함께 변합니다.
            </p>
          </div>
        </section>

        <section className="border-l-4 border-amber-500 pl-4">
          <h2 className="mb-3 text-base font-bold text-black">
            3. 정산 규칙 (0/100)
          </h2>
          <div className="rounded-2xl bg-amber-50 p-5">
            <p className="text-xs leading-relaxed text-zinc-700">
              경기 종료 후 결과가 확정되면 마켓을 정산합니다. 정답 outcome 토큰은
              1주당 100코인으로 정산되고, 오답 outcome 토큰은 0코인으로 정산됩니다.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-700">
              예: HOME 토큰 3주를 보유한 상태에서 결과가 HOME이면 300코인을 받습니다.
            </p>
          </div>
        </section>

        <section className="border-l-4 border-red-500 pl-4">
          <h2 className="mb-3 text-base font-bold text-black">4. 마켓 상태</h2>
          <div className="rounded-2xl bg-red-50 p-5">
            <div className="space-y-2">
              {MARKET_STATUS_ITEMS.map((item) => (
                <div key={item.status} className="rounded-lg bg-white px-3 py-2">
                  <p className="text-xs font-semibold text-zinc-900">{item.status}</p>
                  <p className="text-xs text-zinc-600 mt-1">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl bg-zinc-100 p-4">
          <h2 className="text-sm font-semibold text-black mb-2">탭 사용 안내</h2>
          <p className="text-xs text-zinc-700 leading-relaxed">
            마켓(홈)에서 주문하고, 포지션(히스토리)에서 진행 중 포지션/거래 내역/정산
            내역을 확인할 수 있습니다. 리더보드에서는 잔고 순위와 수익률 순위를
            확인할 수 있습니다.
          </p>
        </section>
      </div>
    </div>
  );
}
