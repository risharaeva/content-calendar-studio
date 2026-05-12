import { failure, success } from "@/lib/api";
import { savePublishedPost } from "@/lib/marketing";
import { projectIdSchema, publishedPostSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const projectId = projectIdSchema.parse(new URL(request.url).searchParams.get("projectId") ?? undefined);
    const body = await request.json();
    const input = publishedPostSchema.parse(body);
    const dashboard = await savePublishedPost(projectId, input);
    return success(dashboard);
  } catch (error) {
    return failure(error);
  }
}
