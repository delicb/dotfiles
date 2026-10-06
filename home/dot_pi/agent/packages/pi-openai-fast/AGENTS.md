# Package rules

This package has one extension entry point. Keep configuration and tier rules in `src/`, without Pi imports.

Use public provider APIs. Preserve the original provider's authentication, catalog, and non-chat operations.

The package has no sub-extensions, event bus, or migrations. Add these only when a feature needs them.

Configuration is read-only. Store command changes in session entries, not configuration files.

Run `pnpm test`, `pnpm typecheck`, and `pnpm lint` after changes. Tests must not send network requests.
