---
name: Bundled CLI guards
description: Why imported command modules should not detect direct execution using import.meta.url in a bundled server.
---

Avoid `process.argv[1] === fileURLToPath(import.meta.url)` for command modules imported into an esbuild-bundled API entry. Prefer an explicit command-only environment flag or a separate entry point.

**Why:** Bundling rewrites `import.meta.url` to the bundle's entry URL, so an imported migration module mistook API startup for direct CLI invocation and closed the shared database pool after startup.

**How to apply:** For any CLI utility also imported by a bundled service, keep execution conditions independent of module URL; check that the long-lived service does not run command-only cleanup.