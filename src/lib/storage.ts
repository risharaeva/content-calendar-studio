import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const generatedDir = path.join(process.cwd(), "public", "generated");

export async function saveBase64Image({
  base64,
  fileName,
}: {
  base64: string;
  fileName: string;
}) {
  await mkdir(generatedDir, { recursive: true });

  const absolutePath = path.join(generatedDir, fileName);
  await writeFile(absolutePath, Buffer.from(base64, "base64"));

  return `/generated/${fileName}`;
}
