import { failure, success } from "@/lib/api";
import { getDashboardState, saveImageAsset } from "@/lib/marketing";
import { imageAssetSchema, projectIdSchema } from "@/lib/schemas";

export async function GET(request: Request) {
  try {
    const projectId = projectIdSchema.parse(new URL(request.url).searchParams.get("projectId") ?? undefined);
    const dashboard = await getDashboardState(projectId);
    return success(dashboard.imageAssets);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const projectId = projectIdSchema.parse(new URL(request.url).searchParams.get("projectId") ?? undefined);
    const body = await request.json();
    const input = imageAssetSchema.parse(body);
    const dashboard = await saveImageAsset(projectId, input);
    return success(dashboard);
  } catch (error) {
    return failure(error);
  }
}
