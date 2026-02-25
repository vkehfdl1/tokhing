-- ==============================================
-- SEED DATA: 테스트용 유저, 경기, 마켓, 지갑
-- ==============================================

-- 1) 테스트 유저 3명 (기존 유저 데이터 정리 후 삽입)
-- 비밀번호 초기값 = phone_number의 SHA-256 해시
-- 테스트 계정:
--   학번: 2024001 / PW: 01012345678
--   학번: 2024002 / PW: 01087654321
--   학번: 2024003 / PW: 01011112222

DELETE FROM public.transactions;
DELETE FROM public.orders;
DELETE FROM public.positions;
DELETE FROM public.wallets;
DELETE FROM public.markets;
DELETE FROM public.predictions;
DELETE FROM public.games;
DELETE FROM public.users;

-- 1) 팀 데이터 (users FK 참조 대상이므로 먼저 삽입)
INSERT INTO public.teams (id, name, short_name, created_at)
VALUES
  (1, 'KIA 타이거즈', 'KIA', NOW()),
  (2, 'NC 다이노스', 'NC', NOW()),
  (3, '키움 히어로즈', '키움', NOW()),
  (4, '두산 베어스', '두산', NOW()),
  (5, 'KT 위즈', 'KT', NOW()),
  (6, '삼성 라이온즈', '삼성', NOW()),
  (7, 'SSG 랜더스', 'SSG', NOW()),
  (8, '롯데 자이언츠', '롯데', NOW()),
  (9, 'LG 트윈스', 'LG', NOW()),
  (10, '한화 이글스', '한화', NOW())
ON CONFLICT (id) DO NOTHING;

-- 2) 테스트 유저 3명
INSERT INTO public.users (id, student_number, username, phone_number, department, type, favorite_team_id, password_hash, password_changed, created_at, updated_at)
VALUES
  ('a1111111-1111-1111-1111-111111111111', 2024001, '김테스트', '01012345678', '컴퓨터공학과', 'member', 1,
   encode(digest('01012345678', 'sha256'), 'hex'), FALSE, NOW(), NOW()),
  ('a2222222-2222-2222-2222-222222222222', 2024002, '박예측', '01087654321', '경영학과', 'member', 9,
   encode(digest('01087654321', 'sha256'), 'hex'), FALSE, NOW(), NOW()),
  ('a3333333-3333-3333-3333-333333333333', 2024003, '이마켓', '01011112222', '통계학과', 'member', 2,
   encode(digest('01011112222', 'sha256'), 'hex'), FALSE, NOW(), NOW());

-- 3) 오늘 경기 5개 (다양한 상태)
INSERT INTO public.games (id, game_date, game_time, home_team_id, away_team_id, home_pitcher, away_pitcher, home_score, away_score, game_status, created_at, updated_at)
VALUES
  (901, CURRENT_DATE, '18:30', 1, 6, '양현종', '원태인', NULL, NULL, 'SCHEDULED', NOW(), NOW()),
  (902, CURRENT_DATE, '18:30', 9, 4, '임찬규', '곽빈', NULL, NULL, 'SCHEDULED', NOW(), NOW()),
  (903, CURRENT_DATE, '18:30', 2, 8, '류진욱', '박세웅', 3, 1, 'IN_PROGRESS', NOW(), NOW()),
  (904, CURRENT_DATE, '18:30', 5, 3, '벤자민', '에르난데스', 5, 2, 'FINISHED', NOW(), NOW()),
  (905, CURRENT_DATE, '18:30', 7, 10, '김광현', '문동주', NULL, NULL, 'CANCELED', NOW(), NOW());

-- 4) settings (b값)
INSERT INTO public.settings (key, value, updated_at)
VALUES ('liquidity_b', '{"value": 200}', NOW())
ON CONFLICT (key) DO UPDATE SET value = '{"value": 200}', updated_at = NOW();

-- 5) 마켓 생성 (create_market RPC 사용)
SELECT create_market(901, 47.5, 47.5, 5.0);  -- KIA vs 삼성 (OPEN)
SELECT create_market(902, 55.0, 40.0, 5.0);  -- LG vs 두산 (OPEN)
SELECT create_market(903, 60.0, 35.0, 5.0);  -- NC vs 롯데 (OPEN, 진행중)
SELECT create_market(904, 45.0, 50.0, 5.0);  -- KT vs 키움 (FINISHED → CLOSED)
SELECT create_market(905, 47.5, 47.5, 5.0);  -- SSG vs 한화 (CANCELED)

-- 경기 상태에 따라 마켓 상태 변경
UPDATE public.markets SET status = 'CLOSED' WHERE game_id = 904;
UPDATE public.markets SET status = 'CANCELED' WHERE game_id = 905;

-- 6) 지갑 생성 + 초기 코인 지급 (각 5000코인)
INSERT INTO public.wallets (id, user_id, balance, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'a1111111-1111-1111-1111-111111111111', 5000, NOW(), NOW()),
  (gen_random_uuid(), 'a2222222-2222-2222-2222-222222222222', 5000, NOW(), NOW()),
  (gen_random_uuid(), 'a3333333-3333-3333-3333-333333333333', 5000, NOW(), NOW());

INSERT INTO public.transactions (user_id, type, amount, balance_after, description, created_at)
VALUES
  ('a1111111-1111-1111-1111-111111111111', 'WEEKLY_GRANT', 5000, 5000, '초기 코인 지급', NOW()),
  ('a2222222-2222-2222-2222-222222222222', 'WEEKLY_GRANT', 5000, 5000, '초기 코인 지급', NOW()),
  ('a3333333-3333-3333-3333-333333333333', 'WEEKLY_GRANT', 5000, 5000, '초기 코인 지급', NOW());

-- 7) 테스트 거래: 김테스트가 KIA vs 삼성에서 HOME 10주 매수
SELECT execute_buy_order(
  'a1111111-1111-1111-1111-111111111111'::UUID,
  (SELECT id FROM public.markets WHERE game_id = 901),
  'HOME',
  10
);

-- 박예측이 LG vs 두산에서 AWAY 5주 매수
SELECT execute_buy_order(
  'a2222222-2222-2222-2222-222222222222'::UUID,
  (SELECT id FROM public.markets WHERE game_id = 902),
  'AWAY',
  5
);

-- 이마켓이 NC vs 롯데에서 HOME 8주 매수
SELECT execute_buy_order(
  'a3333333-3333-3333-3333-333333333333'::UUID,
  (SELECT id FROM public.markets WHERE game_id = 903),
  'HOME',
  8
);
