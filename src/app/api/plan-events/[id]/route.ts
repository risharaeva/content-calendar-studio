import { failure, success } from "@/lib/api";
import { updatePlanEvent } from "@/lib/marketing";
import { planEventPatchSchema } from "@/lib/schemas";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = planEventPatchSchema.parse(body);
    const dashboard = await updatePlanEvent(id, input);
    return success(dashboard);
  } catch (error) {
    return failure(error);
  }
}
