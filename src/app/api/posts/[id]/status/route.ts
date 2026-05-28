import { failure, success } from "@/lib/api";
import { setPostStatus } from "@/lib/marketing";
import { postStatusSchema } from "@/lib/schemas";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { status } = postStatusSchema.parse(body);
    const dashboard = await setPostStatus(id, status);
    return success(dashboard);
  } catch (error) {
    return failure(error);
  }
}
