import { failure, success } from "@/lib/api";
import { saveCompetitorPost } from "@/lib/marketing";
import { competitorPostSchema, projectIdSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const projectId = projectIdSchema.parse(new URL(request.url).searchParams.get("projectId") ?? undefined);
    const body = await request.json();
    const input = competitorPostSchema.parse(body);
    const dashboard = await saveCompetitorPost(projectId, input);
    return success(dashboard);
  } catch (error) {
    return failure(error);
  }
}
