import { createHash } from "node:crypto";
import { access, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";

export interface HandoverRecord {
  directory: string;
  hasReview: boolean;
  id: string;
  planPath: string;
  status: string;
  title: string;
}

export interface StorageEnvironment {
  AGENT_HANDOVER_DIR?: string;
  HOME?: string;
  XDG_DATA_HOME?: string;
}

export function getStorageRoot(env: StorageEnvironment): string {
  const configured = env.AGENT_HANDOVER_DIR?.trim();
  if (configured) return resolve(expandHome(configured, env.HOME));

  const dataHome = env.XDG_DATA_HOME?.trim();
  if (dataHome)
    return resolve(expandHome(dataHome, env.HOME), "agent-handoffs");

  const home = env.HOME?.trim();
  if (!home) {
    throw new Error(
      "Set HOME, XDG_DATA_HOME, or AGENT_HANDOVER_DIR before using handovers.",
    );
  }

  return join(home, ".local", "share", "agent-handoffs");
}

export function normalizeRemote(remote: string): string | undefined {
  const value = remote.trim();
  if (!value) return undefined;

  const scpMatch = value.match(/^(?:[^@/]+@)?([^:/]+):(.+)$/);
  if (scpMatch && !value.includes("://")) {
    const host = scpMatch[1];
    const remotePath = scpMatch[2];
    if (!host || !remotePath) return undefined;
    return normalizeRemoteParts(host, remotePath);
  }

  try {
    const url = new URL(value.replace(/^git\+/, ""));
    if (!url.hostname) return undefined;
    return normalizeRemoteParts(url.hostname, url.pathname);
  } catch {
    return undefined;
  }
}

export function repositoryId(remote: string, repositoryRoot: string): string {
  const normalized = normalizeRemote(remote);
  if (normalized) return normalized;

  const name = sanitizeSegment(basename(repositoryRoot)) || "repository";
  const pathHash = createHash("sha256")
    .update(resolve(repositoryRoot))
    .digest("hex")
    .slice(0, 8);
  return `local/${name}-${pathHash}`;
}

export function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");

  if (!slug)
    throw new Error("Give the handover a name with letters or numbers.");
  return slug;
}

export function buildHandoverId(now: Date, slug: string): string {
  const iso = now.toISOString();
  const date = iso.slice(0, 10);
  const time = iso.slice(11, 19).replaceAll(":", "");
  return `${date}/${time}-${slugify(slug)}`;
}

export async function reserveHandoverDirectory(
  storageRoot: string,
  repository: string,
  now: Date,
  slug: string,
): Promise<{ directory: string; id: string; planPath: string }> {
  const baseId = buildHandoverId(now, slug);
  const [date, name] = baseId.split("/");
  if (!date || !name) throw new Error("Could not build the handover ID.");

  const dateDirectory = join(storageRoot, ...repository.split("/"), date);
  await mkdir(dateDirectory, { recursive: true });

  for (let suffix = 1; suffix <= 100; suffix += 1) {
    const candidateName = suffix === 1 ? name : `${name}-${suffix}`;
    const directory = join(dateDirectory, candidateName);
    try {
      await mkdir(directory);
      return {
        directory,
        id: `${date}/${candidateName}`,
        planPath: join(directory, "plan.md"),
      };
    } catch (error) {
      if (!isFileExistsError(error)) throw error;
    }
  }

  throw new Error("Could not reserve a unique handover directory.");
}

export async function listHandovers(
  storageRoot: string,
  repository: string,
): Promise<HandoverRecord[]> {
  const repositoryDirectory = join(storageRoot, ...repository.split("/"));
  const dateEntries = await readDirectories(repositoryDirectory);
  const records: HandoverRecord[] = [];

  for (const dateEntry of dateEntries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateEntry)) continue;
    const dateDirectory = join(repositoryDirectory, dateEntry);
    const handoverEntries = await readDirectories(dateDirectory);

    for (const handoverEntry of handoverEntries) {
      const directory = join(dateDirectory, handoverEntry);
      const planPath = join(directory, "plan.md");
      const plan = await readOptionalFile(planPath);
      const result = await readOptionalFile(join(directory, "result.md"));
      const resultStatus = result
        ? readFrontmatterValue(result, "status")
        : undefined;
      const planStatus = plan
        ? readFrontmatterValue(plan, "status")
        : undefined;

      records.push({
        directory,
        hasReview: await pathExists(join(directory, "review.md")),
        id: `${dateEntry}/${handoverEntry}`,
        planPath,
        status:
          resultStatus === "complete"
            ? "done"
            : (resultStatus ?? planStatus ?? "pending"),
        title: plan ? readTitle(plan) : handoverEntry,
      });
    }
  }

  return records.sort((left, right) => right.id.localeCompare(left.id));
}

export async function resolvePlanReference(
  reference: string,
  cwd: string,
  storageRoot: string,
  repository: string,
): Promise<string> {
  const value = reference.trim();
  if (!value) throw new Error("Give a handover ID or plan path.");

  const direct = await resolveDirectPlanPath(value, cwd, process.env.HOME);
  if (direct) return direct;

  const records = await listHandovers(storageRoot, repository);
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  const matches = records.filter(
    (record) =>
      record.id === normalized || basename(record.directory) === normalized,
  );

  if (matches.length === 1) return matches[0]?.planPath as string;
  if (matches.length > 1) {
    throw new Error(`Handover ID "${value}" is not unique. Include its date.`);
  }

  throw new Error(`Could not find handover "${value}" for ${repository}.`);
}

export async function readPlanStatus(
  planPath: string,
): Promise<string | undefined> {
  const content = await readFile(planPath, "utf8");
  return readFrontmatterValue(content, "status");
}

export function formatHandoverList(
  repository: string,
  records: HandoverRecord[],
): string {
  if (records.length === 0) return `No handovers found for ${repository}.`;

  return [
    `Handovers for ${repository}:`,
    ...records.map(
      (record) =>
        `${record.id}  [${record.status}]${record.hasReview ? " [reviewed]" : ""}  ${record.title}\n  ${record.planPath}`,
    ),
  ].join("\n");
}

function normalizeRemoteParts(
  host: string,
  remotePath: string,
): string | undefined {
  const pathWithoutGit = remotePath
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");
  const segments = pathWithoutGit
    .split("/")
    .map(sanitizeSegment)
    .filter((segment) => segment.length > 0);
  const safeHost = sanitizeSegment(host.toLowerCase());
  if (!safeHost || segments.length === 0) return undefined;
  return [safeHost, ...segments].join("/");
}

function sanitizeSegment(value: string): string {
  const segment = value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return segment === "." || segment === ".." ? "_" : segment;
}

function expandHome(value: string, home: string | undefined): string {
  if (value === "~") {
    if (!home)
      throw new Error("HOME is required to expand AGENT_HANDOVER_DIR.");
    return home;
  }
  if (value.startsWith("~/")) {
    if (!home)
      throw new Error("HOME is required to expand AGENT_HANDOVER_DIR.");
    return join(home, value.slice(2));
  }
  return value;
}

async function resolveDirectPlanPath(
  reference: string,
  cwd: string,
  home: string | undefined,
): Promise<string | undefined> {
  const expanded = expandHome(reference, home);
  const candidate = isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
  try {
    const candidateStat = await stat(candidate);
    if (candidateStat.isDirectory()) {
      const planPath = join(candidate, "plan.md");
      return (await pathExists(planPath)) ? planPath : undefined;
    }
    return candidateStat.isFile() ? candidate : undefined;
  } catch {
    return undefined;
  }
}

async function readDirectories(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if (isFileMissingError(error)) return [];
    throw error;
  }
}

async function readOptionalFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isFileMissingError(error)) return undefined;
    throw error;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function readFrontmatterValue(
  content: string,
  key: string,
): string | undefined {
  const frontmatter = content.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/)?.[1];
  if (!frontmatter) return undefined;

  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = frontmatter.match(
    new RegExp(`^${escapedKey}:\\s*(.+?)\\s*$`, "m"),
  );
  return match?.[1]?.trim().replace(/^(["'])(.*)\1$/, "$2");
}

function readTitle(content: string): string {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "Untitled handover";
}

function isFileExistsError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

function isFileMissingError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
