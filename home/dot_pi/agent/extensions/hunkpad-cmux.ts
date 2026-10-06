import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

const ENTRY_TYPE = 'hunkpad-cmux-viewer';
const STATUS_KEY = 'hunkpad-cmux';
const COMMAND_TIMEOUT_MS = 10_000;

interface ActiveTurn {
  root: string;
  sessionId: string;
  turnId: string;
}

interface ViewerState {
  root: string;
  surfaceId?: string;
  url?: string;
}

const MISSING_FILE = Symbol('missing-file');
type FileFingerprint = string | typeof MISSING_FILE;

interface PendingWrite {
  before: FileFingerprint;
  path: string;
  root: string;
}

function inCmux(): boolean {
  return Boolean(
    process.env.CMUX_SURFACE_ID ||
    process.env.CMUX_WORKSPACE_ID ||
    process.env.CMUX_SOCKET ||
    process.env.CMUX_SOCKET_PATH,
  );
}

function cleanError(value: string): string {
  const text = value.trim().replace(/\s+/g, ' ');
  return text.length > 400 ? `${text.slice(0, 400)}...` : text;
}

function findString(value: unknown, keys: Set<string>, depth = 0): string | undefined {
  if (!value || typeof value !== 'object' || depth > 5) return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findString(item, keys, depth + 1);
      if (match) return match;
    }
    return undefined;
  }

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (keys.has(key) && typeof item === 'string' && item.trim()) return item.trim();
    const match = findString(item, keys, depth + 1);
    if (match) return match;
  }
  return undefined;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function normalizeTTY(value: string): string | undefined {
  const tty = value.trim().replace(/^\/dev\//u, '');
  return tty && tty !== '?' && tty !== '??' && tty !== '-' ? tty : undefined;
}

function findSurfaceTTY(value: unknown, surfaceId: string, depth = 0): string | undefined {
  if (!value || typeof value !== 'object' || depth > 10) return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findSurfaceTTY(item, surfaceId, depth + 1);
      if (match) return match;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (
    (record.id === surfaceId || record.surface_id === surfaceId) &&
    typeof record.tty === 'string'
  ) {
    return normalizeTTY(record.tty);
  }

  for (const item of Object.values(record)) {
    const match = findSurfaceTTY(item, surfaceId, depth + 1);
    if (match) return match;
  }
  return undefined;
}

function hunkpadUrl(output: string): string | undefined {
  for (const line of output.split(/\r?\n/u)) {
    const candidate = line.trim();
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (
        url.protocol === 'http:' &&
        url.hostname === '127.0.0.1' &&
        /^\/s\/[^/]+\/$/u.test(url.pathname)
      ) {
        return url.toString();
      }
    } catch {}
  }
  return undefined;
}

function isHunkpadUrl(value: string): boolean {
  return hunkpadUrl(value) !== undefined;
}

function repositoryWritePath(
  toolName: string,
  input: Record<string, unknown>,
  cwd: string,
  root: string,
): string | undefined {
  if (toolName !== 'edit' && toolName !== 'write') return undefined;
  if (typeof input.path !== 'string') return undefined;

  const path = input.path.startsWith('@') ? input.path.slice(1) : input.path;
  if (!path) return undefined;

  const target = resolve(cwd, path);
  const fromRoot = relative(root, target);
  if (fromRoot === '') return target;
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    return undefined;
  }
  return target;
}

async function fileFingerprint(path: string): Promise<FileFingerprint | undefined> {
  const hash = createHash('sha256');
  try {
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest('hex');
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return MISSING_FILE;
    }
    return undefined;
  }
}

function restoreViewer(ctx: ExtensionContext): ViewerState | undefined {
  const entries = ctx.sessionManager.getBranch();
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.type !== 'custom' || entry.customType !== ENTRY_TYPE) continue;
    const data = entry.data as { root?: unknown; surfaceId?: unknown } | undefined;
    if (typeof data?.root !== 'string') continue;
    return {
      root: data.root,
      surfaceId: typeof data.surfaceId === 'string' ? data.surfaceId : undefined,
    };
  }
  return undefined;
}

export default function hunkpadCmuxExtension(pi: ExtensionAPI): void {
  if (!inCmux()) return;

  let activeTurn: ActiveTurn | undefined;
  let viewer: ViewerState | undefined;
  let viewerOpening: Promise<void> | undefined;
  const pendingWrites = new Map<string, PendingWrite>();
  let directCmuxProcess: Promise<boolean> | undefined;
  let implementationNoteToolRegistered = false;
  let warnedHunkpad = false;
  let warnedCmux = false;

  const registerImplementationNoteTool = (): void => {
    if (implementationNoteToolRegistered) return;
    implementationNoteToolRegistered = true;
    pi.registerTool({
      name: 'hunkpad_implementation_note',
      label: 'Hunkpad implementation note',
      description:
        'Set or replace the short author context shown with the current Hunkpad Last turn diff. Use only for a non-obvious constraint, choice, risk, or trade-off. Do not restate the diff or include private chain-of-thought.',
      promptSnippet:
        'Attach short author context to the current Hunkpad Last turn diff when a non-obvious choice needs review context',
      promptGuidelines: [
        'Use hunkpad_implementation_note only for a non-obvious constraint, choice, risk, or trade-off in the current implementation. Keep it under 600 characters, do not restate the diff, do not list routine tests, and do not include private chain-of-thought.',
      ],
      parameters: Type.Object({
        body: Type.String({
          minLength: 1,
          maxLength: 600,
          description: 'One short implementation note. Markdown is allowed.',
        }),
        paths: Type.Optional(
          Type.Array(Type.String({ minLength: 1 }), {
            maxItems: 20,
            description: 'Current changed file paths related to the note.',
          }),
        ),
      }),
      async execute(_toolCallId, params, signal, _onUpdate, ctx) {
        if (!(await ownsCmuxSurface(ctx.cwd))) {
          return {
            content: [
              {
                type: 'text',
                text: 'Only the Pi session that owns the cmux terminal surface can publish an implementation note.',
              },
            ],
            isError: true,
            details: { error: 'not_surface_owner' },
          };
        }
        const turn = activeTurn;
        if (!turn) {
          return {
            content: [
              {
                type: 'text',
                text: 'No active Hunkpad turn is available for an implementation note.',
              },
            ],
            isError: true,
            details: { error: 'no_active_turn' },
          };
        }
        const result = await pi.exec(
          'hunkpad',
          [
            'note',
            'set',
            '--session',
            turn.sessionId,
            '--turn',
            turn.turnId,
            '--body',
            params.body,
            ...(params.paths ?? []).flatMap((path) => ['--path', path]),
            '--root',
            turn.root,
          ],
          { cwd: turn.root, timeout: COMMAND_TIMEOUT_MS, signal },
        );
        if (result.code !== 0) {
          return {
            content: [
              {
                type: 'text',
                text: cleanError(
                  result.stderr || `hunkpad note set exited with code ${result.code}`,
                ),
              },
            ],
            isError: true,
            details: { error: 'note_failed' },
          };
        }
        return {
          content: [{ type: 'text', text: 'Published the Hunkpad implementation note.' }],
          details: { root: turn.root, paths: params.paths ?? [] },
        };
      },
    });
  };

  const notifyFailure = (
    ctx: ExtensionContext,
    kind: 'hunkpad' | 'cmux',
    message: string,
  ): void => {
    if (kind === 'hunkpad') {
      if (warnedHunkpad) return;
      warnedHunkpad = true;
    } else {
      if (warnedCmux) return;
      warnedCmux = true;
    }
    ctx.ui.notify(`${kind}: ${cleanError(message)}`, 'warning');
  };

  const ownsCmuxSurface = async (cwd: string): Promise<boolean> => {
    if (directCmuxProcess) return directCmuxProcess;

    directCmuxProcess = (async () => {
      const surfaceId = process.env.CMUX_SURFACE_ID;
      const workspaceId = process.env.CMUX_WORKSPACE_ID;
      if (!surfaceId || !workspaceId) return false;

      try {
        const [processResult, treeResult] = await Promise.all([
          pi.exec('ps', ['-o', 'tty=', '-p', String(process.pid)], {
            cwd,
            timeout: COMMAND_TIMEOUT_MS,
          }),
          pi.exec('cmux', ['--id-format', 'both', 'tree', '--workspace', workspaceId, '--json'], {
            cwd,
            timeout: COMMAND_TIMEOUT_MS,
          }),
        ]);
        if (processResult.code !== 0 || treeResult.code !== 0) return false;

        const processTTY = normalizeTTY(processResult.stdout);
        const surfaceTTY = findSurfaceTTY(parseJson(treeResult.stdout), surfaceId);
        return Boolean(processTTY && surfaceTTY && processTTY === surfaceTTY);
      } catch {
        return false;
      }
    })();

    return directCmuxProcess;
  };

  const resolveRoot = async (cwd: string): Promise<string | undefined> => {
    const probes: Array<[string, string[]]> = [
      ['git', ['rev-parse', '--show-toplevel']],
      ['jj', ['root']],
    ];
    for (const [command, args] of probes) {
      try {
        const result = await pi.exec(command, args, { cwd, timeout: COMMAND_TIMEOUT_MS });
        const root = result.stdout.trim();
        if (result.code === 0 && root) return root;
      } catch {}
    }
    return undefined;
  };

  const endActiveTurn = async (ctx: ExtensionContext): Promise<void> => {
    const turn = activeTurn;
    if (!turn) return;
    activeTurn = undefined;
    pendingWrites.clear();
    ctx.ui.setStatus(STATUS_KEY, 'Hunkpad');

    try {
      const result = await pi.exec(
        'hunkpad',
        ['turn', 'end', '--session', turn.sessionId, '--turn', turn.turnId, '--root', turn.root],
        { cwd: turn.root, timeout: COMMAND_TIMEOUT_MS },
      );
      if (result.code !== 0) {
        notifyFailure(ctx, 'hunkpad', result.stderr || `turn end exited with code ${result.code}`);
      }
    } catch (error) {
      notifyFailure(ctx, 'hunkpad', error instanceof Error ? error.message : String(error));
    }
  };

  const resolveWorkspace = async (cwd: string): Promise<string | undefined> => {
    if (process.env.CMUX_WORKSPACE_ID) return process.env.CMUX_WORKSPACE_ID;
    try {
      const result = await pi.exec('cmux', ['identify', '--json'], {
        cwd,
        timeout: COMMAND_TIMEOUT_MS,
      });
      if (result.code !== 0) return undefined;
      return findString(
        parseJson(result.stdout),
        new Set(['workspace_id', 'workspaceId', 'workspace']),
      );
    } catch {
      return undefined;
    }
  };

  const useExistingViewer = async (root: string, url: string): Promise<boolean> => {
    if (!viewer || viewer.root !== root) return false;
    if (!viewer.surfaceId) return viewer.url === url;

    try {
      const current = await pi.exec('cmux', ['browser', viewer.surfaceId, 'get', 'url'], {
        cwd: root,
        timeout: COMMAND_TIMEOUT_MS,
      });
      if (current.code !== 0) return false;

      const currentUrl = current.stdout.trim();
      if (currentUrl === url) {
        viewer.url = url;
        return true;
      }
      if (!isHunkpadUrl(currentUrl)) return false;

      const navigation = await pi.exec('cmux', ['browser', viewer.surfaceId, 'goto', url], {
        cwd: root,
        timeout: COMMAND_TIMEOUT_MS,
      });
      if (navigation.code !== 0) return false;
      viewer.url = url;
      return true;
    } catch {
      return false;
    }
  };

  const openViewer = async (ctx: ExtensionContext, root: string, url: string): Promise<void> => {
    if (await useExistingViewer(root, url)) return;

    const workspace = await resolveWorkspace(root);
    if (!workspace) {
      notifyFailure(ctx, 'cmux', 'cannot resolve the caller workspace');
      return;
    }

    const args = [
      '--json',
      'new-pane',
      '--workspace',
      workspace,
      '--type',
      'browser',
      '--direction',
      'right',
      '--url',
      url,
      '--focus',
      'false',
    ];

    try {
      const result = await pi.exec('cmux', args, { cwd: root, timeout: COMMAND_TIMEOUT_MS });
      if (result.code !== 0) {
        notifyFailure(ctx, 'cmux', result.stderr || `new-pane exited with code ${result.code}`);
        return;
      }

      const surfaceId = findString(
        parseJson(result.stdout),
        new Set(['surface_id', 'surfaceId', 'surface']),
      );
      viewer = { root, surfaceId, url };
      if (surfaceId) pi.appendEntry(ENTRY_TYPE, { root, surfaceId });
      ctx.ui.notify('Opened Hunkpad in a right browser pane.', 'info');
    } catch (error) {
      notifyFailure(ctx, 'cmux', error instanceof Error ? error.message : String(error));
    }
  };

  const ensureViewer = async (ctx: ExtensionContext, root: string): Promise<void> => {
    if (viewer?.root === root && viewer.url && (await useExistingViewer(root, viewer.url))) return;

    try {
      const result = await pi.exec('hunkpad', ['watch', 'turn', '--root', root], {
        cwd: root,
        timeout: COMMAND_TIMEOUT_MS,
      });
      if (result.code !== 0) {
        notifyFailure(ctx, 'hunkpad', result.stderr || `watch exited with code ${result.code}`);
        return;
      }

      const url = hunkpadUrl(result.stdout);
      if (!url) {
        notifyFailure(ctx, 'hunkpad', 'watch did not return a local capability URL');
        return;
      }
      await openViewer(ctx, root, url);
    } catch (error) {
      notifyFailure(ctx, 'hunkpad', error instanceof Error ? error.message : String(error));
    }
  };

  const ensureViewerOnce = async (ctx: ExtensionContext, root: string): Promise<void> => {
    if (!viewerOpening) {
      viewerOpening = ensureViewer(ctx, root).finally(() => {
        viewerOpening = undefined;
      });
    }
    await viewerOpening;
  };

  pi.on('session_start', async (_event, ctx) => {
    viewer = restoreViewer(ctx);
    if (await ownsCmuxSurface(ctx.cwd)) registerImplementationNoteTool();
  });

  pi.on('before_agent_start', async (event, ctx) => {
    if (!(await ownsCmuxSurface(ctx.cwd))) {
      return {
        systemPrompt: `${event.systemPrompt}\n\nHunkpad cmux automation is inactive in this Pi process because it does not own the inherited cmux terminal surface. Do not run hunkpad turn start, hunkpad turn end, hunkpad watch, or create a Hunkpad browser pane. The owning Pi session manages them.`,
      };
    }

    registerImplementationNoteTool();

    const root = await resolveRoot(ctx.cwd);
    const sessionId = ctx.sessionManager.getSessionId();
    if (!root || !sessionId) return;

    if (activeTurn && (activeTurn.root !== root || activeTurn.sessionId !== sessionId)) {
      await endActiveTurn(ctx);
    }

    if (!activeTurn) {
      const turnId = `${sessionId}:${randomUUID()}`;
      try {
        const result = await pi.exec(
          'hunkpad',
          [
            'turn',
            'start',
            '--session',
            sessionId,
            '--turn',
            turnId,
            '--agent',
            'pi',
            '--root',
            root,
          ],
          { cwd: root, timeout: COMMAND_TIMEOUT_MS },
        );
        if (result.code !== 0) {
          notifyFailure(
            ctx,
            'hunkpad',
            result.stderr || `turn start exited with code ${result.code}`,
          );
          return;
        }
        activeTurn = { root, sessionId, turnId };
        ctx.ui.setStatus(STATUS_KEY, 'Hunkpad: tracking');
      } catch (error) {
        notifyFailure(ctx, 'hunkpad', error instanceof Error ? error.message : String(error));
        return;
      }
    }

    return {
      systemPrompt: `${event.systemPrompt}\n\nHunkpad turn tracking is active for this cmux task. The hunkpad-cmux extension owns turn start, turn end, and the browser viewer. It opens the viewer when a successful edit or write first changes file content inside the repository. Do not duplicate those calls. Load the Hunkpad skill for review comments or other Hunkpad actions.`,
    };
  });

  pi.on('tool_call', async (event, ctx) => {
    const turn = activeTurn;
    if (!turn) return;

    const path = repositoryWritePath(event.toolName, event.input, ctx.cwd, turn.root);
    if (!path) return;

    const before = await fileFingerprint(path);
    if (before === undefined) return;
    pendingWrites.set(event.toolCallId, { before, path, root: turn.root });
  });

  pi.on('tool_result', async (event, ctx) => {
    const pending = pendingWrites.get(event.toolCallId);
    pendingWrites.delete(event.toolCallId);
    const turn = activeTurn;
    if (event.isError || !pending || !turn || pending.root !== turn.root) return;

    const after = await fileFingerprint(pending.path);
    if (after === undefined || after === pending.before) return;
    if (!(await ownsCmuxSurface(ctx.cwd))) return;

    await ensureViewerOnce(ctx, turn.root);
  });

  pi.on('agent_settled', async (_event, ctx) => {
    if (ctx.isIdle()) await endActiveTurn(ctx);
  });

  pi.on('session_shutdown', async (_event, ctx) => {
    await endActiveTurn(ctx);
    ctx.ui.setStatus(STATUS_KEY, undefined);
  });
}
