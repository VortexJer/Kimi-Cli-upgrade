# kimi-cli-upgrade

A local wrapper for the official [Kimi Code CLI](https://moonshotai.github.io/kimi-code/) that adds advanced token-saving features, local context injection, chat history, and an optional `kimi` redirect.

> ⚠️ **Disclaimer**: This project does **not** modify, redistribute, or reverse-engineer the official Kimi CLI. It is an independent Node.js wrapper that calls your existing `kimi` binary.

## Features

- **Local context injection**: Auto-loads `KIMI.md`, `.ai-shared-context.md`, and `.globalcontext.md` from the current directory.
- **Context Caching**: Static context is placed at the very beginning of the prompt to maximize provider-side context caching.
- **Strict no-verbiage**: Forces concise, technical-only responses.
- **Auto-correction loop**: On terminal errors, retries with compressed prompts and error-tail filtering (last 20 lines).
- **Dynamic temperature**: Prompt instructs the model to use precision mode during auto-correction.
- **Session pruning**: Keeps only relevant history turns during the auto-fix loop.
- **Arrow-key session selector**: `kimi1 --history` opens a Claude-style interactive picker (Up/Down, Enter, Esc).
- **Plain session table**: `kimi1 --list` shows a compact table when you do not need the picker.
- **Auto-generated session names**: old sessions are renamed from raw prompts to concise topic titles based on the first message.
- **Optional `kimi` redirect**: Activate/deactivate full `kimi` → `kimi1` redirection at any time.
- **Visual formatting**: Colored output and clean tables via `chalk` and `cli-table3`.

## Requirements

- Node.js >= 14
- Official Kimi Code CLI already installed (`kimi` command available)

## Installation

### Windows (PowerShell)

```powershell
git clone https://github.com/YOUR_USERNAME/kimi-cli-upgrade.git
cd kimi-cli-upgrade
.\install.ps1
```

Restart PowerShell, then run:

```powershell
kimi1 --help
```

### Linux / macOS

```bash
git clone https://github.com/YOUR_USERNAME/kimi-cli-upgrade.git
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

# Rename old sessions using AI (reads first prompt, asks Kimi for a title)
kimi1 --rename-sessions (-rs)

# Dry-run without calling the API
kimi1 --dry-run (-dr) "your prompt"

# Redirect "kimi" to "kimi1" / restore original
kimi1 --enable-kimi (-e)
kimi1 --disable-kimi (-d)

# Uninstall
kimi1 --uninstall (-u)

# Help
kimi1 --help (-he)
```

## How it works

1. `kimi1` reads local context files in the current directory.
2. It injects that context at the top of the system prompt.
3. It forwards the enriched prompt to your official `kimi` binary.
4. In interactive/resume modes it temporarily installs a local skill so Kimi loads the context natively.
5. When the session ends, the temporary skill is cleaned up.

## Optional: redirect `kimi` to `kimi1`

After installation you can make every `kimi` call go through the wrapper:

```powershell
kimi1 --enable-kimi
kimi1 --e-k        # short alias
```

To restore the original `kimi` behavior:

```powershell
kimi1 --disable-kimi
kimi1 --d-k        # short alias
```

Remember to restart your shell after enabling/disabling.

## Token-saving architecture

| Technique | How it is implemented |
|-----------|----------------------|
| Context Caching | `KIMI.md` + shared context placed at the start of every prompt |
| Context minification | Local whitespace/newline compression of context files before injection |
| Relevance pruning | Only history messages sharing keywords with the current prompt are kept |
| Payload guard | System prompt forbids reading binary/multimedia/dependency bytes |
| Error compression | Terminal error output is truncated to the last 20 lines |
| Session pruning | Intermediate successful command logs are dropped from the retry context |
| No-verbiage | Strict system prompt forbids greetings, explanations, and filler text |
| Prompt compression | Auto-fix prompts strip redundant grammar/connectors |
| Dynamic precision | Auto-fix mode instructs the model to use temperature 0.0 behavior |
| Compressed code output | AI returns compact code blocks; wrapper pretty-prints them locally |

## Uninstall

```powershell
kimi1 --uninstall
```

This removes the `kimi1` alias, the optional `kimi` redirect, and the project directory. Backups of your shell profile are created automatically.

## License

MIT
