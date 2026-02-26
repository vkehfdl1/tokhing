"use client";

import { useUserSession } from "@/lib/hooks/useUserSession";

const MARKET_STATUS_ITEMS = [
  { status: "OPEN", label: "거래 가능", description: "경기 시작 전 상태이며, 자유롭게 매수/매도할 수 있습니다." },
  { status: "CLOSED", label: "거래 마감", description: "더 이상 주문할 수 없으며, 경기 결과를 기다리는 상태입니다." },
  { status: "SETTLED", label: "정산 완료", description: "경기가 끝나고 결과에 따라 코인이 지급된 상태입니다." },
  { status: "CANCELED", label: "취소됨", description: "마켓이 취소되어 투자한 코인이 환급된 상태입니다." },
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
      <h1 className="mb-2 text-center text-xl font-bold text-black">
        ToKHin&apos; 이용 가이드
      </h1>

      <p className="text-center text-xs text-zinc-500 mb-6">
        처음 이용하시는 분은 아래 내용을 읽어보시면 됩니다.
      </p>

      <div className="space-y-6">
        {/* 핵심 요약 */}
        <section className="rounded-2xl bg-tokhin-green/10 p-5">
          <h2 className="text-sm font-bold text-black mb-2">한 줄 요약</h2>
          <p className="text-xs leading-relaxed text-zinc-700">
            KBO 야구 경기 결과를 예측하고, 맞히면 코인을 벌고, 틀리면 잃는 게임입니다.
            주식처럼 싸게 사서 비싸게 파는 것도 가능합니다.
          </p>
        </section>

        {/* Step 1 */}
        <section className="border-l-4 border-tokhin-green pl-4">
          <h2 className="mb-3 text-base font-bold text-black">
            1단계: 경기 고르기
          </h2>
          <div className="rounded-2xl bg-green-50 p-5 space-y-3">
            <p className="text-xs leading-relaxed text-zinc-700">
              홈 화면에 오늘의 KBO 경기 목록이 표시됩니다.
              관심 있는 경기를 눌러 들어가시면 됩니다.
            </p>
            <p className="text-xs leading-relaxed text-zinc-700">
              각 경기에는 3가지 선택지가 있습니다:
            </p>
            <div className="flex gap-2">
              <span className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700">
                원정팀 승
              </span>
              <span className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700">
                무승부
              </span>
              <span className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700">
                홈팀 승
              </span>
            </div>
          </div>
        </section>

        {/* Step 2 */}
        <section className="border-l-4 border-blue-500 pl-4">
          <h2 className="mb-3 text-base font-bold text-black">
            2단계: 사기 (매수)
          </h2>
          <div className="rounded-2xl bg-blue-50 p-5 space-y-3">
            <p className="text-xs leading-relaxed text-zinc-700">
              주식과 비슷합니다. 경기 결과에 해당하는 종목(홈팀 승, 원정팀 승, 무승부)의
              주식을 사는 것이라고 생각하시면 됩니다.
            </p>
            <p className="text-xs leading-relaxed text-zinc-700">
              각 종목에는 <strong>현재가</strong>가 표시됩니다.
              현재가가 40이면, 1주를 살 때 약 40코인을 지불하게 됩니다.
              사는 사람이 많을수록 현재가가 올라가고, 적을수록 내려갑니다.
            </p>
            <div className="rounded-lg bg-white p-3">
              <p className="text-xs text-zinc-600">
                <strong>예시:</strong> 두산이 이길 것 같다면, 두산 승 종목의 매수(BUY) 버튼을
                눌러 주식을 매수합니다. 현재가가 40이면 1주당 약 40코인을 지불합니다.
              </p>
            </div>
            <p className="text-xs leading-relaxed text-zinc-700">
              주문 방식은 두 가지입니다:
            </p>
            <div className="space-y-1.5">
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-xs text-zinc-700"><strong>수량 매수</strong> &mdash; 원하는 주식 수를 지정합니다 (예: 3주)</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-xs text-zinc-700"><strong>금액 매수</strong> &mdash; 투자할 코인을 지정합니다 (예: 100코인어치)</p>
              </div>
            </div>
          </div>
        </section>

        {/* Step 3 */}
        <section className="border-l-4 border-purple-500 pl-4">
          <h2 className="mb-3 text-base font-bold text-black">
            3단계: 팔기 (매도)
          </h2>
          <div className="rounded-2xl bg-purple-50 p-5 space-y-3">
            <p className="text-xs leading-relaxed text-zinc-700">
              보유한 주식은 경기가 끝나기 전까지 언제든 매도할 수 있습니다.
            </p>
            <p className="text-xs leading-relaxed text-zinc-700">
              현재가가 매수 시점보다 올랐다면 매도하여 차익을 남길 수 있고,
              반대로 결과가 불안하다면 미리 매도하여 손실을 줄일 수도 있습니다.
            </p>
            <div className="rounded-lg bg-white p-3">
              <p className="text-xs text-zinc-600">
                <strong>예시:</strong> 현재가 40에 매수한 주식이 60으로 올랐다면,
                지금 매도하면 약 20코인의 차익이 발생합니다.
              </p>
            </div>
          </div>
        </section>

        {/* Step 4 */}
        <section className="border-l-4 border-amber-500 pl-4">
          <h2 className="mb-3 text-base font-bold text-black">
            4단계: 정산 받기
          </h2>
          <div className="rounded-2xl bg-amber-50 p-5 space-y-3">
            <p className="text-xs leading-relaxed text-zinc-700">
              경기가 끝나면 결과가 입력되고, 자동으로 정산이 진행됩니다.
            </p>
            <div className="space-y-1.5">
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-xs text-zinc-700">
                  <strong>예측 성공</strong> &rarr; 보유 주식 1주당 <strong>100코인</strong> 지급
                </p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-xs text-zinc-700">
                  <strong>예측 실패</strong> &rarr; 해당 주식은 <strong>0코인</strong>으로 처리
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-white p-3">
              <p className="text-xs text-zinc-600">
                <strong>예시:</strong> 홈팀 승 3주를 보유 중이었는데 실제로 홈팀이 승리했다면,
                3주 x 100코인 = <strong>300코인</strong>을 받게 됩니다.
              </p>
            </div>
          </div>
        </section>

        {/* 가격 원리 */}
        <section className="border-l-4 border-rose-500 pl-4">
          <h2 className="mb-3 text-base font-bold text-black">
            현재가는 어떻게 변하나요?
          </h2>
          <div className="rounded-2xl bg-rose-50 p-5 space-y-3">
            <p className="text-xs leading-relaxed text-zinc-700">
              실제 주식시장과 동일하게, 매수하는 사람이 많을수록 해당 종목의
              현재가가 올라가고, 나머지 종목의 현재가는 내려갑니다.
              세 종목의 현재가 합은 항상 <strong>100</strong>입니다.
            </p>
            <p className="text-xs leading-relaxed text-zinc-700">
              아직 사람들이 주목하지 않는 종목을 싸게 매수해서,
              예측이 맞으면 큰 수익을 낼 수 있습니다.
            </p>
          </div>
        </section>

        {/* 마켓 상태 */}
        <section className="border-l-4 border-zinc-400 pl-4">
          <h2 className="mb-3 text-base font-bold text-black">마켓 상태 안내</h2>
          <div className="rounded-2xl bg-zinc-50 p-5">
            <div className="space-y-2">
              {MARKET_STATUS_ITEMS.map((item) => (
                <div key={item.status} className="rounded-lg bg-white px-3 py-2">
                  <p className="text-xs font-semibold text-zinc-900">
                    {item.status} <span className="font-normal text-zinc-500">({item.label})</span>
                  </p>
                  <p className="text-xs text-zinc-600 mt-0.5">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 화면 안내 */}
        <section className="rounded-2xl bg-zinc-100 p-5 space-y-3">
          <h2 className="text-sm font-bold text-black">화면별 안내</h2>
          <div className="space-y-1.5">
            <div className="rounded-lg bg-white px-3 py-2">
              <p className="text-xs text-zinc-700">
                <strong>홈</strong> &mdash; 오늘 경기 목록이 표시되며, 여기서 주문합니다
              </p>
            </div>
            <div className="rounded-lg bg-white px-3 py-2">
              <p className="text-xs text-zinc-700">
                <strong>히스토리</strong> &mdash; 보유 현황, 거래 기록, 정산 내역을 확인합니다
              </p>
            </div>
            <div className="rounded-lg bg-white px-3 py-2">
              <p className="text-xs text-zinc-700">
                <strong>리더보드</strong> &mdash; 전체 유저 잔고 순위와 수익률 순위를 확인합니다
              </p>
            </div>
          </div>
        </section>

        {/* 팁 */}
        <section className="rounded-2xl bg-tokhin-green/10 p-5">
          <h2 className="text-sm font-bold text-black mb-2">초보자 팁</h2>
          <ul className="space-y-2 text-xs leading-relaxed text-zinc-700">
            <li>- 처음에는 소액(10~20코인)으로 연습해보시는 것을 추천합니다</li>
            <li>- 현재가가 낮은 종목일수록 예측 성공 시 수익이 큽니다</li>
            <li>- 확신이 없다면 경기 전에 매도하여 미리 빠져나올 수 있습니다</li>
            <li>- 루킹 프런트에서 개총/종총 참여, MT 게임 등 각종 이벤트를 통해 코인을 지급받을 수 있습니다</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
