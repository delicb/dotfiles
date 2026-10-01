import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ThemeAppearance } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";

/** Format patches with delta without blocking the terminal. */
export class DeltaRenderer {
  public static isSideBySide(width: number): boolean {
    return width >= 100;
  }

  public constructor(exec: ExtensionAPI["exec"]) {
    this.exec = exec;
  }

  public get(patch: string, options: DeltaOptions): string | undefined {
    if (this.closed || options.width < 20 || Buffer.byteLength(patch) > MAX_INPUT_BYTES) {
      return undefined;
    }
    const key = `${options.appearance}:${options.width}:${patch}`;
    const cached = this.cache.get(key);
    if (cached) {
      if (cached.pending) {
        cached.listeners.set(options.toolCallId, options.invalidate);
      }
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.output;
    }
    if (this.tasks.size >= MAX_PENDING) {
      return undefined;
    }
    const entry: CacheEntry = {
      pending: true,
      listeners: new Map([[options.toolCallId, options.invalidate]]),
    };
    this.cache.set(key, entry);
    const task = this.format(patch, options)
      .then((output) => {
        entry.pending = false;
        entry.output = output;
        if (!this.closed && output !== undefined) {
          for (const invalidate of entry.listeners.values()) {
            invalidate();
          }
        }
        entry.listeners.clear();
        this.trimCache();
      })
      .finally(() => {
        this.tasks.delete(task);
      });
    this.tasks.add(task);
    return undefined;
  }

  public async dispose(): Promise<void> {
    this.closed = true;
    this.controller.abort();
    await Promise.allSettled(this.tasks);
    this.cache.clear();
  }

  private readonly exec: ExtensionAPI["exec"];
  private readonly controller = new AbortController();
  private readonly cache = new Map<string, CacheEntry>();
  private readonly tasks = new Set<Promise<void>>();
  private readonly queue: Array<() => void> = [];
  private available?: Promise<boolean>;
  private running = 0;
  private closed = false;

  private async format(patch: string, options: DeltaOptions): Promise<string | undefined> {
    this.available ??= this.checkAvailability();
    if (!(await this.available) || this.closed) {
      return undefined;
    }
    await this.acquire();
    let directory: string | undefined;
    try {
      if (this.closed) {
        return undefined;
      }
      directory = await mkdtemp(join(tmpdir(), "pi-compact-delta-"));
      const path = join(directory, "diff.patch");
      await writeFile(path, patch, { mode: 0o600 });
      if (this.closed) {
        return undefined;
      }
      // Pi's exec API has no stdin option. Pass the private patch file through shell arguments.
      const result = await this.exec(
        "sh",
        [
          "-c",
          'exec delta "$@" < "$0"',
          path,
          "--paging=never",
          "--no-gitconfig",
          "--features=",
          "--line-numbers",
          "--keep-plus-minus-markers",
          "--max-line-distance=1.0",
          "--file-decoration-style=none",
          "--hunk-header-decoration-style=none",
          "--true-color=always",
          ...(DeltaRenderer.isSideBySide(options.width) ? ["--side-by-side"] : []),
          `--width=${options.width}`,
          `--${options.appearance}`,
        ],
        { signal: this.controller.signal, timeout: 2000 },
      );
      if (
        result.code !== 0 ||
        result.killed ||
        Buffer.byteLength(result.stdout) > MAX_OUTPUT_BYTES
      ) {
        return undefined;
      }
      const output = safeColors(result.stdout);
      const plain = stripTerminalSequences(output);
      return /\d+\s*[⋮│]/.test(plain) ? output : undefined;
    } catch {
      return undefined;
    } finally {
      if (directory) {
        await rm(directory, { recursive: true, force: true }).catch(() => {});
      }
      this.release();
    }
  }

  private async checkAvailability(): Promise<boolean> {
    try {
      const result = await this.exec("delta", ["--version"], {
        signal: this.controller.signal,
        timeout: 1000,
      });
      return result.code === 0 && !result.killed;
    } catch {
      return false;
    }
  }

  private async acquire(): Promise<void> {
    if (this.running < 2) {
      this.running++;
    } else {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.running--;
    }
  }

  private trimCache(): void {
    let completed = [...this.cache.values()].filter((entry) => !entry.pending).length;
    for (const [key, entry] of this.cache) {
      if (completed <= MAX_CACHED) {
        break;
      }
      if (!entry.pending) {
        this.cache.delete(key);
        completed--;
      }
    }
  }
}

type DeltaOptions = {
  width: number;
  appearance: ThemeAppearance;
  toolCallId: string;
  invalidate: () => void;
};
type CacheEntry = {
  pending: boolean;
  output?: string;
  listeners: Map<string, () => void>;
};

const MAX_INPUT_BYTES = 128 * 1024;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_CACHED = 32;
const MAX_PENDING = 64;

function safeColors(text: string): string {
  return text
    .split(/(\x1b\[[\d;]*m)/)
    .map((part) => {
      if (/^\x1b\[[\d;]*m$/.test(part)) {
        return part;
      }
      return stripTerminalSequences(part)
        .replace(/\r\n?/g, "\n")
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
    })
    .join("");
}
