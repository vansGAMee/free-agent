# FreeAgent

**A free local coding agent powered by the AI chat you already use in your browser.**

FreeAgent drives your logged-in DeepSeek Web session, creates files on your machine, and runs a restricted set of local npm commands. It needs no AI API key.

FreeAgent is not fully offline. Internet access is required, and prompts are sent to DeepSeek through the browser. Windows is the currently confirmed platform.

## Quick start

Requires Node.js 20+.

```powershell
git clone https://github.com/vansGAMee/free-agent.git
cd free-agent
npm install
npm run build
npm link
```

Then run FreeAgent from any project folder:

```powershell
cd C:\path\to\my-project
freecodex . "Create a responsive landing page"
```

A Chromium window opens. Log into DeepSeek once if needed; FreeAgent reuses its persistent browser session on later runs.

## Example

```powershell
freecodex . "Create a static landing page with index.html, styles.css and script.js"
```

```text
FreeAgent
local browser-powered coding agent

|•_•| Mipi is planning the project...

Plan
  3 files
  0 commands

|^ᴗ^| Mipi is writing index.html [1/3]
|^ᴗ^| Mipi is writing styles.css [2/3]
|^ᴗ^| Mipi is writing script.js [3/3]

SUCCESS
Files: 3
Commands: 0
```

Use `freecodex --plain ...` for undecorated output. Run `freecodex --help` for all CLI forms.

The existing development invocation remains available:

```powershell
npm run dev -- "C:\path\to\project" --task "Create a responsive landing page"
```

## How it works

```text
Task
  ↓
DeepSeek Web
  ↓
Manifest
  ↓
One file at a time
  ↓
Local project
  ↓
Safe npm verification
```

## Safety

- Generated paths must be relative and remain inside the project root.
- Only `npm install`, `npm install <packages>`, and `npm run <script>` are approved.
- Commands use argument-based process spawning with `shell:false`; arbitrary shell commands are rejected.
- Failed verification gets at most two targeted repair attempts.

## Current status

- Windows: confirmed
- DeepSeek Web: confirmed
- Multi-file generation: confirmed
- npm install/build: confirmed
- Bounded repair: implemented
- Linux: not yet supported
- Other AI providers: not yet supported
