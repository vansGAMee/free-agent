<div align="center">

# FreeAgent

### Your browser AI, with local hands.

**A free local coding agent that turns your existing DeepSeek Web session into a real project workflow — no AI API key required.**

<br>

<img src="https://img.shields.io/badge/status-working_MVP-22c55e?style=for-the-badge" alt="Working MVP">
<img src="https://img.shields.io/badge/platform-Windows-0078D4?style=for-the-badge&logo=windows11&logoColor=white" alt="Windows">
<img src="https://img.shields.io/badge/Node.js-20%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js 20+">
<img src="https://img.shields.io/badge/AI-DeepSeek_Web-4D6BFE?style=for-the-badge" alt="DeepSeek Web">
<img src="https://img.shields.io/badge/tests-32%2F32-22c55e?style=for-the-badge" alt="32/32 tests">

<br><br>

<img width="1280" height="866" alt="FreeAgent screenshot" src="https://github.com/user-attachments/assets/4f52224e-f6b2-4bc1-a5cf-23ede6522d78" />

<br>

```text
|^ᴗ^|  Mipi says hi.
```

</div>

---

## ✨ What is FreeAgent?

AI chats are already good at writing code.

The annoying part is everything around the answer:

- copying code into files;
- creating folders;
- installing packages;
- running builds;
- feeding errors back;
- repeating the loop.

**FreeAgent handles that local work for you.**

You give it one task:

```powershell
freecodex . "Create a polished responsive landing page"
```

FreeAgent opens your logged-in DeepSeek Web session, asks for a plan, generates the project **one file at a time**, writes those files locally, runs approved npm commands, checks the result, and can make a small number of targeted repairs.

No AI API key. No manual copy-paste loop.

---

## ⚡ 30-second quick start

### 1. Install FreeAgent once

> Requires **Node.js 20+** and npm to already be installed.

```powershell
git clone https://github.com/vansGAMee/free-agent.git
cd free-agent
npm install
npm run build
npm link
```

### 2. Go to any project folder

```powershell
cd C:\path\to\my-project
```

### 3. Tell FreeAgent what to do

```powershell
freecodex . "Create a responsive landing page"
```

That's the normal workflow.

On the first run, Chromium opens. Log into DeepSeek once if needed. FreeAgent keeps a persistent browser profile and reuses the session later.

---

## 🧸 Meet Mipi

Mipi is FreeAgent's tiny terminal companion.

It does not change the agent logic. It only shows what FreeAgent is doing.

```text
FreeAgent
local browser-powered coding agent

        .              *
   *           .

            |^ᴗ^|
             Mipi

   your tiny coding companion

|•ᴗ•| Mipi is opening DeepSeek...
|•_•| Mipi is planning the project...

Plan
  3 files
  0 commands

|^ᴗ^| Mipi is writing index.html [1/3]
|^ᴗ^| Mipi is writing styles.css [2/3]
|^ᴗ^| Mipi is writing script.js [3/3]

|^o^| Mipi finished!

SUCCESS
Files: 3
Commands: 0
```

Mipi changes face depending on the current state:

```text
|•ᴗ•| opening
|•_•| planning
|^ᴗ^| writing
|>ᴗ<| running
|;ᴗ;| repairing
|^o^| success
|x_x| error
```

Prefer clean logs?

```powershell
freecodex --plain . "Create a landing page"
```

---

## 🧠 How it works

```text
┌──────────────────────────────┐
│           Your task          │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│        DeepSeek Web          │
│   persistent Chromium       │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│      Short project plan      │
│   files + safe npm commands  │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│     Generate one file        │
│          at a time           │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│       Write files locally    │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│    Run allowlisted commands  │
│      and verify the build    │
└──────────────┬───────────────┘
               │
          failure?
          ┌────┴────┐
          │         │
         yes        no
          │         │
          ▼         ▼
   targeted repair  SUCCESS
   max 2 attempts
```

### Why file-by-file?

FreeAgent does **not** ask the model to dump an entire project into one giant JSON response.

Instead:

1. DeepSeek returns a short manifest.
2. FreeAgent requests each file separately.
3. Each source file is extracted from its own code block.
4. The file is written directly into the project.
5. Approved commands run after generation.

That keeps the browser transport smaller and makes multi-file generation more reliable.

---

## 🧩 Response protocol

FreeAgent uses a simple completion marker:

```text
FREEAGENT_END
```

A planning response contains a short manifest plus this sentinel.

If the browser returns a partial or malformed response, FreeAgent can retry the protocol before executing anything.

Generated source files are also requested individually instead of being packed into the manifest.

---

## 🔒 Deliberately restricted local execution

FreeAgent is **not** an unrestricted shell agent.

Right now it only accepts these command shapes:

```text
npm install
npm install <packages>
npm run <script>
```

Examples:

```text
npm install
npm install react vite
npm run build
```

### Not supported right now

```text
pip install ...
python ...
winget install ...
choco install ...
git clone ...
curl ...
powershell ...
cmd ...
apt install ...
pacman -S ...
cargo ...
```

It also **does not install Node.js itself**.

Node.js 20+ must already exist on the machine before FreeAgent can start.

This limitation is intentional: the browser model does not get arbitrary shell access.

---

## 🛡️ Safety model

FreeAgent keeps a narrow execution boundary.

| Protection | Current behavior |
|---|---|
| Project path safety | Generated files must remain inside the target project |
| Absolute output paths | Rejected |
| `..` project escape | Rejected |
| Arbitrary shell commands | Rejected |
| Allowed package manager | npm only |
| Repair loop | Maximum 2 targeted attempts |
| Git commits / pushes | Not automatic |
| File generation | One file at a time |
| Browser session | Persistent local Chromium profile |
| AI API key | Not required |

Command execution is argument-based rather than handing arbitrary model text to a shell.

---

## 🧯 What happens when a build fails?

FreeAgent does not blindly regenerate the entire project.

It can ask DeepSeek for a **targeted repair manifest** containing only the files that need another pass.

```text
build fails
   ↓
send failure context
   ↓
receive repair file list
   ↓
regenerate only those files
   ↓
run verification again
```

Repair attempts are bounded:

```text
maximum repair attempts: 2
```

No infinite self-repair loop.

---

## 💻 CLI

### Current folder + task

```powershell
freecodex . "Create a portfolio website"
```

### Task only

If no project path is supplied, FreeAgent uses the current directory:

```powershell
freecodex "Add a responsive navbar"
```

### Explicit project path

```powershell
freecodex C:\Users\me\Documents\site "Fix the mobile layout"
```

### Plain output

```powershell
freecodex --plain . "Create a landing page"
```

### Help

```powershell
freecodex --help
```

Current CLI shape:

```text
Usage:
  freecodex [project-path] "task"
  freecodex "task"

Options:
  --plain
  --help
  --version
```

The older development form still works:

```powershell
npm run dev -- "C:\path\to\project" --task "Create a responsive landing page"
```

---

## ✅ What works today

| Feature | Status |
|---|:---:|
| DeepSeek Web | ✅ |
| Persistent Chromium login | ✅ |
| Multi-file generation | ✅ |
| File-by-file generation | ✅ |
| Local file writes | ✅ |
| `npm install` | ✅ |
| `npm install <packages>` | ✅ |
| `npm run <script>` | ✅ |
| Build verification | ✅ |
| Targeted repair | ✅ |
| Maximum 2 repairs | ✅ |
| `freecodex . "task"` | ✅ |
| Task-only current-directory mode | ✅ |
| `--plain` | ✅ |
| Mipi status companion | ✅ |
| 32 automated tests | ✅ |
| AI API key required | ❌ |
| Arbitrary shell access | ❌ |
| Python / pip workflow | ❌ |
| Rust / Cargo workflow | ❌ |
| System package installation | ❌ |
| Fully offline AI | ❌ |
| Multiple AI providers | ❌ |

---

## 🪟 Platform status

### Windows

**Confirmed.**

The full workflow has been tested live on Windows:

```text
Task
→ DeepSeek Web
→ manifest
→ individual files
→ npm commands
→ verification
→ SUCCESS
```

The current codebase also passes:

```text
32 / 32 tests
TypeScript build: PASS
```

### Windows 10

Not yet claimed as verified.

It may work, but FreeAgent has not received the same live compatibility test there yet.

### Linux

Not yet supported as a confirmed target.

FreeAgent is currently **Windows-first**.

---

## 🌐 What is local — and what is not?

FreeAgent is a **local execution agent**, not a local AI model.

### On your machine

- project files;
- file writes;
- npm execution;
- build commands;
- repair execution;
- FreeAgent itself;
- the persistent Chromium profile.

### Sent to DeepSeek Web

- your task prompt;
- follow-up generation requests;
- build failure context used for repairs;
- model responses.

So FreeAgent should **not** be described as:

```text
100% offline
100% local AI
nothing leaves your PC
```

The accurate description is:

> **Local coding execution powered by your existing browser AI session.**

Internet access is required.

---

## 🧪 Tested baseline

Current stable baseline:

```text
Test files: 7 / 7 passed
Tests:      32 / 32 passed
Build:      PASS
```

Stable checkpoint:

```text
branch: libraries-mvp
commit: 50812a4
tag: stable-mipi-v1
```

Earlier Windows MVP checkpoint:

```text
tag: stable-windows-mvp-1
```

---

## 🗂️ Example tasks

### Static site

```powershell
freecodex . "Create a polished dark landing page using index.html, styles.css and script.js. No framework."
```

### React

```powershell
freecodex . "Create a small responsive React landing page with Vite."
```

### Existing project

```powershell
freecodex . "Fix the mobile navigation without changing the current visual style."
```

### Small UI change

```powershell
freecodex . "Add a compact pricing section below the hero."
```

---

## ⚠️ Current limitations

FreeAgent is a working MVP, not a universal autonomous developer.

Current limitations:

- DeepSeek Web is the only confirmed AI provider.
- Node.js and npm must already be installed.
- Only npm commands are executable.
- Python, pip, Rust, Cargo and other ecosystems are not handled yet.
- System dependencies cannot be installed automatically.
- Arbitrary shell commands stay blocked.
- Internet access is required.
- Browser UI changes on DeepSeek can require compatibility fixes.
- Windows is the only confirmed platform.
- Dependency versions still depend on the model's output.

Generated projects should still be reviewed before production use.

---

## 🗺️ Roadmap

Planned directions, without removing the narrow safety boundary:

- [ ] Windows 10 compatibility verification
- [ ] Linux support
- [ ] safer Python / pip workflow
- [ ] more package ecosystems
- [ ] additional browser AI providers
- [ ] dependency-version policy
- [ ] easier installer for non-technical users
- [ ] packaged releases
- [ ] more real-world compatibility tests
- [ ] richer terminal polish for Mipi

---

## 🧑‍💻 Development

Install dependencies:

```powershell
npm install
```

Run the test suite:

```powershell
npm test
```

Build:

```powershell
npm run build
```

Run the development CLI:

```powershell
npm run dev -- "C:\path\to\project" --task "Create a landing page"
```

---

## 🧱 Design principles

FreeAgent is intentionally built around a few constraints:

**Browser AI is the brain.**  
DeepSeek handles planning and code generation.

**FreeAgent is the hands.**  
It writes files and runs a narrow set of local commands.

**Small responses beat giant responses.**  
Plans stay short; source files are requested separately.

**Failure should be bounded.**  
Repair gets a small number of targeted attempts.

**Local execution should stay restricted.**  
More capability should not mean handing unrestricted shell access to the model.

---

<details>
<summary><strong>Why not just give the model full shell access?</strong></summary>

<br>

Because FreeAgent is intentionally trying to solve a smaller problem.

The useful part is automating the repetitive path from:

```text
AI answer
```

to:

```text
working local project
```

That does not require arbitrary access to PowerShell, cmd, curl, package managers, Git, or the rest of the machine.

Keeping the executor narrow makes the behavior easier to understand and easier to audit.

</details>

---

<details>
<summary><strong>Does FreeAgent use the DeepSeek API?</strong></summary>

<br>

No.

It drives a logged-in DeepSeek Web session through Chromium.

That is why an AI API key is not required.

</details>

---

<details>
<summary><strong>Can it install Python or system packages?</strong></summary>

<br>

Not currently.

The executor is limited to:

```text
npm install
npm install <packages>
npm run <script>
```

Commands such as `pip`, `winget`, `choco`, `apt`, `pacman`, `curl` and arbitrary PowerShell are not part of the current execution allowlist.

</details>

---

<div align="center">

## FreeAgent

**Let the browser AI think. Let FreeAgent handle the repetitive local work.**

```text
|^ᴗ^|
 Mipi
```

<sub>Windows-first · DeepSeek Web · local file execution · no AI API key</sub>

</div>
