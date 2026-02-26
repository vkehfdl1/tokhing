-- users 테이블 RLS 활성화: 개인정보(phone_number, department) 보호
-- RPC 함수들은 SECURITY DEFINER라 RLS 영향 없음

-- 1. 직접 테이블 접근 전면 차단
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- SELECT/INSERT/UPDATE/DELETE 모두 차단
-- (RPC 함수는 SECURITY DEFINER라 이 정책 무시)
CREATE POLICY "users_deny_all" ON public.users
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- 2. 안전한 컬럼만 노출하는 뷰 생성
CREATE OR REPLACE VIEW public.users_public AS
SELECT id, student_number, username
FROM public.users;

-- 뷰에 조회 권한 부여
GRANT SELECT ON public.users_public TO anon, authenticated;

-- 원본 테이블 직접 접근 권한 회수
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.users FROM anon, authenticated;
