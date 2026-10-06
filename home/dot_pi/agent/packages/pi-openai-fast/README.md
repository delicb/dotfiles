# Pi OpenAI Fast mode

Request OpenAI priority processing without changing the model, thinking level, tools, or transport. Requires Pi 1.0.3 or newer.

Fast mode starts disabled. The default matchers are `openai/*` and `openai-codex/*`.

These matchers cover chat models using Pi's OpenAI Responses and legacy Codex Responses APIs.
They permit Fast requests, but do not verify backend support. Unsupported models or context sizes can reject the request.
OpenAI does not support Fast mode for fine-tuned models. Other providers and non-chat operations remain unchanged.

## Commands

- `/fast` toggles the session preference.
- `/fast on` enables Fast mode.
- `/fast off` removes this extension's tier override.
- `/fast status` shows the preference, requested cost estimate, and last reported tier.
- `pi --fast` enables the startup preference.

Session entries preserve command changes across reloads, resumes, forks, and tree navigation. A saved session preference takes precedence over `--fast`.

Other service-tier settings remain active when this extension is off.
Models outside the configured matchers or supported APIs receive no override, but retain the session preference.

The footer shows `⚡️` when the Fast preference is enabled. The local `pi-footer` package keeps this indicator beside context usage.

The indicator does not confirm model support or a response tier. Use `/fast status` for those details.

A reported response tier is not a speed guarantee. The Codex backend can report `default` after accepting priority processing.

## Configuration

Optional configuration files:

- User: `<agent-dir>/openai-fast.json`, normally `~/.pi/agent/openai-fast.json`.
- Trusted project: `.pi/openai-fast.json`.

```json
{
  "enabled": false,
  "models": {
    "openai/*": 2,
    "openai-codex/*": 2
  }
}
```

Each value must be a finite cost multiplier above 1. Only exact model keys and provider-wide `*` matchers are supported.
Partial model globs such as `openai/gpt-*` are invalid.

Pricing uses this order:

1. An exact configured model multiplier.
2. A published model multiplier, when a provider wildcard permits the model.
3. The wildcard value for unlisted models, which defaults to 2.

For example, `openai/gpt-4.1` defaults to 1.75, not the wildcard fallback of 2.
An exact `openai/gpt-4.1` entry overrides that published multiplier.

Project fields override user fields. A `models` object replaces the inherited matchers. An empty object disables all overrides.
Existing exact-only configurations remain narrow. Add wildcard entries to permit provider-wide requests.

Invalid configuration disables Fast mode and shows an error. Commands never write configuration files.

Child Pi processes do not automatically inherit Fast mode. Add `--fast` to a child command when needed.

## Costs and request handling

The extension wraps the current OpenAI providers. It preserves authentication, catalog metadata, non-chat operations, and request instrumentation.

It sends `service_tier: "priority"` through the built-in streaming implementation. Request options retain the selected transport and abort signal.

Simple requests use the original provider's option conversion. The extension corrects final cost estimates because that conversion drops the internal `serviceTier` option.

Built-in multipliers use [OpenAI's published Fast and Standard pricing](https://developers.openai.com/api/docs/pricing), checked on October 6, 2026.
They multiply Pi's catalog rates, rather than replacing those rates.

| Models | Fast multiplier |
| --- | --- |
| `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-sol`, `gpt-6-luna` | 2 |
| `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna` | 2 |
| `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex`, `gpt-5.2`, `gpt-5.1`, `gpt-5`, `gpt-4.1-nano` | 2 |
| GPT-5.5 | 2.5 |
| GPT-5 mini | 1.8 |
| GPT-4.1, GPT-4.1 mini, GPT-4o 2024-05-13, o3 | 1.75 |
| GPT-4o | 1.7 |
| GPT-4o mini | 5/3 |
| o4-mini | 20/11 |
| Unlisted models | Wildcard fallback, normally 2 |

The table uses published short-context ratios. It does not verify Fast availability or pricing for other context sizes.
Dated snapshot IDs inherit their model family's multiplier. An exact published snapshot entry takes precedence.
Other aliases use the fallback unless configuration provides an exact override.

Cost estimates normalize the `fast` and `priority` aliases. Responses API requests reported as `default` use Standard estimates.
Legacy Codex requests reported as `default` retain the requested premium estimate.
Model matching does not guarantee Fast processing. See [OpenAI's Fast mode guide](https://developers.openai.com/api/docs/guides/fast-mode) for backend restrictions.

Included Codex subscription usage can run out faster. Footer dollars do not measure subscription allowance. Check OpenAI's usage dashboard for actual usage.

The extension does not retry rejected tiers, send independent network requests, or log credentials and request payloads.

## Checks

```fish
pnpm install --ignore-scripts
pnpm test
pnpm typecheck
pnpm lint
```

Tests use mock providers and local response streams. They do not send paid requests.
