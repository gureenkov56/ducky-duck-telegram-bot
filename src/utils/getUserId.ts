import { Context } from "telegraf";

export function getUserId(ctx: Context): number {
  return ctx.from.id;
}