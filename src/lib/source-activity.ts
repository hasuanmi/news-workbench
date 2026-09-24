import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { summarizeSourceActivity, type SourceActivityRun } from "./source-policy";

export async function getSourceDailyActivity() {
  const runs: SourceActivityRun[] = [];
  const folder = path.join(process.cwd(), "logs", "scheduler");
  const names = await readdir(folder).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  for (const name of names.filter(n => /^[a-f0-9-]{36}\.json$/.test(n))) {
    runs.push(JSON.parse(await readFile(path.join(folder, name), "utf8")));
  }
  return summarizeSourceActivity(runs);
}
