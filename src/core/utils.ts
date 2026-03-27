import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  {
    allowFailure = false,
    env,
  }: {
    allowFailure?: boolean;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });

    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0,
    };
  } catch (error) {
    const commandError = error as NodeJS.ErrnoException & {
      code?: number;
      stdout?: string;
      stderr?: string;
    };

    if (!allowFailure) {
      const stderr = commandError.stderr?.trim();
      throw new Error(stderr || `${command} ${args.join(" ")} failed.`);
    }

    return {
      stdout: commandError.stdout?.trim() ?? "",
      stderr: commandError.stderr?.trim() ?? "",
      exitCode: typeof commandError.code === "number" ? commandError.code : 1,
    };
  }
}

export function truncateText(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;

  const headLength = Math.ceil(maxChars * 0.7);
  const tailLength = Math.floor(maxChars * 0.2);
  const omitted = text.length - headLength - tailLength;

  return [
    text.slice(0, headLength),
    `\n\n... [${omitted} chars omitted] ...\n\n`,
    text.slice(text.length - tailLength),
  ].join("");
}

export function sha256(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function getTimeZoneDateParts(date: Date, timeZone: string) {
  const partEntries = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  })
    .formatToParts(date)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, part.value] as const);

  const parts = Object.fromEntries(partEntries);
  return {
    yyyy: parts.year,
    mm: parts.month,
    dd: parts.day,
    hh: parts.hour,
    min: parts.minute,
  };
}

export function formatDateLabel(date = new Date(), timeZone: string) {
  const { yyyy, mm, dd } = getTimeZoneDateParts(date, timeZone);
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDateTimeLabel(date = new Date(), timeZone: string) {
  const { yyyy, mm, dd, hh, min } = getTimeZoneDateParts(date, timeZone);
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export function assertDateLabel(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("date must use YYYY-MM-DD.");
  }

  return value;
}

export function resolveEntryDateLabel(
  entryDate: string | Date | undefined,
  timeZone: string,
) {
  if (!entryDate) return formatDateLabel(new Date(), timeZone);
  if (entryDate instanceof Date) return formatDateLabel(entryDate, timeZone);

  const trimmed = entryDate.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("entryDate must be YYYY-MM-DD or an ISO datetime.");
  }

  return formatDateLabel(parsed, timeZone);
}

export function toTextToolResult<T extends object>(
  text: string,
  structuredContent: T,
) {
  return {
    content: [{ type: "text" as const, text }],
    structuredContent,
  };
}

export function toErrorToolResult<T extends object>(
  message: string,
  structuredContent: T,
) {
  return {
    content: [{ type: "text" as const, text: message }],
    structuredContent,
    isError: true,
  };
}
