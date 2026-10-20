import { handle } from "@/lib/server/api.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
async function handler(request: Request, context: Context) {
  const { path } = await context.params;
  return handle(request, path);
}
export { handler as GET, handler as POST, handler as DELETE };
