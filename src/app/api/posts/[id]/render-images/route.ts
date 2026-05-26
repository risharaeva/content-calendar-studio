import { renderPostImages } from "@/lib/marketing";
import { failure, success } from "@/lib/api";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { mode?: string };
    const dashboard = await renderPostImages(id, body.mode);
    return success(dashboard);
  } catch (error) {
    return failure(error);
  }
}
