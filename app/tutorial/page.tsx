"use client";

import { useIsMobile } from "@/lib/hooks/useResponsive";

export default function TutorialPage() {
  const isMobile = useIsMobile();

  return (
    <div className={`w-full mx-auto ${isMobile ? "p-4" : "p-8"}`}>
      <h1
        className={`font-bold text-center text-black mb-4 ${
          isMobile ? "text-xl" : "text-4xl"
        }`}
      >
        토킹 시즌3 튜토리얼
      </h1>

      <p
        className={`text-black mt-4 text-center font-normal ${
          isMobile ? "text-xs" : "text-base"
        }`}
      >
        안녕하세요, 루킹 프런트입니다.
        <br />
        토킹(ToKHin&apos;) SEASON 3에 대해 안내드립니다.
      </p>

      <div className="space-y-8 mt-8">
        {/* Section 1: What is ToKHin'? */}
        <section
          className={`border-l-4 border-blue-500 ${isMobile ? "pl-4" : "pl-6"}`}
        >
          <h3
            className={`font-bold text-black mb-4 flex items-center ${
              isMobile ? "text-base" : "text-2xl"
            }`}
          >
            <span className={`mr-2 ${isMobile ? "text-base" : "text-3xl"}`}>
              ☝🏻
            </span>
            토킹이란?
          </h3>
          <div className={`bg-blue-50 rounded-lg ${isMobile ? "p-3" : "p-4"}`}>
            <p
              className={`text-gray-700 leading-relaxed ${
                isMobile ? "text-xs" : "text-base"
              }`}
            >
              토킹(ToKHin&apos;)은 <strong>&ldquo;스포츠토토&rdquo;</strong>와
              동아리명 <strong>&ldquo;루킹&rdquo;</strong>의 합성어로 경기
              결과를 예측하는 컨텐츠입니다.
            </p>
            <p
              className={`text-gray-700 leading-relaxed mt-2 ${
                isMobile ? "text-xs" : "text-base"
              }`}
            >
              위 컨텐츠는 3.5기 활동 시작부터 시즌 종료까지 이어질 예정이며 최종
              1~3등, 그리고 최종 점수에 따라 가중치를 두어 추첨을 통해 참가상도
              2명에게 주어질 예정입니다.
            </p>
          </div>
        </section>

        {/* Section 2: How does ToKHin' work? */}
        <section
          className={`border-l-4 border-green-500 ${
            isMobile ? "pl-4" : "pl-6"
          }`}
        >
          <h3
            className={`font-bold text-black mb-4 flex items-center ${
              isMobile ? "text-base" : "text-2xl"
            }`}
          >
            <span className={`mr-2 ${isMobile ? "text-base" : "text-3xl"}`}>
              ✌🏻
            </span>
            토킹(ToKHin&apos;) 진행 방식은 어떻게 되나요?
          </h3>
          <div className={`bg-green-50 rounded-lg ${isMobile ? "p-3" : "p-4"}`}>
            <p
              className={`text-gray-700 leading-relaxed mb-4 ${
                isMobile ? "text-xs" : "text-base"
              }`}
            >
              토킹은 경기 당일 자정부터 토킹 홈페이지를 통하여 예측 응답을 받은
              뒤, 당회차 집계 결과를 발표해드립니다. 이 결과와 그 날 경기 결과를
              토대로 아래 기준에 따라 점수가 정해지게 됩니다.
            </p>

            {/* Scoring System */}
            <div
              className={`bg-white border-2 border-gray-300 rounded-lg my-4 ${
                isMobile ? "p-3" : "p-4"
              }`}
            >
              <h4
                className={`font-bold text-center text-gray-800 mb-3 ${
                  isMobile ? "text-sm" : "text-lg"
                }`}
              >
                점수 기준
              </h4>
              <div className="space-y-2">
                <div
                  className={`flex justify-between items-center bg-red-100 rounded ${
                    isMobile ? "p-2 text-xs" : "p-2"
                  }`}
                >
                  <span className="font-semibold text-black">50% 이상:</span>
                  <span className="font-bold text-red-600">1점</span>
                </div>
                <div
                  className={`flex justify-between items-center bg-orange-100 rounded ${
                    isMobile ? "p-2 text-xs" : "p-2"
                  }`}
                >
                  <span className="font-semibold text-black">
                    25% 이상 50% 미만:
                  </span>
                  <span className="font-bold text-orange-600">2점</span>
                </div>
                <div
                  className={`flex justify-between items-center bg-yellow-100 rounded ${
                    isMobile ? "p-2 text-xs" : "p-2"
                  }`}
                >
                  <span className="font-semibold text-black">
                    10% 이상 25% 미만:
                  </span>
                  <span className="font-bold text-yellow-600">3점</span>
                </div>
                <div
                  className={`flex justify-between items-center bg-green-100 rounded ${
                    isMobile ? "p-2 text-xs" : "p-2"
                  }`}
                >
                  <span className="font-semibold text-black">10% 미만:</span>
                  <span className="font-bold text-green-600">5점</span>
                </div>
              </div>
            </div>

            {/* Examples */}
            <div className="mt-4">
              <h4
                className={`font-bold text-gray-800 mb-2 ${
                  isMobile ? "text-sm" : "text-lg"
                }`}
              >
                예시:
              </h4>
              <div
                className={`bg-gray-100 rounded-lg mb-2 ${
                  isMobile ? "p-2" : "p-3"
                }`}
              >
                <p
                  className={`text-gray-700 ${
                    isMobile ? "text-xs" : "text-sm"
                  }`}
                >
                  <strong>예시 1:</strong> SSG 60%, 키움 40%로 집계된 경우
                  <br />
                  • SSG 승리 시: SSG 선택자들은 1점 획득
                  <br />• 키움 승리 시: 키움 선택자들은 2점 획득
                </p>
              </div>
              <div
                className={`bg-gray-100 rounded-lg ${isMobile ? "p-2" : "p-3"}`}
              >
                <p
                  className={`text-gray-700 ${
                    isMobile ? "text-xs" : "text-sm"
                  }`}
                >
                  <strong>예시 2:</strong> SSG 56%, 두산 44%로 집계된 경우
                  <br />
                  • SSG 승리 시: SSG 선택자들은 1점 획득
                  <br />• 두산 승리 시: 두산 선택자들은 2점 획득
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: How to use the website */}
        <section className="border-l-4 border-purple-500 pl-6">
          <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center">
            <span className="text-base mr-2">🤟🏻</span>
            토킹(ToKHin&apos;) 홈페이지 사용 방식은 어떻게 되나요?
          </h3>
          <div className="bg-purple-50 p-4 rounded-lg">
            <p className="text-gray-700 leading-relaxed mb-4 text-xs">
              이번 SEASON 3부터 새로운 토킹 홈페이지를 사용합니다.
            </p>

            <div className="space-y-4">
              <div className="bg-white p-4 rounded-lg border-l-4 border-blue-400">
                <h4 className="font-bold text-blue-700 mb-2 text-sm">
                  📊 오늘의 예측 탭
                </h4>
                <p className="text-gray-700 text-xs">
                  학번을 입력하면 오늘 경기에 대한 결과 예측을 수행할 수
                  있습니다. <strong>결과 예측은 수정 불가</strong>하니 신중하게
                  결정해주세요!
                  <br />
                  어떻게 경기를 예측했는지 궁금하다면 언제든지 다시 접속하여
                  확인해 볼 수 있습니다.
                </p>
              </div>

              <div className="bg-white p-4 rounded-lg border-l-4 border-green-400">
                <h4 className="font-bold text-green-700 mb-2 text-sm">
                  📈 기록 탭
                </h4>
                <p className="text-gray-700 text-xs">
                  학번을 입력하면 과거 경기 결과 예측과 그 결과를 모두 확인해 볼
                  수 있습니다. 다른 부원들의 예측 비율도 함께 보실 수 있습니다.
                </p>
              </div>

              <div className="bg-white p-4 rounded-lg border-l-4 border-yellow-400">
                <h4 className="font-bold text-yellow-700 mb-2 text-sm">
                  🏆 순위 탭
                </h4>
                <p className="text-gray-700 text-xs">
                  현재 모든 부원의 점수와 순위를 한 번에 열람하실 수 있습니다.
                  그 날 경기는 해당 날짜가 지나기 전 자동으로 계산되어 업데이트
                  됩니다.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Contact & Footer */}
        <section className="text-center bg-gray-100 p-6 rounded-lg">
          <div className="mb-4">
            <p className="text-gray-700 mb-2 text-sm">
              토킹 홈페이지 관련 문의 사항은
            </p>
            <p className="font-bold text-gray-800 text-sm">
              루킹 회장 김동규 (010-8296-0711)로 문의해주세요.
            </p>
          </div>

          <div className="border-t pt-4">
            <p className="text-gray-700 mb-2 text-sm">
              많은 분들의 적극적인 참여 부탁드립니다. <br /> 감사합니다!
            </p>
            <p className="font-bold text-lg text-gray-800">
              We are always Loo<span className="text-khuRed">KH</span>in
              Baseball ⚾️
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
