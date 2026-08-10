# FreeAgent

**FreeAgent turns the web AI you already use into a local coding agent — no API key, no copy/paste, verified by real builds and tests.**

FreeAgent is a small TypeScript CLI for Windows and Linux (including Arch). It drives DeepSeek Web, Qwen Web, Gemini Web, or a compatible Chromium web chat through the visible UI and Chrome DevTools Protocol. Generic mode is best-effort, not a guarantee for every site.

## Install and run

Requires Node.js 20+ and Edge, Chrome, or Chromium.

```sh
npm install
npm run build
npm link
freeagent
```

On first use, a visible, dedicated browser profile opens. Sign in to the selected provider once; authentication stays in that app-owned profile. FreeAgent never exports browser cookies. Then choose a project and enter one task. The browser exchange, local edits, commands, repair turns, and verification are automatic.

Thirty-second smoke flow:

```sh
freeagent --provider deepseek --project ./tmp/freeagent-smoke --task "Create a minimal Node project with index.js that prints FREEAGENT_OK and a package.json with a build/check script."
```

Generic provider:

```sh
freeagent --provider generic --url https://example-chat.invalid --project ./project --task "Build the requested project"
```

Other commands:

```sh
freeagent stats
freeagent rollback --project ./project
npm run dev -- --provider deepseek --project ./project --task "..."
npm test
npm run build
```

## Safety model

All file actions are confined to the selected project with traversal and symlink checks. Writes are atomic and journaled for rollback. Commands use an explicit executable allowlist, parsed arguments, `shell:false`, bounded output, a timeout, and no privilege escalation or shell composition. FreeAgent uses an isolated browser profile and only the visible web UI. It does not bypass CAPTCHAs, rate limits, or permissions.

## Providers

Adapters for DeepSeek, Qwen, and Gemini contain only URLs and semantic hints; all fall back to the shared accessibility/geometry-based input discovery. To add a provider, add a small `ProviderAdapter` entry in `src/providers.ts` with its URL, accessible input/send/login hints, Enter behavior, and timeout.

## Known limitations

- Provider UI and authentication changes can require adapter-hint updates.
- Generic mode requires a conventional, unambiguous semantic chat textbox.
- Rollback covers tracked project files, not arbitrary external effects of third-party commands or huge ignored dependency directories.
- Interrupted commands are not assumed successful; rerun causes local verification before further progress.
- Portable single-file OS binaries are not yet produced; the npm-distributed CLI is the supported package.
