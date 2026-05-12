import { failure, success } from "@/lib/api";
import { saveSettings } from "@/lib/marketing";
import { settingsSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = settingsSchema.parse(body);
    const settings = await saveSettings(input);
    return success(settings);
  } catch (error) {
    return failure(error);
  }
}
