# kimi-cli-upgrade

A local wrapper for the official [Kimi Code CLI](https://moonshotai.github.io/kimi-code/) that adds advanced token-saving features, local context injection, chat history, and an optional `kimi` redirect.

> ⚠️ **Disclaimer**: This project does **not** modify, redistribute, or reverse-engineer the official Kimi CLI. It is an independent Node.js wrapper that calls your existing `kimi` binary.

## Features

- **Token usage dashboard**: `kimi1 --usage` reads Kimi's own `wire.jsonl` accounting to show fresh/output/cache tokens and cache-hit rate per session; every prompt-mode run prints a one-line token summary.
- **`@file` inline references**: `@path` in a prompt inlines that file (capped, binary-skipped) so the agent doesn't spend steps discovering it.
- **Reusable commands**: `--save-command` / `--do` / `--commands` run saved prompt templates with `$ARGUMENTS` / `$1` substitution.
- **Git checkpoints**: every run snapshots the working dir; `--diff` reviews changes, `--undo` rolls back (with confirm).
- **Project init & memory**: `--init` generates a `KIMI.md` from a local project scan; `--remember "..."` appends project notes.
- **Session search & submenu**: `--search <term>` finds past sessions; the picker's Right-arrow submenu does Open / Fork / Usage / Rename / Delete.
- **`--fast`, context meter, `--doctor`, `--config`, `--export`, `--web`, run hooks**: highspeed model, context-fill bar, health check, settings hub, native export/web, and pre/post shell hooks.
- **Markdown output**: replies render with colored headers/bold/code and framed code blocks.
- **Local context injection (prompt mode only)**: Auto-loads `KIMI.md`, `.ai-shared-context.md`, and `.globalcontext.md` from the current directory and sends them inside the `-p` prompt.
- **Prompt pre-classification**: In prompt mode, `kimi1` heuristically detects whether the user is asking a question or requesting file/tool actions. If no tools are needed, it installs a shorter conversational skill and omits tool-use rules from the system prompt.
- **Strict no-verbiage**: Forces concise, technical-only responses.
- **Single-shot auto-correction**: On terminal errors, packages the error + previous output into one final correction prompt instead of looping.
- **Arrow-key session selector**: `kimi1 --sessions` opens a Claude-style interactive picker (Up/Down, Enter, Right arrow for a per-session submenu, Esc).
- **Plain session table**: `kimi1 --list` shows a compact table when you do not need the picker.
- **Auto-generated session names (0 tokens)**: old sessions are renamed locally from the first user prompt using pattern rules + keyword extraction. No API calls.
- **Isolated home**: `kimi1` runs under its own `~/.kimi-code-kimi1` directory, leaving the official `~/.kimi-code` untouched.
- **Loop control**: Configurable `max_steps_per_turn` and `thinking` toggle to cut token usage.
- **Thinking off by default**: Disables Kimi's reasoning chain to reduce per-call token cost (re-enable anytime).
- **Auto-continuation**: When Kimi hits its per-turn `max_steps` cap, `kimi1` automatically resumes the same session and continues the task.
- **Optional `kimi` redirect**: After installation, `kimi` is fully redirected to `kimi1`; disable anytime.
- **Token-saving flags**: `--compress`, `--cache`, `--no-context`, `--fix`.
- **Session migration**: `--migrate-history` imports official Kimi sessions on first install.
- **Compact reminder (opt-in)**: `--compact-mode` warns you before opening a large session so you can type Kimi's official `/compact` slash command inside the chat. Auto-compaction is **off** by default because `/compact` only works interactively.
- **Visual formatting**: Colored output and clean tables via `chalk` and `cli-table3`.

## Requirements

- Node.js >= 14
- Official Kimi Code CLI already installed (`kimi` command available)

## Installation

### Windows (PowerShell)

```powershell
git clone https://github.com/VortexJer/Kimi-Cli-upgrade.git
cd kimi-cli-upgrade
.\install.ps1
```

During installation you will pick `max_steps_per_turn`, `thinking` mode, and `auto-compact` mode (default: off) from arrow-key menus (Up/Down + Enter). Restart PowerShell. The installer creates both `kimi1` and a hybrid `kimi` wrapper, so most kimi1 commands are also available through the official `kimi` command:

```powershell
kimi1 --help
kimi --sessions    # same as kimi1 --sessions
kimi --list        # same as kimi1 --list
```

### Linux / macOS

```bash
git clone https://github.com/VortexJer/Kimi-Cli-upgrade.git
cd kimi-cli-upgrade
bash install.sh
```

Reload your shell:

```bash
source ~/.bashrc  # or ~/.zshrc
kimi1 --help
```

## Usage

> After `--enable-kimi`, every command below also works with `kimi` instead of `kimi1`,
> and `kimi1 --help` prints them with the `kimi` prefix. Native kimi commands
> (`kimi -S`, `kimi -c`, `kimi doctor`, `kimi export`, `kimi web`, …) keep working
> unchanged — they pass straight through to the real binary.

```powershell
# Ask with local context (@file), auto-fix, and an automatic git checkpoint
kimi1 "explain this code"
kimi1 "fix the bug in @src/app.js"

# --- Sessions ---
kimi1 --sessions (-s)      # arrow picker. Right arrow -> submenu:
                           # Open / Fork / Usage / Rename / Delete
kimi1 --list (-l)          # plain table
kimi1 --search <term> (-se)  # find sessions by title / first prompt
kimi1 --fork <id> (-fk)    # fresh session seeded from a 0-token local summary
kimi1 --clean-empty (-ce) | --rename-sessions (-rs) | --migrate-history (-mh)

# --- Tokens & context ---
kimi1 --usage (-us)        # token/cache usage per session + totals
kimi1 --fast (-fa)         # highspeed model (chat prompts use it by default)
kimi1 --compact-mode off|safe|aggressive (-cm)
kimi1 --tools [lean|full] (-tl)   # trim tool schemas (needs kimi >= 0.29)
kimi1 --compress (-cp) | --cache (-ca) | --no-context (-nc)

# --- Project & workflow ---
kimi1 --init (-in)                 # generate KIMI.md from a project scan
kimi1 --remember "<fact>"          # append a note to KIMI.md
kimi1 --save-command <name> "..."  # save a prompt template ($ARGUMENTS, $1, $2)
kimi1 --do <name> [args]           # run it   |   --commands  to list
kimi1 --diff | --undo              # review / roll back the last run (git)
kimi1 --hook pre|post "<cmd>" | --hooks   # shell hooks around each turn
kimi1 --fix (-f)                   # one auto-correction retry on failure

# --- Config ---
kimi1 --config (-cfg)              # interactive settings hub
kimi1 --thinking [on|off] (-th)    # menu if no value
kimi1 --max-steps <n> (-ms)
kimi1 --model [<alias>] (-mo)      # menu if no value  |  --models  to list
kimi1 --doctor (-doc)              # health check
kimi1 --enable-kimi (-e) | --disable-kimi (-d)
kimi1 --restore-official-config (-roc)

# --- Misc ---
kimi1 --dry-run (-dr) "your prompt"
kimi1 --uninstall (-u)
kimi1 --help (-h)
```

## How it works

1. In **prompt mode** (`kimi1 "..."`), `kimi1` loads local context files and wraps them in XML tags at the top of the `-p` prompt.
2. It forwards the enriched prompt to your official `kimi` binary.
3. If the executed command fails, it builds a **single** correction prompt with the tail of the error and the previous output, then calls Kimi one more time.
4. If Kimi hits its per-turn `max_steps` cap, `kimi1` extracts the session ID and sends a continuation prompt in the same session, repeating until the task finishes or a safety limit is reached.
5. In **interactive/resume** modes it installs a minimal local skill with high-level operational rules only (no static context injection).
5. When the session ends, the temporary skill is cleaned up.
6. Session titles are generated locally from the first user prompt, with zero API calls.

## `kimi` redirect

After running `install.ps1`, the `kimi` command is fully redirected to `kimi1`. Every `kimi ...` call runs through the wrapper with the isolated home and token-saving defaults.

To temporarily restore the official `kimi.exe` behavior:

```powershell
kimi1 --disable-kimi
kimi1 -d
```

To enable it again:

```powershell
kimi1 --enable-kimi
kimi1 -e
```

The `kimi` redirect is **cross-platform**: on Windows it writes a function to your
PowerShell profile; on Linux/macOS it writes an equivalent `kimi()` shell function
to your `~/.zshrc` / `~/.bashrc`. Restart your terminal (or `source` your profile)
after enabling/disabling.

## Token-saving architecture

| Technique | How it is implemented |
|-----------|----------------------|
| Zero-token titles | Session names extracted locally with pattern rules + keyword extraction |
| Single-shot auto-fix | At most 2 Kimi calls: initial + one correction, not a loop |
| Thinking off by default | Disables reasoning chain, saving tokens on every call |
| Per-turn step cap handling | Auto-resume on `max_steps_exceeded`; large tasks continue across turns |
| No history duplication | Prior messages are never re-sent; Kimi keeps session context server-side |
| Prompt pre-classification | Detects conversational prompts and omits tool-use rules from the system prompt |
| Token estimator | `--dry-run` shows estimated prompt/context tokens before calling the API |
| Compact reminder | Warns before opening large sessions so you can run Kimi's official `/compact` |
| Tool avoidance rule | System prompt forbids tool calls for simple questions/greetings |
| Context minification | Local whitespace/newline compression of context files before injection |
| Payload guard | System prompt forbids reading binary/multimedia/dependency bytes |
| Error compression | Terminal error output is truncated to the last 20 lines |
| No-verbiage | Strict system prompt forbids greetings, explanations, and filler text |
| Prompt compression | Auto-fix prompts strip redundant grammar/connectors |
| XML-structured payload | Static context wrapped in `<contexto_estatico>` to help backend caching |
| Minimal skill | `SKILL.md` contains only high-level operational rules, no duplicated static context |

## Uninstall

```powershell
kimi1 --uninstall
```

This removes the `kimi1` alias, the optional `kimi` redirect, and the project directory. Backups of your shell profile are created automatically.

## License

MIT
