-- US-001: 학번 로그인 + 비밀번호 인증 시스템
-- 실행 대상: Supabase SQL Editor 또는 `supabase db execute`

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS password_hash TEXT;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS password_changed BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.users
SET password_hash = encode(digest(phone_number::TEXT, 'sha256'), 'hex')
WHERE password_hash IS NULL;

CREATE OR REPLACE FUNCTION public.login(
  p_student_number BIGINT,
  p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user RECORD;
  v_input_hash TEXT;
BEGIN
  SELECT id, username, password_hash, password_changed
  INTO v_user
  FROM public.users
  WHERE student_number = p_student_number
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', '학번 또는 비밀번호가 올바르지 않습니다'
    );
  END IF;

  v_input_hash := encode(digest(COALESCE(p_password, ''), 'sha256'), 'hex');

  IF v_user.password_hash IS NULL OR v_user.password_hash <> v_input_hash THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', '학번 또는 비밀번호가 올바르지 않습니다'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'user_id', v_user.id,
    'username', v_user.username,
    'password_changed', COALESCE(v_user.password_changed, FALSE)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.change_password(
  p_user_id UUID,
  p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_new_password IS NULL OR btrim(p_new_password) = '' THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', '새 비밀번호를 입력해주세요'
    );
  END IF;

  UPDATE public.users
  SET
    password_hash = encode(digest(p_new_password, 'sha256'), 'hex'),
    password_changed = TRUE,
    updated_at = NOW()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', '사용자 정보를 찾을 수 없습니다'
    );
  END IF;

  RETURN jsonb_build_object('success', TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.login(BIGINT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_password(UUID, TEXT) TO anon, authenticated;
