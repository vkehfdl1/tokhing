import { z } from "zod";

const EmptyArgs = z.object({}).strict();

export const AdminRpcRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("end_season"),
    args: z.object({ p_season_id: z.number().int().positive() }),
  }),
  z.object({
    action: z.literal("create_market"),
    args: z.object({
      p_game_id: z.number().int().positive(),
      p_initial_home: z.number().positive(),
      p_initial_away: z.number().positive(),
      p_initial_draw: z.number().positive(),
    }),
  }),
  z.object({
    action: z.literal("settle_market"),
    args: z.object({
      p_market_id: z.number().int().positive(),
      p_result: z.enum(["HOME", "AWAY", "DRAW"]),
    }),
  }),
  z.object({
    action: z.literal("close_market"),
    args: z.object({ p_market_id: z.number().int().positive() }),
  }),
  z.object({
    action: z.literal("cancel_market"),
    args: z.object({ p_market_id: z.number().int().positive() }),
  }),
  z.object({
    action: z.literal("set_liquidity_b"),
    args: z.object({ p_b: z.number().positive() }),
  }),
  z.object({
    action: z.literal("distribute_weekly_coins"),
    args: z.object({ p_amount: z.number().positive() }),
  }),
  z.object({
    action: z.literal("admin_grant_coins"),
    args: z.object({
      p_user_id: z.uuid(),
      p_amount: z.number(),
    }),
  }),
  z.object({
    action: z.literal("admin_reset_password"),
    args: z.object({ p_student_number: z.number().int().positive() }),
  }),
  z.object({
    action: z.literal("get_weekly_coin_cron_status"),
    args: EmptyArgs,
  }),
]);

export type AdminRpcRequest = z.infer<typeof AdminRpcRequestSchema>;

const CRITICAL_ACTIONS = new Set<AdminRpcRequest["action"]>([
  "end_season",
  "settle_market",
  "cancel_market",
  "admin_grant_coins",
  "admin_reset_password",
]);

export function isCriticalAdminAction(
  action: AdminRpcRequest["action"],
): boolean {
  return CRITICAL_ACTIONS.has(action);
}
