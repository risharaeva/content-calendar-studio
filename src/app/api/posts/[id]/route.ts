import { failure, success } from "@/lib/api";
import { deletePost, updatePostIdea } from "@/lib/marketing";
import { postIdeaSchema } from "@/lib/schemas";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = postIdeaSchema.parse(body);
    const dashboard = await updatePostIdea(id, input);
    return success(dashboard);
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const dashboard = await deletePost(id);
    return success(dashboard);
  } catch (error) {
    return failure(error);
  }
}
