import fs from "node:fs/promises";
import path from "node:path";

import { loadConfig } from "./config.js";

export type WorklogTemplateMode = "current" | "historical";

export async function loadWorklogTemplate(
  {
    mode,
    startDir = process.cwd(),
  }: {
    mode: WorklogTemplateMode;
    startDir?: string;
  },
) {
  const { templateDir } = loadConfig(startDir);
  const templatePath = path.join(templateDir, `${mode}.md`);
  const template = await fs.readFile(templatePath, "utf8");

  return {
    mode,
    templatePath,
    template,
  };
}
