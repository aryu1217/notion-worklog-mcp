import { loadConfig } from "./config.js";
import {
  assertDateLabel,
  formatDateLabel,
  formatDateTimeLabel,
  runCommand,
  truncateText,
} from "./utils.js";

export type GitCommit = {
  sha: string;
  shortSha: string;
  author: string;
  date: string;
  subject: string;
};

export type GitFileChange = {
  status: string;
  path: string;
  nextPath?: string;
};

export type GitStatusEntry = {
  code: string;
  path: string;
};

export type CurrentWorkContext = {
  mode: "current";
  repoRoot: string;
  branchName: string;
  headSha: string;
  headShortSha: string;
  baseRef: string | null;
  mergeBase: string;
  defaultHeading: string;
  commits: GitCommit[];
  statusEntries: GitStatusEntry[];
  committedFiles: GitFileChange[];
  stagedFiles: GitFileChange[];
  unstagedFiles: GitFileChange[];
  untrackedFiles: string[];
  changedFiles: string[];
  committedDiffStat: string;
  stagedDiffStat: string;
  unstagedDiffStat: string;
  committedDiffExcerpt: string;
  stagedDiffExcerpt: string;
  unstagedDiffExcerpt: string;
};

export type HistoricalWorkContext = {
  mode: "historical_date" | "historical_commit";
  repoRoot: string;
  branchName: string;
  referenceDate: string;
  referenceCommit: string | null;
  defaultHeading: string;
  commits: GitCommit[];
  totalCommits: number;
  changedFiles: string[];
  historicalFiles: GitFileChange[];
  diffStat: string;
  diffExcerpt: string;
  details: string;
};

const DEFAULT_BASE_REF_CANDIDATES = [
  "origin/main",
  "main",
  "origin/master",
  "master",
];

function parseCommitLines(stdout: string) {
  if (!stdout) return [] as GitCommit[];

  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, shortSha, author, date, subject] = line.split("\u001f");
      return { sha, shortSha, author, date, subject };
    });
}

function parseNameStatus(stdout: string) {
  if (!stdout) return [] as GitFileChange[];

  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, path, nextPath] = line.split("\t");
      return {
        status,
        path,
        nextPath,
      };
    });
}

function parseStatusEntries(stdout: string) {
  if (!stdout) return [] as GitStatusEntry[];

  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const trimmed = line.trimStart();
      const match = trimmed.match(/^(\S+)\s+(.*)$/);

      if (!match) {
        return {
          code: "??",
          path: trimmed,
        };
      }

      return {
        code: match[1] || "??",
        path: match[2].trim(),
      };
    });
}

function buildChangedFiles(
  committedFiles: GitFileChange[],
  stagedFiles: GitFileChange[],
  unstagedFiles: GitFileChange[],
  untrackedFiles: string[],
) {
  return Array.from(
    new Set([
      ...committedFiles.flatMap((file) =>
        file.nextPath ? [file.path, file.nextPath] : [file.path],
      ),
      ...stagedFiles.flatMap((file) =>
        file.nextPath ? [file.path, file.nextPath] : [file.path],
      ),
      ...unstagedFiles.flatMap((file) =>
        file.nextPath ? [file.path, file.nextPath] : [file.path],
      ),
      ...untrackedFiles,
    ]),
  ).sort();
}

function buildHistoricalChangedFiles(historicalFiles: GitFileChange[]) {
  return Array.from(
    new Set(
      historicalFiles.flatMap((file) =>
        file.nextPath ? [file.path, file.nextPath] : [file.path],
      ),
    ),
  ).sort();
}

function buildCurrentWorkContextText(context: CurrentWorkContext) {
  const commits =
    context.commits.length > 0
      ? context.commits
          .map((commit) => `- ${commit.shortSha} ${commit.subject}`)
          .join("\n")
      : "- No committed changes since merge-base";

  const changedFiles =
    context.changedFiles.length > 0
      ? context.changedFiles.map((file) => `- ${file}`).join("\n")
      : "- No changed files";

  const sections = [
    `Mode: ${context.mode}`,
    `Branch: ${context.branchName}`,
    `HEAD: ${context.headShortSha}`,
    `Base ref: ${context.baseRef ?? "N/A"}`,
    `Merge base: ${context.mergeBase}`,
    `Default heading: ${context.defaultHeading}`,
    "",
    "[Commits]",
    commits,
    "",
    "[Changed Files]",
    changedFiles,
  ];

  if (context.committedDiffStat) {
    sections.push("", "[Committed Diff Stat]", context.committedDiffStat);
  }

  if (context.stagedDiffStat) {
    sections.push("", "[Staged Diff Stat]", context.stagedDiffStat);
  }

  if (context.unstagedDiffStat) {
    sections.push("", "[Unstaged Diff Stat]", context.unstagedDiffStat);
  }

  if (context.committedDiffExcerpt) {
    sections.push("", "[Committed Diff Excerpt]", context.committedDiffExcerpt);
  }

  if (context.stagedDiffExcerpt) {
    sections.push("", "[Staged Diff Excerpt]", context.stagedDiffExcerpt);
  }

  if (context.unstagedDiffExcerpt) {
    sections.push("", "[Unstaged Diff Excerpt]", context.unstagedDiffExcerpt);
  }

  return sections.join("\n");
}

function buildHistoricalWorkContextText(context: HistoricalWorkContext) {
  const commits = context.commits
    .map((commit) => `- ${commit.shortSha} ${commit.subject}`)
    .join("\n");

  const changedFiles =
    context.changedFiles.length > 0
      ? context.changedFiles.map((file) => `- ${file}`).join("\n")
      : "- No changed files";

  return [
    `Mode: ${context.mode}`,
    `Branch: ${context.branchName}`,
    `Reference date: ${context.referenceDate}`,
    `Reference commit: ${context.referenceCommit ?? "N/A"}`,
    `Total commits: ${context.totalCommits}`,
    `Default heading: ${context.defaultHeading}`,
    `Details: ${context.details}`,
    "",
    "[Commits]",
    commits,
    "",
    "[Changed Files]",
    changedFiles,
    "",
    "[Diff Stat]",
    context.diffStat || "N/A",
    "",
    "[Diff Excerpt]",
    context.diffExcerpt || "N/A",
  ].join("\n");
}

async function runGit(
  args: string[],
  {
    startDir = process.cwd(),
    allowFailure = false,
    env,
  }: {
    startDir?: string;
    allowFailure?: boolean;
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  const { workspaceRoot } = loadConfig(startDir);
  return runCommand("git", args, workspaceRoot, { allowFailure, env });
}

async function getCurrentBranch(startDir = process.cwd()) {
  const { stdout } = await runGit(["branch", "--show-current"], {
    startDir,
    allowFailure: true,
  });

  if (stdout) return stdout;

  const head = await runGit(["rev-parse", "--short", "HEAD"], { startDir });
  return `detached-${head.stdout}`;
}

async function getDefaultBaseRef(startDir = process.cwd()) {
  const originHead = await runGit(
    ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"],
    { startDir, allowFailure: true },
  );

  if (originHead.stdout) return originHead.stdout;

  for (const candidate of DEFAULT_BASE_REF_CANDIDATES) {
    const exists = await runGit(["rev-parse", "--verify", "--quiet", candidate], {
      startDir,
      allowFailure: true,
    });

    if (exists.exitCode === 0) return candidate;
  }

  return null;
}

async function getMergeBase(
  baseRef: string | null,
  headSha: string,
  startDir = process.cwd(),
) {
  if (baseRef) {
    const mergeBase = await runGit(["merge-base", "HEAD", baseRef], {
      startDir,
      allowFailure: true,
    });
    if (mergeBase.stdout) return mergeBase.stdout;
  }

  const rootCommit = await runGit(["rev-list", "--max-parents=0", "HEAD"], {
    startDir,
    allowFailure: true,
  });

  return rootCommit.stdout.split("\n").filter(Boolean).at(0) ?? headSha;
}

async function resolveCommit(ref: string, startDir = process.cwd()) {
  const result = await runGit(["rev-parse", ref], { startDir, allowFailure: true });
  if (result.exitCode !== 0 || !result.stdout) {
    throw new Error(`Could not resolve commit reference: ${ref}`);
  }

  return result.stdout;
}

async function getCommitDetails(sha: string, startDir = process.cwd()) {
  const stdout = (
    await runGit(
      [
        "log",
        "-1",
        "--format=%H%x1f%h%x1f%an%x1f%ad%x1f%s",
        "--date=iso-strict",
        sha,
      ],
      { startDir },
    )
  ).stdout;

  const [commit] = parseCommitLines(stdout);
  if (!commit) {
    throw new Error(`Could not load commit details for ${sha}.`);
  }

  return commit;
}

export async function inspectGitWorkspace(startDir = process.cwd()) {
  const { workspaceRoot } = loadConfig(startDir);
  const gitDir = await runGit(["rev-parse", "--git-dir"], {
    startDir,
    allowFailure: true,
  });
  const branchName = await getCurrentBranch(startDir);
  const headSha = (await runGit(["rev-parse", "HEAD"], { startDir })).stdout;
  const baseRef = await getDefaultBaseRef(startDir);
  const mergeBase = await getMergeBase(baseRef, headSha, startDir);

  return {
    repoRoot: workspaceRoot,
    gitDir: gitDir.stdout || null,
    branchName,
    headSha,
    headShortSha: headSha.slice(0, 7),
    baseRef,
    mergeBase,
  };
}

export async function collectCurrentWorkContext(
  {
    maxCommits = 20,
    maxDiffChars = 12000,
    startDir = process.cwd(),
  }: {
    maxCommits?: number;
    maxDiffChars?: number;
    startDir?: string;
  } = {},
) {
  const { workspaceRoot, timeZone } = loadConfig(startDir);
  const branchName = await getCurrentBranch(startDir);
  const headSha = (await runGit(["rev-parse", "HEAD"], { startDir })).stdout;
  const baseRef = await getDefaultBaseRef(startDir);
  const mergeBase = await getMergeBase(baseRef, headSha, startDir);

  const commitsRange =
    mergeBase === headSha ? "" : `${mergeBase.trim()}..${headSha.trim()}`;

  const commits = commitsRange
    ? parseCommitLines(
        (
          await runGit(
            [
              "log",
              "--format=%H%x1f%h%x1f%an%x1f%ad%x1f%s",
              "--date=iso-strict",
              "--reverse",
              `--max-count=${Math.max(1, maxCommits)}`,
              commitsRange,
            ],
            { startDir },
          )
        ).stdout,
      )
    : [];

  const statusEntries = parseStatusEntries(
    (await runGit(["status", "--short"], { startDir })).stdout,
  );
  const committedFiles = commitsRange
    ? parseNameStatus(
        (await runGit(["diff", "--name-status", commitsRange], { startDir })).stdout,
      )
    : [];
  const stagedFiles = parseNameStatus(
    (await runGit(["diff", "--name-status", "--cached"], { startDir })).stdout,
  );
  const unstagedFiles = parseNameStatus(
    (await runGit(["diff", "--name-status"], { startDir })).stdout,
  );
  const untrackedFiles = statusEntries
    .filter((entry) => entry.code === "??")
    .map((entry) => entry.path);

  const committedDiffStat = commitsRange
    ? (await runGit(["diff", "--stat", commitsRange], { startDir })).stdout
    : "";
  const stagedDiffStat = (await runGit(["diff", "--stat", "--cached"], { startDir }))
    .stdout;
  const unstagedDiffStat = (await runGit(["diff", "--stat"], { startDir })).stdout;

  const committedDiffExcerpt = commitsRange
    ? truncateText(
        (
          await runGit(["diff", "--no-ext-diff", "--unified=3", commitsRange], {
            startDir,
          })
        ).stdout,
        maxDiffChars,
      )
    : "";
  const stagedDiffExcerpt = truncateText(
    (
      await runGit(["diff", "--no-ext-diff", "--unified=3", "--cached"], {
        startDir,
      })
    ).stdout,
    maxDiffChars,
  );
  const unstagedDiffExcerpt = truncateText(
    (await runGit(["diff", "--no-ext-diff", "--unified=3"], { startDir })).stdout,
    maxDiffChars,
  );

  const workContext: CurrentWorkContext = {
    mode: "current",
    repoRoot: workspaceRoot,
    branchName,
    headSha,
    headShortSha: headSha.slice(0, 7),
    baseRef,
    mergeBase,
    defaultHeading: `## ${formatDateTimeLabel(new Date(), timeZone)} | ${branchName} | ${headSha.slice(0, 7)}`,
    commits,
    statusEntries,
    committedFiles,
    stagedFiles,
    unstagedFiles,
    untrackedFiles,
    changedFiles: buildChangedFiles(
      committedFiles,
      stagedFiles,
      unstagedFiles,
      untrackedFiles,
    ),
    committedDiffStat,
    stagedDiffStat,
    unstagedDiffStat,
    committedDiffExcerpt,
    stagedDiffExcerpt,
    unstagedDiffExcerpt,
  };

  return {
    workContext,
    text: buildCurrentWorkContextText(workContext),
  };
}

export async function collectHistoricalWorkContext(
  {
    date,
    commit,
    maxCommits = 50,
    maxDiffChars = 12000,
    startDir = process.cwd(),
  }: {
    date?: string;
    commit?: string;
    maxCommits?: number;
    maxDiffChars?: number;
    startDir?: string;
  },
) {
  if (!date && !commit) {
    throw new Error("Provide either date or commit.");
  }

  if (date && commit) {
    throw new Error("Provide only one of date or commit.");
  }

  return date
    ? collectHistoricalDateContext({ date, maxCommits, maxDiffChars, startDir })
    : collectHistoricalCommitContext({
        commit: commit as string,
        maxDiffChars,
        startDir,
      });
}

async function collectHistoricalCommitContext(
  {
    commit,
    maxDiffChars,
    startDir,
  }: {
    commit: string;
    maxDiffChars: number;
    startDir: string;
  },
) {
  const { workspaceRoot, timeZone } = loadConfig(startDir);
  const branchName = await getCurrentBranch(startDir);
  const resolvedCommit = await resolveCommit(commit, startDir);
  const commitDetails = await getCommitDetails(resolvedCommit, startDir);

  const historicalFiles = parseNameStatus(
    (await runGit(["show", "--name-status", "--format=", resolvedCommit], { startDir }))
      .stdout,
  );
  const diffStat = (
    await runGit(["show", "--stat", "--format=-- %h %s", resolvedCommit], {
      startDir,
    })
  ).stdout;
  const diffExcerpt = truncateText(
    (
      await runGit(
        ["show", "--no-ext-diff", "--unified=3", "--format=-- %h %s", resolvedCommit],
        { startDir },
      )
    ).stdout,
    maxDiffChars,
  );

  const referenceDate = formatDateLabel(new Date(commitDetails.date), timeZone);
  const defaultHeading = `## ${formatDateTimeLabel(
    new Date(commitDetails.date),
    timeZone,
  )} | commit | ${commitDetails.shortSha}`;

  const workContext: HistoricalWorkContext = {
    mode: "historical_commit",
    repoRoot: workspaceRoot,
    branchName,
    referenceDate,
    referenceCommit: commitDetails.sha,
    defaultHeading,
    commits: [commitDetails],
    totalCommits: 1,
    changedFiles: buildHistoricalChangedFiles(historicalFiles),
    historicalFiles,
    diffStat,
    diffExcerpt,
    details: `Collected a historical worklog snapshot from commit ${commitDetails.shortSha}.`,
  };

  return {
    workContext,
    text: buildHistoricalWorkContextText(workContext),
  };
}

async function collectHistoricalDateContext(
  {
    date,
    maxCommits,
    maxDiffChars,
    startDir,
  }: {
    date: string;
    maxCommits: number;
    maxDiffChars: number;
    startDir: string;
  },
) {
  const { workspaceRoot, timeZone } = loadConfig(startDir);
  const branchName = await getCurrentBranch(startDir);
  const dateLabel = assertDateLabel(date);

  const allCommits = parseCommitLines(
    (
      await runGit(
        [
          "log",
          "--format=%H%x1f%h%x1f%an%x1f%ad%x1f%s",
          "--date=iso-strict",
          "--reverse",
          `--since=${dateLabel} 00:00:00`,
          `--until=${dateLabel} 23:59:59`,
        ],
        {
          startDir,
          env: { TZ: timeZone },
        },
      )
    ).stdout,
  );

  if (allCommits.length === 0) {
    throw new Error(`No commits were found on ${dateLabel}.`);
  }

  const displayCommits = allCommits.slice(0, Math.max(1, maxCommits));
  const commitShas = allCommits.map((entry) => entry.sha);

  const historicalFiles = parseNameStatus(
    (
      await runGit(["show", "--name-status", "--format=", ...commitShas], {
        startDir,
      })
    ).stdout,
  );
  const diffStat = truncateText(
    (
      await runGit(["show", "--stat", "--format=-- %h %s", ...commitShas], {
        startDir,
      })
    ).stdout,
    Math.max(4000, maxDiffChars),
  );
  const diffExcerpt = truncateText(
    (
      await runGit(
        ["show", "--no-ext-diff", "--unified=3", "--format=-- %h %s", ...commitShas],
        { startDir },
      )
    ).stdout,
    maxDiffChars,
  );

  const oldest = allCommits[0];
  const latest = allCommits.at(-1) as GitCommit;
  const defaultHeading = `## ${dateLabel} | date-summary | ${oldest.shortSha}..${latest.shortSha}`;
  const details =
    displayCommits.length === allCommits.length
      ? `Collected ${allCommits.length} commits from ${dateLabel}.`
      : `Collected ${allCommits.length} commits from ${dateLabel}; showing the first ${displayCommits.length} in the commit list.`;

  const workContext: HistoricalWorkContext = {
    mode: "historical_date",
    repoRoot: workspaceRoot,
    branchName,
    referenceDate: dateLabel,
    referenceCommit: latest.sha,
    defaultHeading,
    commits: displayCommits,
    totalCommits: allCommits.length,
    changedFiles: buildHistoricalChangedFiles(historicalFiles),
    historicalFiles,
    diffStat,
    diffExcerpt,
    details,
  };

  return {
    workContext,
    text: buildHistoricalWorkContextText(workContext),
  };
}
