export function getUserId(ctx: any): number {
  return ctx.message.from.id;
}