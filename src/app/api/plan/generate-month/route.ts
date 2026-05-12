import { generateMonthlyPlan } from "@/lib/marketing";
import { failure, success } from "@/lib/api";
import { projectIdSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const projectId = projectIdSchema.parse(new URL(request.url).searchParams.get("projectId") ?? undefined);
    const dashboard = await generateMonthlyPlan(projectId);
    return success(dashboard);
  } catch (error) {
    return failure(error);
  }
}
