# Package rules

This package has one extension entry point. Keep file parsing and merge rules in `src/`, without Pi imports.

The package has no sub-extensions, event bus, or migrations. Add these only when a feature needs them.

Run `pnpm run typecheck`, `pnpm run lint`, and `pnpm run test --reporter=agent` after changes.
