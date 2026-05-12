import { failure, success } from "@/lib/api";
import { updateImageAsset } from "@/lib/marketing";
import { imageAssetSchema } from "@/lib/schemas";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = imageAssetSchema.parse(body);
    const dashboard = await updateImageAsset(id, input);
    return success(dashboard);
  } catch (error) {
    return failure(error);
  }
}
