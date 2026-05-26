import { failure, success } from "@/lib/api";
import { getDashboardState, savePlanEvent } from "@/lib/marketing";
import { planEventSchema, projectIdSchema } from "@/lib/schemas";

export async function GET(request: Request) {
  try {
    const projectId = projectIdSchema.parse(new URL(request.url).searchParams.get("projectId") ?? undefined);
    const dashboard = await getDashboardState(projectId);
    return success(dashboard.planEvents);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const projectId = projectIdSchema.parse(new URL(request.url).searchParams.get("projectId") ?? undefined);
    const body = await request.json();
    const input = planEventSchema.parse(body);
    const dashboard = await savePlanEvent(projectId, input);
    return success(dashboard);
  } catch (error) {
    return failure(error);
  }
}
