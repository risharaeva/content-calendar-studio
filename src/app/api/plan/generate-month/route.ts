import { generateMonthlyPlan } from "@/lib/marketing";
import { failure, success } from "@/lib/api";
import { projectIdSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const projectId = projectIdSchema.parse(new URL(request.url).searchParams.get("projectId") ?? undefined);
    const body = (await request.json().catch(() => ({}))) as { mode?: string };
    const mode = body.mode === "complete" ? "complete" : "recreate";
    const dashboard = await generateMonthlyPlan(projectId, mode);
    return success(dashboard);
  } catch (error) {
    return failure(error);
  }
}
