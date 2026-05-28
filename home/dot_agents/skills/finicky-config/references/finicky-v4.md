# Finicky v4 Reference

Use this file when you need the exact mental model for reading or writing Finicky config.

## Table of contents

- [Execution model](#execution-model)
- [Config shape](#config-shape)
- [Matchers](#matchers)
- [Browser specifications](#browser-specifications)
- [Rewrite rules](#rewrite-rules)
- [Callback parameters](#callback-parameters)
- [Utility helpers](#utility-helpers)
- [Type checking](#type-checking)
- [Interpretation workflow](#interpretation-workflow)
- [Authoring patterns](#authoring-patterns)
- [Pitfalls](#pitfalls)
- [Examples](#examples)

## Execution model

Finicky evaluates config in this order:

1. Start with the incoming URL.
2. Run `rewrite` rules in array order.
3. Apply every rewrite whose `match` succeeds.
4. Run `handlers` in array order against the rewritten URL.
5. Stop at the first matching handler and open its browser.
6. If no handler matches, open `defaultBrowser`.

Important consequences:

- Rewrite order matters.
- Multiple rewrites can chain.
- Handler order matters.
- Handlers see the rewritten URL, not always the original URL.

## Config shape

```ts
export default {
  defaultBrowser: BrowserSpecification,
  options?: {
    checkForUpdates?: boolean,
    logRequests?: boolean,
    keepRunning?: boolean,
    hideIcon?: boolean,
    urlShorteners?: string[],
  },
  rewrite?: Array<{
    match: UrlMatcherPattern,
    url: UrlTransformSpecification,
  }>,
  handlers?: Array<{
    match: UrlMatcherPattern,
    browser: BrowserSpecification,
  }>,
}
```

Minimal config:

```js
export default {
  defaultBrowser: "Safari",
};
```

## Matchers

A `match` can be:

- a wildcard string
- a regular expression
- a function `(url, options) => boolean`
- an array of the above, treated as OR

### Wildcard strings

These are matched against the full URL string.

```js
match: "https://example.com/*"
match: "example.com/*"
match: "*.example.com/*"
```

Use wildcard strings for simple host and path routing.

### Regular expressions

These are also tested against the full URL string.

```js
match: /^https?:\/\/example\.com\/docs\//
match: /\.(dev|test)\.example\.com/
```

Use regex when the pattern is awkward in wildcard form.

### Functions

```js
match: (url, { opener }) => url.host === "example.com"
match: (url, { opener }) => opener?.name.includes("Slack") || false
match: (url) => url.pathname.startsWith("/api/")
```

Use function matchers when routing depends on:

- `opener`
- modifier keys
- URL parsing with `host`, `pathname`, `searchParams`
- logic that is clearer in code than in regex

### Arrays

```js
match: [
  "google.com/*",
  "*.google.com/*",
  (url) => url.pathname.startsWith("/maps"),
]
```

An array means any child matcher may match.

## Browser specifications

A `browser` or `defaultBrowser` can be:

- a string app name
- a string bundle id
- a string app path
- a Chromium profile shorthand in `Browser:Profile` form
- an object
- a function returning a string or object

### Simple forms

```js
browser: "Safari"
browser: "com.google.Chrome"
browser: "/Applications/Firefox.app"
browser: "Google Chrome:Work"
```

### Object form

```js
browser: {
  name: "Google Chrome",
  appType: "appName",
  profile: "Work",
  openInBackground: true,
}
```

Useful keys:

- `name`: browser or app identifier
- `appType`: `"appName"`, `"bundleId"`, or `"path"`
- `profile`: profile name, mostly for Chromium based browsers
- `openInBackground`: open without focusing the app

The current v4 source schema also includes `args?: string[]` on the object form, even though the wiki page does not highlight it.

### Dynamic browser selection

```js
browser: (url) => {
  if (url.host === "meet.google.com") return "Google Chrome:Work";
  if (url.host.endsWith(".local")) return "Firefox";
  return "Safari";
}
```

Use a function when the browser depends on URL details or opener details.

## Rewrite rules

A rewrite rule looks like this:

```js
{
  match: UrlMatcherPattern,
  url: UrlTransformSpecification,
}
```

The `url` value can be:

- a string URL
- a `URL` instance
- a function that returns a string or `URL`

Examples:

```js
{
  match: "x.com/*",
  url: (url) => {
    url.host = "xcancel.com";
    return url;
  },
}
```

```js
{
  match: /^https?:\/\/old\.example\.com\/(.*)/,
  url: (url) => {
    const next = new URL("https://new.example.com");
    next.pathname = url.pathname;
    next.search = url.search;
    return next;
  },
}
```

Use rewrites for:

- replacing hosts
- forcing a canonical path
- removing or preserving query params intentionally
- expanding redirect targets before browser routing

## Callback parameters

The wiki documents this callback signature:

```ts
type Callback = (
  url: URL,
  options: {
    opener: {
      name: string,
      bundleId: string,
      path: string,
    } | null,
  }
) => unknown
```

Practical notes:

- `url` is already parsed. Use `url.host`, `url.hostname`, `url.pathname`, `url.searchParams`, and `url.href`.
- `opener` is the app that triggered the URL open, if Finicky knows it.
- Route Slack, Teams, mail clients, or terminal launched URLs differently by checking `opener`.

## Utility helpers

From the docs and current source:

```js
finicky.matchHostnames(["example.com", /.*\.example\.org$/])
finicky.getModifierKeys()
finicky.getSystemInfo()
finicky.getPowerInfo()
finicky.isAppRunning("Google Chrome")
```

Notes:

- `finicky.matchHostnames(...)` helps when matching hostnames only.
- In current source, string entries passed to `matchHostnames` are exact hostname matches. Use regex for subdomains or patterns.
- `finicky.matchDomains(...)` exists but is deprecated in source. Prefer `matchHostnames`.
- `console.log`, `console.warn`, and `console.error` are supported for debugging.

## Type checking

### JavaScript

```js
// @ts-check

/**
 * @typedef {import('/Applications/Finicky.app/Contents/Resources/finicky.d.ts').FinickyConfig} FinickyConfig
 */

/** @type {FinickyConfig} */
export default {
  defaultBrowser: "Safari",
};
```

### TypeScript

```ts
import type { FinickyConfig } from "/Applications/Finicky.app/Contents/Resources/finicky.d.ts";

export default {
  defaultBrowser: "Safari",
} satisfies FinickyConfig;
```

## Interpretation workflow

When reading an existing config:

1. Identify the config file path and syntax (`.js` or `.ts`).
2. Confirm there is a default export.
3. Summarize `defaultBrowser` first.
4. Walk the `rewrite` array in order and describe how a sample URL changes.
5. Walk the `handlers` array in order and note which earlier rule shadows later rules.
6. Call out use of `opener`, modifiers, utility helpers, or profile specific browser objects.
7. State the final browser for representative URLs.

## Authoring patterns

### Prefer a simple string matcher first

```js
{
  match: "docs.example.com/*",
  browser: "Firefox",
}
```

### Use function matchers for opener-aware routing

```js
{
  match: (url, { opener }) => {
    return opener?.name.includes("Slack") && url.host.endsWith("github.com");
  },
  browser: "Google Chrome:Work",
}
```

### Rewrite first, route second

```js
export default {
  defaultBrowser: "Safari",
  rewrite: [
    {
      match: "x.com/*",
      url: (url) => {
        url.host = "xcancel.com";
        return url;
      },
    },
  ],
  handlers: [
    {
      match: "xcancel.com/*",
      browser: "Firefox",
    },
  ],
};
```

### Use browser objects for profiles and background tabs

```js
{
  match: "calendar.google.com/*",
  browser: {
    name: "Google Chrome",
    profile: "Work",
    openInBackground: true,
  },
}
```

## Pitfalls

- `match` strings are not hostname-only by default. They match the whole URL string.
- A broad rule like `"*.example.com/*"` can shadow a later specific handler.
- Rewrites can silently change what later handlers match.
- Regex and function matchers are powerful, but harder to audit. Prefer simpler forms when possible.
- `finicky.matchHostnames` is hostname-only helper logic, not the same wildcard matcher used for URL `match` strings.
- Finicky v4 prefers `export default { ... }`. Legacy `module.exports` may still be tolerated, but do not write new configs that way.
- The wiki itself warns that v4 docs may contain mistakes. If a detail matters, check the installed type definitions or source.

## Examples

### Route work links to a work profile

```js
export default {
  defaultBrowser: "Safari",
  handlers: [
    {
      match: ["github.com/*", "linear.app/*", "*.atlassian.net/*"],
      browser: "Google Chrome:Work",
    },
  ],
};
```

### Route Slack-opened GitHub links differently

```js
export default {
  defaultBrowser: "Safari",
  handlers: [
    {
      match: (url, { opener }) => {
        return opener?.name.includes("Slack") && url.host === "github.com";
      },
      browser: "Google Chrome:Work",
    },
  ],
};
```

### Clean up a URL before routing

```js
export default {
  defaultBrowser: "Safari",
  rewrite: [
    {
      match: "www.amazon.com/*",
      url: (url) => {
        url.searchParams.delete("tag");
        url.searchParams.delete("ref_");
        return url;
      },
    },
  ],
  handlers: [
    {
      match: "www.amazon.com/*",
      browser: "Firefox",
    },
  ],
};
```
