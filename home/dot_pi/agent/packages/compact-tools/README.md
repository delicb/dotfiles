# Compact tools

A local Pi extension that shows one compact row per tool. It supports built-in tools, codemode, MCP, extension tools, and unknown tool names.

## Display

- Each row shows the tool, status, a short argument summary, and result counts. Codemode child rows stay visible below their parent.
- Tool rows have no blank line between them.
- Codemode rows show child-call counts and failures. Each child has its own expand control. Expand the parent to see the script and script output.
- Successful edit and shell diff rows show added and removed line counts. Shell diff rows also show file counts.
- Expand rows to see a view suited to the tool. Use Raw to inspect captured arguments, output, and result details.
- Pi keeps control of inline images and expansion keys.
- Long headings stay on one line. Expanded text wraps to the terminal width. Delta controls diff columns and line wrapping.

The extension does not add tools, change execution, alter model-facing results, or change message layout. It has no settings or persistent tool history. Child results and diff caches stay in memory for the current session.

## Expanded views

Each expanded row has Formatted and Raw controls. In fullscreen mode, click a control to select its view. Each tool keeps its own view through streaming updates and expansion changes. Parent and child views stay separate.

| Tool | Formatted view |
| --- | --- |
| `read` | File path, returned line range, syntax colors, and source line numbers. Continuation notices stay separate when the captured range is known. Images stay inline. |
| `write` | File path and syntax-colored content with line numbers. Failed writes label the content as requested. |
| `edit` | The captured delta/Pi diff. Failed edits show requested changes and the error. |
| `bash`, `powershell` | Syntax-colored command, timeout when set, and terminal output. Complete patches keep the diff view. |
| `grep` | Search options and results grouped by file. `›` marks matches. `│` marks context lines. |
| `find` | Search options and paths grouped by directory. |
| `ls` | Directory path and the captured listing. Folders use a separate color. |
| `codemode` | Syntax-colored JavaScript and separate script output. Complete JSON output uses fields, lists, or tables. |
| `tool_search` | Query, loaded tool names, and descriptions. |

MCP and other tools use labeled fields, named sections, and lists. Repeated records use a table only when all fields fit. Narrow terminals show full stacked entries instead. Partial, failed, or unrecognized output stays text. JSON output also stays text if the field view would change a number's text. Explicit Markdown output uses Pi's Markdown view. Source files, including JSON and Markdown, stay source code.

The formatted object view limits depth and field count. It shows a notice when data remains. Raw shows the full captured data, subject to Pi's output limits and the child display cache. Terminal control bytes are removed in both views. The extension never reads files again to format their output.

Raw shows argument JSON, captured text output, and result details. It does not restore expired child output. View choices stay in memory and reset on reload.

## Codemode children

Child rows stay visible when the parent script is collapsed:

```text
● codemode done · 3 calls
├─ ▸ ● read done src/config.ts
├─ ▸ ✓ edit src/config.ts · +2 -1
└─ ▸ ● bash done pnpm test
```

In fullscreen mode, click a child row to expand or collapse it. Each child keeps its own state as results arrive. Parent expansion does not change child expansion. Child edits and shell patches use the same diff view as direct calls. Further nested calls form child groups.

The extension adds no slash commands. Pi's expansion keys still control top-level rows. Separate child controls and Formatted/Raw controls need fullscreen mouse support.

The extension observes Pi's child-call events. It does not wrap execution or add child output to the script result. After a reload or session resume, saved call details remain visible, but child output is unavailable. Old records can contain shortened argument summaries. Model calls show saved status and cost, but Pi does not emit their output as child-tool events.

The display cache keeps up to 128 parent groups and 2048 calls, with at most 256 calls per parent. It limits arguments to 8 KiB per call. It keeps results up to 1 MiB each and 8 MiB in total. Oversized or expired results show a notice when expanded. If a child completes after eviction, its view uses saved arguments when available. Otherwise, it shows an argument notice instead of source line numbers. These limits do not change execution or model-facing results.

The extension keeps one weak listener per terminal, not per tool row. Child updates request a redraw without clearing completed sibling views. Theme changes still clear all themed views.

## Diffs

Collapsed diff rows stay on one line:

```text
✓ edit demo.txt · +1 -1
✓ bash git diff · 1 file · +1 -1
```

The expanded view identifies the active renderer:

- `delta · side by side`: at least 100 available columns. Old code appears on the left. New code appears on the right.
- `delta · single column`: fewer than 100 available columns.
- `Pi`: delta is unavailable, pending, or cannot render this patch.

Delta controls the full diff view, including line numbers, syntax colors, changed-word highlights, and the captured patch context. Pi's fallback highlights changed words in one-line replacements. It shows up to two context lines around each change. `...` marks omitted context.

Edit diffs use the actual result metadata, not the requested replacements. Diff views omit argument JSON and edit success messages. Shell diff views show the command and keep text before and after the patch.

The extension supports complete unified patches from Bash and PowerShell. Failed, streaming, truncated, incomplete, and unsupported patches keep their original text view. Binary and combined patches use the text view.

### Delta

Install the `delta` CLI on `PATH` to use it. It is optional. The extension checks for delta on the first expanded diff, once per session.

The first view uses Pi's formatter while delta runs. The label changes from `Pi` to `delta` when delta completes. The extension caches output by patch content, terminal width, and light or dark appearance. Repeated screen updates do not start new jobs.

Delta runs without a pager or Git configuration. Resizing the terminal selects side-by-side or single-column output. The extension reserves one column for Pi and uses Pi's formatter below 20 available columns. It removes terminal links and cursor commands from delta output.

Each render has a two-second timeout. Pi's formatter handles missing or failed commands, invalid output, oversized patches, and a full job queue. The extension runs up to two jobs at once. It keeps up to 32 completed results and accepts up to 64 pending requests. Input patches must not exceed 128 KiB. Colored output must not exceed 2 MiB.

The extension uses private temporary files because Pi's exec API has no stdin option. It removes these files after each job. Shutdown and `/reload` cancel pending jobs and clear the cache.

Difftastic is not part of this renderer. It needs complete before and after files, not captured patches.

## Load

Add `"./packages/compact-tools"` to `packages` in `~/.pi/agent/settings.json`. Restart Pi to remove the previous renderer's runtime patches. Use `/reload` for later changes to this extension.

To disable the previous renderer without uninstalling it, use:

```json
{
  "source": "npm:@vanillagreen/pi-tool-renderer",
  "extensions": []
}
```

## Limits

This extension replaces custom tool displays. It supports edit and shell diffs but does not keep custom buttons, panels, or other rich views.

Child results are available only for calls observed in the current session. Reload, shutdown, and cache eviction remove these results. Pi's saved call metadata still supplies child rows.

The extension changes six `ToolExecutionComponent` methods because Pi has no global renderer-only registration API. It checks these methods before installation and restores them on shutdown. Test it after Pi API changes. The current test target is Pi 0.99.2. CLI tests also use the installed delta when available.

## Tests

With development peers installed, run `npm test` and `npm run typecheck`.

To use an installed Pi without installing development peers, set `PI_TEST_HOST` to the Pi package root and run `node --test tests/*.test.mjs`.

### Visual checks

Run `/reload` first. Test codemode with this prompt:

```text
Use codemode to call ls and find in parallel on /tmp.
Print only a short script summary.
Do not change repository files.
```

Expect two child rows below codemode without expanding the parent. In fullscreen mode, click each child to check its output. Select Raw, then Formatted. Confirm that the parent keeps its expansion state.

Test an edit with this prompt:

```text
Create a new temporary directory outside this repository.
Use write directly to create demo.txt with three lines: alpha, beta, gamma.
Use edit directly to change beta to BETA.
Do not use codemode or change repository files.
```

Expect an edit row with `+1 -1`. Expand the row to see the renderer label and colored diff. At least 100 available columns show side-by-side code. Resize the terminal to check single-column output. The label can show `Pi` briefly before delta completes.

Test a shell diff with this prompt:

```text
Use bash directly to print a valid unified diff with one removed line and one added line.
Use printf. Do not create or change files.
```

Expect a Bash row with `1 file` and `+1 -1`. Expand the row to see the renderer label, line numbers, and colored changes.
