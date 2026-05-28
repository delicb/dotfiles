---
name: finicky-config
description: >
  Interpret, explain, write, and update Finicky v4 configuration for macOS URL
  routing. Use when working with ~/.finicky.js or ~/.finicky.ts, reading an
  existing Finicky setup, authoring rewrite or handler rules, choosing browsers
  or profiles, debugging rule order, or migrating routing logic into Finicky.
---

# finicky-config

Use this skill to understand or author Finicky configuration.

Finicky v4 loads a config file from one of these common paths:

- `~/.finicky.js`
- `~/.finicky.ts`
- `~/.config/finicky.js`
- `~/.config/finicky.ts`
- `~/.config/finicky/finicky.js`
- `~/.config/finicky/finicky.ts`

Expect modern ESM syntax:

```js
export default {
  defaultBrowser: "Google Chrome",
};
```

## Read a config in this order

1. Read `defaultBrowser`.
2. Read `options`.
3. Read `rewrite` rules from top to bottom.
4. Read `handlers` from top to bottom.
5. Infer the final behavior as:
   - apply every matching rewrite in order
   - then pick the first matching handler
   - otherwise fall back to `defaultBrowser`

That order matters. Rewrites are not just preprocessing notes. They change the URL that handlers see.

## Author configs with these rules

- Use `rewrite` for URL normalization or redirects.
- Use `handlers` for browser selection.
- Put specific rules before generic rules.
- Prefer string wildcard matches first, regex only when needed, and functions for opener or modifier based logic.
- Matchers operate on the full URL, not just the hostname. Use patterns like `"example.com/*"` or inspect `url.host` / `url.pathname` in a function.
- Use a browser string for simple routing.
- Use a browser object when you need a profile, background opening, explicit app type, or other per-app settings.
- Use a browser function only when the browser depends on the URL or opener.

## Interpret callbacks correctly

Matcher, browser, and rewrite callbacks receive:

```ts
(url: URL, options: { opener: { name: string; bundleId: string; path: string } | null })
```

Use `options.opener` to route differently based on the app that opened the link.

## Type checking

Prefer TypeScript when writing a new config. If the user keeps JavaScript, add `// @ts-check` and the JSDoc typedef from the Finicky docs.

Read [references/finicky-v4.md](references/finicky-v4.md) for the exact config shape, examples, and pitfalls.

## Common review checklist

When debugging or reviewing a config, check these first:

- Is the file using `export default`?
- Is the rule in `rewrite` when it should be in `handlers`, or the opposite?
- Is a generic handler shadowing a later specific handler?
- Is a matcher written for a hostname when Finicky is matching against the whole URL string?
- Is a rewrite mutating the URL the handler is expected to match later?
- Is a browser profile written in the expected `Browser:Profile` form or object form?
- Is the logic depending on `opener`, modifier keys, or utility helpers that need a function matcher?

## Source of truth

The Finicky wiki says v4 is new and may contain mistakes. If behavior seems inconsistent, check the installed type definitions at:

`/Applications/Finicky.app/Contents/Resources/finicky.d.ts`

If needed, compare with the current Finicky source before making strong claims.
