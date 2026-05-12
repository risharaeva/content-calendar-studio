import { generatePostPacket } from "@/lib/marketing";
import { failure, success } from "@/lib/api";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const dashboard = await generatePostPacket(id);
    return success(dashboard);
  } catch (error) {
    return failure(error);
  }
}
