-- 관리자 비밀번호 리셋: phone_number 해시로 초기화
-- Convention: VARCHAR → TEXT cast 필수 (42804 방지)

CREATE OR REPLACE FUNCTION public.admin_reset_password(
  p_student_number BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user RECORD;
  v_new_hash TEXT;
BEGIN
  IF p_student_number IS NULL THEN
    RAISE EXCEPTION '학번을 입력해주세요';
  END IF;

  SELECT id, username, phone_number, student_number
  INTO v_user
  FROM public.users
  WHERE student_number = p_student_number;

  IF NOT FOUND THEN
    RAISE EXCEPTION '해당 학번의 유저를 찾을 수 없습니다';
  END IF;

  v_new_hash := encode(digest(v_user.phone_number::TEXT, 'sha256'), 'hex');

  UPDATE public.users
  SET
    password_hash = v_new_hash,
    password_changed = FALSE,
    updated_at = NOW()
  WHERE id = v_user.id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'user_id', v_user.id,
    'username', v_user.username,
    'student_number', v_user.student_number
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_password(BIGINT) TO anon, authenticated;
