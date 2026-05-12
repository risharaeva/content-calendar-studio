import { failure, success } from "@/lib/api";
import { createProject, listProjects } from "@/lib/marketing";
import { projectSchema } from "@/lib/schemas";

export async function GET() {
  try {
    const projects = await listProjects();
    return success(projects);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = projectSchema.parse(body);
    const dashboard = await createProject(input);
    return success(dashboard, 201);
  } catch (error) {
    return failure(error);
  }
}
