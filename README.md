# 📔 Journal — Terminal Journal App

A fast, beautiful terminal journal with folders, tags, full-text search, and automatic date tracking. Your entries are saved as plain Markdown files on your device — readable anywhere, syncable with Dropbox or iCloud.

---

## Install

### One-command install (no Node.js required)

**macOS / Linux:**
```sh
curl -fsSL https://raw.githubusercontent.com/Jack-McGinley/Terminal-Journal/master/install.sh | sh
```

**Windows (PowerShell / Windows Terminal):**
```powershell
irm https://raw.githubusercontent.com/Jack-McGinley/Terminal-Journal/master/install.ps1 | iex
```

### Install from source (requires Node.js 18+)
```sh
git clone https://github.com/YOUR_USERNAME/journal-app.git
cd journal-app
npm install
npm link        # makes 'journal' available globally
```

---

## Launch

```sh
journal
```

Your terminal becomes the journal. Type commands inside it. Type `exit` or press `Ctrl+C` to return to your normal terminal.

---

## Commands

### Entries
| Command | Description |
|---|---|
| `new <name>` | Create a new entry (opens editor) |
| `edit <name>` | Edit an existing entry |
| `ls` | List entries in current folder |
| `ls -t <tag>` | List entries filtered by tag |
| `ls -t <tag1> <tag2>` | Filter by multiple tags (AND) |
| `cat <name>` | View an entry |
| `rm <name>` | Delete an entry (asks to confirm) |

### Folders
| Command | Description |
|---|---|
| `mkdir <name>` | Create a new folder |
| `cd <folder>` | Enter a folder |
| `cd ..` | Go up a level |
| `cd` | Return to root |
| `folders` | List all folders with entry counts |

### Search
| Command | Description |
|---|---|
| `search <query>` | Full-text search across all entries |
| `search -t <tag>` | Search by tag across all folders |
| `search -f <query>` | Search in current folder only |

### Tags
| Command | Description |
|---|---|
| `tags` | List all tags with usage counts |
| `tag <name> <tags>` | Add tags to an entry |
| `untag <name> <tag>` | Remove a tag from an entry |

### Other
| Command | Description |
|---|---|
| `clear` | Clear screen, keep banner and date |
| `config show` | Show where files are being saved |
| `config dir <path>` | Change where files are saved |
| `exit` | Exit back to your regular terminal |

---

## Writing entries

When you run `new my-entry` or `edit my-entry`, the editor opens inside the terminal. You can write freely and use **#hashtags inline** — they're automatically detected as tags when you save.

```
journal ~/> new today

  ── entry (editing)
    Had a great meeting about the new project. #work #ideas

  ── tags (editing)
    work, ideas

  Ctrl+S save  ·  Esc discard  ·  Tab switch field
```

Press **Ctrl+S** to save, **Esc** to discard, **Tab** to switch between the body and the tags field.

---

## Where files are saved

By default entries are saved to `~/.journal/` on your device:

```
~/.journal/
├── my-entry.md
├── today.md
├── work/
│   ├── project-ideas.md
│   └── meeting-notes.md
└── personal/
    └── goals.md
```

Each file is plain Markdown with a small metadata header:

```markdown
---
created: Sat, Mar 22, 2026, 10:30 AM
updated: Sat, Mar 22, 2026, 02:15 PM
tags:
  - work
  - ideas
---

Had a great meeting about the new project. #work #ideas
```

You can open these files in any text editor (VS Code, Obsidian, Notepad — anything).

### Sync across devices

To sync your journal across multiple computers, move the `.journal` folder into Dropbox, iCloud, or OneDrive, then point the app at it:

```sh
journal
journal ~/> config dir ~/Dropbox/.journal
```

Every device running the app with that same path will share entries automatically.

---

## Publishing your own release (for developers)

1. Replace the install script URLs above if you fork this repo.
2. Push to GitHub.
3. Tag a release: `git tag v1.0.0 && git push origin v1.0.0`
4. GitHub Actions automatically builds binaries for macOS (Intel + Apple Silicon), Linux (x64 + ARM), and Windows, and attaches them to the release.
5. Your install scripts will now work for anyone.

---

## Tech stack

- **[Ink](https://github.com/vadimdemedes/ink)** — React for terminal UIs
- **[gray-matter](https://github.com/jonschlinkert/gray-matter)** — Markdown frontmatter parsing
- **[Bun](https://bun.sh)** — Used to compile standalone binaries (no Node.js required for end users)

---

## License

MIT
