import { failure, success } from "@/lib/api";
import { getSettings } from "@/lib/marketing";
import { fetchShootStudioCatalog } from "@/lib/shoot-studio-catalog";

// Exposes the canonical ILARIA Shoot Studio catalog to the client so the post
// editor's product picker stays in sync with the same roster the renderer uses.
// fetchShootStudioCatalog pulls the live catalog from Shoot Studio and falls
// back to the bundled snapshot, so this never returns an empty list.
export async function GET() {
  try {
    const settings = await getSettings();
    const baseUrl = process.env.SHOOT_STUDIO_API_URL ?? settings.localImageEndpoint ?? "";
    const catalog = await fetchShootStudioCatalog(baseUrl);
    return success(catalog);
  } catch (error) {
    return failure(error);
  }
}
