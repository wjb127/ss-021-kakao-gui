import { existsSync, statSync, writeFileSync } from "node:fs";

export interface AttachmentDownloadTask {
  url: string;
  filePath: string;
  expectedSize?: number;
}

export interface AttachmentDownloadResult {
  savedPaths: string[];
  errors: string[];
  totalSize: number;
}

export async function downloadAttachmentTasks(
  tasks: AttachmentDownloadTask[],
  options?: {
    force?: boolean;
    fetcher?: typeof fetch;
  },
): Promise<AttachmentDownloadResult> {
  const fetcher = options?.fetcher ?? fetch;
  const savedPaths: string[] = [];
  const errors: string[] = [];
  let totalSize = 0;

  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index];
    if (!options?.force && existsSync(task.filePath)) {
      savedPaths.push(task.filePath);
      totalSize += statSync(task.filePath).size;
      continue;
    }

    try {
      const response = await fetcher(task.url);
      if (!response.ok) {
        errors.push(`${index + 1}번: CDN 응답 ${response.status}`);
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (task.expectedSize && buffer.length !== task.expectedSize) {
        console.warn(
          `download size mismatch: expected ${task.expectedSize}, got ${buffer.length}`,
        );
      }
      writeFileSync(task.filePath, buffer);
      savedPaths.push(task.filePath);
      totalSize += buffer.length;
    } catch (error) {
      errors.push(
        `${index + 1}번: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return { savedPaths, errors, totalSize };
}
