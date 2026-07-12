# kimi-cli-upgrade

A local wrapper for the official [Kimi Code CLI](https://moonshotai.github.io/kimi-code/) that adds advanced token-saving features, local context injection, chat history, and an optional `kimi` redirect.

> ⚠️ **Disclaimer**: This project does **not** modify, redistribute, or reverse-engineer the official Kimi CLI. It is an independent Node.js wrapper that calls your existing `kimi` binary.

## Features

- **Local context injection (prompt mode only)**: Auto-loads `KIMI.md`, `.ai-shared-context.md`, and `.globalcontext.md` from the current directory and sends them inside the `-p` prompt.
- **Strict no-verbiage**: Forces concise, technical-only responses.
- **Single-shot auto-correction**: On terminal errors, packages the error + previous output into one final correction prompt instead of looping.
- **Arrow-key session selector**: `kimi1 --history` opens a Claude-style interactive picker (Up/Down, Enter, Esc).
- **Plain session table**: `kimi1 --list` shows a compact table when you do not need the picker.
- **Auto-generated session names (0 tokens)**: old sessions are renamed locally from the first user prompt using pattern rules + keyword extraction. No API calls.
- **Isolated home**: `kimi1` runs under its own `~/.kimi-code-kimi1` directory, leaving the official `~/.kimi-code` untouched.
- **Loop control**: Configurable `max_steps_per_turn` and `thinking` toggle to cut token usage.
- **Thinking off by default**: Disables Kimi's reasoning chain to reduce per-call token cost (re-enable anytime).
- **Auto-continuation**: When Kimi hits its per-turn `max_steps` cap, `kimi1` automatically resumes the same session and continues the task.
- **Optional `kimi` redirect**: After installation, `kimi` is fully redirected to `kimi1`; disable anytime.
- **Token-saving flags**: `--compress`, `--cache`, `--no-context`, `--fix`.
- **Session migration**: `--migrate-history` imports official Kimi sessions on first install.
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

During installation you will be asked for `max_steps_per_turn` (press ENTER for unlimited) and for `thinking` mode (press ENTER for off). Restart PowerShell. The installer creates both `kimi1` and a hybrid `kimi` wrapper, so most kimi1 commands are also available through the official `kimi` command:

```powershell
kimi1 --help
kimi --history     # same as kimi1 --history
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

```powershell
# Ask Kimi with context + auto-fix
kimi1 "explain this code"

# Start Kimi interactively with local context
kimi1

# Resume / continue sessions
kimi1 -S <sessionId>
kimi1 -c

# Interactive session picker with arrow keys (Enter to open, Esc to cancel)
kimi1 --history (-h)

# Plain table of sessions
kimi1 --list (-l)

# Session details and resume by ID
kimi1 --history --id <id> (-id)
kimi1 --history --resume <id> (-r)

# Remove empty/unused sessions (auto-cleaned when opening --history / --list)
kimi1 --clean-empty (-ce)

# Rename old sessions based on the first prompt (heuristic pattern rules)
kimi1 --rename-sessions (-rs)

# Dry-run without calling the API
kimi1 --dry-run (-dr) "your prompt"

# Token-saving flags (opt-in)
kimi1 --compress (-cp)
kimi1 --cache (-ca)
kimi1 --no-context (-nc)
kimi1 --fix (-f)

# Loop / model behavior (max_steps is capped at 5 by the Kimi binary)
kimi1 --max-steps <n> (-ms)
kimi1 --thinking on|off (-th)

# Redirect "kimi" to "kimi1" / restore original
kimi1 --enable-kimi (-e)
kimi1 --disable-kimi (-d)

# Migrate official Kimi sessions into kimi1
kimi1 --migrate-history (-mh)

# Uninstall
kimi1 --uninstall (-u)

# Help
kimi1 --help (-he)
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

Restart PowerShell after enabling/disabling.

## Token-saving architecture

| Technique | How it is implemented |
|-----------|----------------------|
| Zero-token titles | Session names extracted locally with pattern rules + keyword extraction |
| Single-shot auto-fix | At most 2 Kimi calls: initial + one correction, not a loop |
| Thinking off by default | Disables reasoning chain, saving tokens on every call |
| Per-turn step cap handling | Auto-resume on `max_steps_exceeded`; large tasks continue across turns |
| History cap | Only the 3 most relevant prior messages are kept in wrapper context |
| Tool avoidance rule | System prompt forbids tool calls for simple questions/greetings |
| Context minification | Local whitespace/newline compression of context files before injection |
| Relevance pruning | Only history messages sharing keywords with the current prompt are kept |
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
