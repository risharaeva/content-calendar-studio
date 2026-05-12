import { ManualVerdict } from "@prisma/client";
import { failure, success } from "@/lib/api";
import { savePostReview } from "@/lib/marketing";
import { reviewSchema } from "@/lib/schemas";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = reviewSchema.parse(body);
    const dashboard = await savePostReview(id, {
      ...input,
      manualVerdict: input.manualVerdict as ManualVerdict,
    });
    return success(dashboard);
  } catch (error) {
    return failure(error);
  }
}
