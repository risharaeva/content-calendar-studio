import { failure, success } from "@/lib/api";
import { saveProfile } from "@/lib/marketing";
import { profileSchema, projectIdSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const projectId = projectIdSchema.parse(new URL(request.url).searchParams.get("projectId") ?? undefined);
    const body = await request.json();
    const input = profileSchema.parse(body);
    const profile = await saveProfile(projectId, input);
    return success(profile);
  } catch (error) {
    return failure(error);
  }
}
