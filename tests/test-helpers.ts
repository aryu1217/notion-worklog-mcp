import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function run(
  cwd: string,
  command: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
) {
  await execFileAsync(command, args, {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    encoding: "utf8",
  });
}

export async function createFixtureRepo() {
  const root = await mkdtemp(path.join(os.tmpdir(), "notion-worklog-mcp-"));

  await run(root, "git", ["init", "-b", "main"]);
  await run(root, "git", ["config", "user.name", "Fixture User"]);
  await run(root, "git", ["config", "user.email", "fixture@example.com"]);

  await mkdir(path.join(root, "src"), { recursive: true });

  await writeFile(path.join(root, "src", "index.ts"), "export const value = 1;\n");
  await run(root, "git", ["add", "."]);
  await run(
    root,
    "git",
    ["commit", "-m", "feat: initial worklog fixture"],
    {
      GIT_AUTHOR_DATE: "2026-01-10T10:00:00+09:00",
      GIT_COMMITTER_DATE: "2026-01-10T10:00:00+09:00",
    },
  );

  await writeFile(
    path.join(root, "src", "index.ts"),
    "export const value = 2;\nexport const label = 'prefetch';\n",
  );
  await run(root, "git", ["add", "."]);
  await run(
    root,
    "git",
    ["commit", "-m", "feat: add route prefetch support"],
    {
      GIT_AUTHOR_DATE: "2026-02-11T12:08:38+09:00",
      GIT_COMMITTER_DATE: "2026-02-11T12:08:38+09:00",
    },
  );

  await writeFile(
    path.join(root, "src", "ui.ts"),
    "export const theme = 'glass';\n",
  );
  await run(root, "git", ["add", "."]);
  await run(
    root,
    "git",
    ["commit", "-m", "feat: apply glass ui refresh"],
    {
      GIT_AUTHOR_DATE: "2026-02-18T11:08:46+09:00",
      GIT_COMMITTER_DATE: "2026-02-18T11:08:46+09:00",
    },
  );

  await writeFile(
    path.join(root, "src", "ui.ts"),
    "export const theme = 'glass';\nexport const animates = true;\n",
  );
  await writeFile(path.join(root, "README.md"), "# fixture\n");

  const headSha = (
    await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    })
  ).stdout.trim();

  const prefetchSha = (
    await execFileAsync("git", ["rev-parse", "HEAD~1"], {
      cwd: root,
      encoding: "utf8",
    })
  ).stdout.trim();

  return {
    root,
    headSha,
    prefetchSha,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}
