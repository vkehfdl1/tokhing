// @vitest-environment node

import { describe, expect, it } from "vitest";
import { createLocalServiceClient } from "@/tests/helpers/local-supabase";

describe("issue #37 member lifecycle boundary", () => {
  it("manages activation, password policy, and season wallets atomically", async () => {
    const service = createLocalServiceClient();
    const actorId = crypto.randomUUID();
    const studentNumber = 2_099_999_999;
    const { error: actorError } = await service.from("admin_operators").insert({
      id: actorId,
      username: `owner-${actorId.slice(0, 8)}`,
      display_name: "테스트 OWNER",
      role: "OWNER",
      password_hash: "test-only",
      must_change_password: false,
    });
    expect(actorError).toBeNull();

    const { data, error } = await service
      .from("users")
      .select("id, is_active, session_version")
      .limit(1);
    expect(error).toBeNull();
    expect(data?.[0]).toMatchObject({
      is_active: true,
      session_version: 1,
    });

    const existingUser = data?.[0];
    expect(existingUser).toBeDefined();
    if (!existingUser) return;

    try {
      const { data: deactivated, error: deactivateError } = await service.rpc(
        "admin_set_member_active",
        {
          p_actor_id: actorId,
          p_user_id: existingUser.id,
          p_is_active: false,
          p_confirm_open_positions: true,
          p_reason: "테스트 비활성화",
        },
      );
      expect(deactivateError).toBeNull();
      expect(deactivated).toMatchObject({ success: true, is_active: false });

      const { data: validation } = await service.rpc("validate_user_session", {
        p_user_id: existingUser.id,
        p_session_version: 1,
      });
      expect(validation).toMatchObject({ success: true, valid: false });

      const { data: inactiveGrant } = await service.rpc("admin_grant_coins", {
        p_user_id: existingUser.id,
        p_amount: 10,
      });
      expect(inactiveGrant).toMatchObject({ success: false });
      expect(String(inactiveGrant.error)).toContain("비활성 회원");

      await service.rpc("admin_set_member_active", {
        p_actor_id: actorId,
        p_user_id: existingUser.id,
        p_is_active: true,
        p_confirm_open_positions: true,
        p_reason: null,
      });

      const member = {
        student_number: studentNumber,
        username: "신규 회원",
        phone_number: "010-7777-8888",
        department: "컴퓨터공학과",
        favorite_team_id: 1,
      };
      const { data: created, error: createError } = await service.rpc(
        "admin_upsert_member",
        {
          p_actor_id: actorId,
          p_member: member,
          p_reset_password: false,
        },
      );
      expect(createError, JSON.stringify(createError)).toBeNull();
      expect(created).toMatchObject({
        success: true,
        action: "CREATE",
        wallet_created: true,
      });

      const userId = String(created.user_id);
      const { data: beforeUpdate } = await service
        .from("users")
        .select("password_hash, session_version")
        .eq("id", userId)
        .single();

      await service.rpc("admin_upsert_member", {
        p_actor_id: actorId,
        p_member: { ...member, phone_number: "010-9999-0000" },
        p_reset_password: false,
      });
      const { data: afterPhoneChange } = await service
        .from("users")
        .select("password_hash, session_version")
        .eq("id", userId)
        .single();
      expect(afterPhoneChange?.password_hash).toBe(beforeUpdate?.password_hash);

      await service.rpc("admin_upsert_member", {
        p_actor_id: actorId,
        p_member: { ...member, phone_number: "010-9999-0000" },
        p_reset_password: true,
      });
      const { data: afterReset } = await service
        .from("users")
        .select("password_hash, password_changed, session_version")
        .eq("id", userId)
        .single();
      expect(afterReset?.password_hash).not.toBe(beforeUpdate?.password_hash);
      expect(afterReset?.password_changed).toBe(false);
      expect(afterReset?.session_version).toBe(
        Number(beforeUpdate?.session_version) + 1,
      );

      const { data: activeSeason } = await service
        .from("seasons")
        .select("id")
        .eq("status", "ACTIVE")
        .single();
      await service
        .from("wallets")
        .delete()
        .eq("user_id", userId)
        .eq("season_id", activeSeason?.id);
      const { data: repaired } = await service.rpc(
        "admin_repair_member_wallet",
        {
          p_actor_id: actorId,
          p_user_id: userId,
        },
      );
      expect(repaired).toMatchObject({ success: true, created: true });
    } finally {
      await service
        .from("users")
        .update({ is_active: true })
        .eq("id", existingUser.id);
      await service.from("users").delete().eq("student_number", studentNumber);
      await service.from("admin_operators").delete().eq("id", actorId);
    }
  });
});
