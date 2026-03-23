#!/usr/bin/env node

// ── Real terminal clear ───────────────────────────────────────────────────────
// Wipe the terminal buffer before Ink takes over so the app always
// starts at the very top of the window.
process.stdout.write('\x1Bc');   // full reset (xterm / Windows Terminal)
process.stdout.write('\x1B[2J\x1B[0f'); // fallback: erase + cursor home

import React, { useState, useCallback, useRef, createElement as h } from 'react';
import { Box, Text, useInput, useApp, render } from 'ink';
import TextInput from 'ink-text-input';
import { parseCommand, ALL_COMMANDS, COMPLETION_MAP } from './commands.js';
import { saveEntry, deleteEntry, mergeTags, extractInlineTags,
         listEntries, listSubfolders, getAllTags } from './storage.js';

// ── Banner ────────────────────────────────────────────────────────────────────
// Hooked J (reads clearly as J not I) — full bright amber throughout
const BANNER_LINES = [
  '   ██╗ ██████╗ ██╗   ██╗██████╗ ███╗   ██╗ █████╗ ██╗',
  '   ██║ ██╔═══██╗██║   ██║██╔══██╗████╗  ██║██╔══██╗██║',
  '   ██║ ██║   ██║██║   ██║██████╔╝██╔██╗ ██║███████║██║',
  '██ ██║ ██║   ██║██║   ██║██╔══██╗██║╚██╗██║██╔══██║██║',
  '╚█████╔╝╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║██║  ██║███████╗',
  ' ╚════╝  ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝',
];

function Banner() {
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  return h(Box, { flexDirection: 'column', marginBottom: 1 },
    ...BANNER_LINES.map((line, i) => h(Text, { key: i, color: 'yellow' }, line)),
    h(Box, { marginTop: 1 },
      h(Text, { color: 'yellow' }, '  terminal journal  ·  '),
      h(Text, { color: 'yellow', dimColor: true }, date)
    )
  );
}

// ── Output blocks ─────────────────────────────────────────────────────────────

function PromptLine({ cwd, cmd }) {
  const label = cwd === '/' ? '~' : '~' + cwd;
  return h(Box, null,
    h(Text, { color: 'green', dimColor: true }, `journal ${label}/> `),
    h(Text, { color: 'green' }, cmd)
  );
}

function OutputBlock({ action }) {
  switch (action.type) {

    case 'HELP':
      return h(Box, { flexDirection: 'column', marginY: 1, paddingLeft: 2 },
        ...action.sections.map(sec =>
          h(Box, { key: sec.title, flexDirection: 'column', marginBottom: 1 },
            h(Text, { color: 'yellow', bold: true }, `── ${sec.title} ──`),
            ...sec.commands.map(([cmd, desc]) =>
              h(Box, { key: cmd },
                h(Text, { color: 'cyan' }, cmd.padEnd(28)),
                h(Text, { color: 'gray' }, desc)
              )
            )
          )
        )
      );

    case 'LS': {
      const { cwd, entries, subfolders, filterTags } = action;
      const label = cwd === '/' ? '~' : '~' + cwd;
      return h(Box, { flexDirection: 'column', marginY: 1, paddingLeft: 2 },
        filterTags.length
          ? h(Box, null,
              h(Text, { color: 'yellow' }, `${label}/  `),
              h(Text, { color: 'gray' }, 'filtered by '),
              ...filterTags.map(t => h(Text, { key: t, color: 'magenta' }, ` #${t}`))
            )
          : h(Text, { color: 'yellow', bold: true }, `contents of ${label}/`),
        h(Box, { marginTop: 1, flexDirection: 'column' },
          (!subfolders.length && !entries.length)
            ? h(Text, { color: 'gray' }, filterTags.length ? 'no entries with those tags' : '(empty)')
            : null,
          ...subfolders.map(f =>
            h(Box, { key: f }, h(Text, { color: 'yellow' }, `📁 ${f}/`))
          ),
          ...entries.map(e => {
            const tags = mergeTags(e.tags || [], extractInlineTags(e.body || ''));
            return h(Box, { key: e.name, flexDirection: 'column' },
              h(Box, null,
                h(Text, { color: 'cyan' }, `📄 ${e.name.padEnd(24)}`),
                h(Text, { color: 'gray', dimColor: true }, e.updated || e.created)
              ),
              tags.length > 0
                ? h(Box, { paddingLeft: 4 },
                    ...tags.map(t =>
                      h(Text, { key: t, color: filterTags.includes(t) ? 'green' : 'magenta' }, ` #${t}`)
                    )
                  )
                : null
            );
          }),
          filterTags.length && entries.length
            ? h(Box, { marginTop: 1 },
                h(Text, { color: 'gray' }, `${entries.length} entr${entries.length !== 1 ? 'ies' : 'y'} matched`)
              )
            : null
        )
      );
    }

    case 'CAT': {
      const { entry } = action;
      const tags = mergeTags(entry.tags || [], extractInlineTags(entry.body || ''));
      const bodyLines = (entry.body || '').split('\n');
      return h(Box, { flexDirection: 'column', marginY: 1, paddingLeft: 2 },
        h(Text, { color: 'yellow', bold: true }, `┌─ ${entry.name}`),
        h(Text, { color: 'gray', dimColor: true }, `│  created: ${entry.created}`),
        entry.updated !== entry.created
          ? h(Text, { color: 'gray', dimColor: true }, `│  updated: ${entry.updated}`)
          : null,
        tags.length > 0
          ? h(Box, null,
              h(Text, { color: 'gray', dimColor: true }, '│  '),
              h(Text, { color: 'magenta' }, 'tags: '),
              ...tags.map(t => h(Text, { key: t, color: 'magenta' }, `#${t}  `))
            )
          : null,
        h(Text, { color: 'gray', dimColor: true }, '│'),
        ...bodyLines.map((line, i) => {
          const parts = line.split(/(#[a-zA-Z0-9_]+)/g);
          return h(Box, { key: i },
            h(Text, { color: 'gray', dimColor: true }, '│  '),
            ...parts.map((part, j) =>
              part.startsWith('#')
                ? h(Text, { key: j, color: 'magenta' }, part)
                : h(Text, { key: j, color: 'white' }, part)
            )
          );
        }),
        h(Text, { color: 'gray', dimColor: true }, '└' + '─'.repeat(44))
      );
    }

    case 'SEARCH': {
      const { results, mode, query, label } = action;
      return h(Box, { flexDirection: 'column', marginY: 1, paddingLeft: 2 },
        h(Box, null,
          h(Text, { color: 'yellow' }, 'search: '),
          h(Text, { color: mode === 'tag' ? 'magenta' : 'cyan' }, label)
        ),
        results.length === 0
          ? h(Text, { color: 'gray' }, 'no results found')
          : h(Box, { flexDirection: 'column', marginTop: 1 },
              h(Text, { color: 'green' }, `${results.length} result${results.length !== 1 ? 's' : ''} found`),
              ...results.map(e => {
                const loc = e.folder === '/' ? '~/' : '~' + e.folder + '/';
                const tags = mergeTags(e.tags || [], extractInlineTags(e.body || ''));
                const q = query.replace(/^#/, '').toLowerCase();
                const body = e.body || '';
                const idx = body.toLowerCase().indexOf(q);
                const snip = idx < 0
                  ? body.slice(0, 80).replace(/\n/g, ' ')
                  : (idx > 20 ? '…' : '') + body.slice(Math.max(0, idx - 20), idx + 80).replace(/\n/g, ' ') + '…';
                return h(Box, { key: e.name + e.folder, flexDirection: 'column', marginTop: 1 },
                  h(Box, null,
                    h(Text, { color: 'cyan' }, `📄 ${e.name}  `),
                    h(Text, { color: 'gray', dimColor: true }, loc)
                  ),
                  tags.length > 0
                    ? h(Box, { paddingLeft: 3 },
                        ...tags.map(t => h(Text, { key: t, color: 'magenta' }, `#${t}  `))
                      )
                    : null,
                  mode === 'text' && snip
                    ? h(Box, { paddingLeft: 3 }, h(Text, { color: 'gray' }, snip))
                    : null
                );
              })
            )
      );
    }

    case 'TAGS': {
      const { tags } = action;
      const max = tags.length ? tags[0][1] : 1;
      return h(Box, { flexDirection: 'column', marginY: 1, paddingLeft: 2 },
        h(Text, { color: 'yellow', bold: true }, 'all tags'),
        h(Box, { marginTop: 1, flexDirection: 'column' },
          tags.length === 0 ? h(Text, { color: 'gray' }, 'no tags yet') : null,
          ...tags.map(([tag, count]) => {
            const bar = '█'.repeat(Math.round((count / max) * 20));
            return h(Box, { key: tag },
              h(Text, { color: 'magenta' }, `#${tag}`.padEnd(22)),
              h(Text, { color: 'gray', dimColor: true }, bar.padEnd(21)),
              h(Text, { color: 'gray' }, String(count))
            );
          })
        )
      );
    }

    case 'FOLDERS':
      return h(Box, { flexDirection: 'column', marginY: 1, paddingLeft: 2 },
        h(Text, { color: 'yellow', bold: true }, 'all folders'),
        h(Box, { marginTop: 1, flexDirection: 'column' },
          ...action.folders.map(({ folder, count }) => {
            const label = folder === '/' ? '~/' : '~' + folder + '/';
            return h(Box, { key: folder },
              h(Text, { color: 'yellow' }, `📁 ${label.padEnd(28)}`),
              h(Text, { color: 'gray' }, `${count} entr${count !== 1 ? 'ies' : 'y'}`)
            );
          })
        )
      );

    case 'TAGGED':
      return h(Box, { marginY: 1, paddingLeft: 2 },
        h(Text, { color: 'cyan' }, `${action.name}  `),
        ...action.tags.map(t => h(Text, { key: t, color: 'magenta' }, `#${t}  `))
      );

    case 'CONFIG_SHOW':
      return h(Box, { flexDirection: 'column', marginY: 1, paddingLeft: 2 },
        h(Text, { color: 'yellow', bold: true }, 'config'),
        h(Box, { marginTop: 1 },
          h(Text, { color: 'cyan' }, 'journal dir'.padEnd(20)),
          h(Text, { color: 'white' }, action.journalRoot)
        )
      );

    case 'SUCCESS':
      return h(Box, { paddingLeft: 2, marginY: 1 },
        h(Text, { color: 'green' }, `✓ ${action.message}`)
      );

    case 'WARN':
      return h(Box, { paddingLeft: 2, marginY: 1 },
        h(Text, { color: 'yellow' }, action.message)
      );

    case 'ERROR':
      return h(Box, { paddingLeft: 2, marginY: 1 },
        h(Text, { color: 'red' }, action.message)
      );

    case 'SAVE_CONFIRM':
      return h(Box, { flexDirection: 'column', paddingLeft: 2, marginY: 1 },
        h(Text, { color: 'green' }, `✓ saved: ${action.name}`),
        h(Text, { color: 'gray', dimColor: true }, `  date:  ${action.updated}`),
        action.tags.length > 0
          ? h(Box, null,
              h(Text, { color: 'gray', dimColor: true }, '  tags:  '),
              ...action.tags.map(t => h(Text, { key: t, color: 'magenta' }, `#${t}  `))
            )
          : null
      );

    case 'DELETE_CONFIRM':
      return h(Box, { paddingLeft: 2, marginY: 1 },
        h(Text, { color: 'yellow' }, `deleted: ${action.name}`)
      );

    default:
      return null;
  }
}

// ── Multi-line Editor ─────────────────────────────────────────────────────────
// Manages an array of lines. Enter = new line. Backspace at col 0 = join lines.
// Ctrl+S = save. Esc = discard. Tab = switch to tags field.

function MultilineEditor({ name, initialBody, initialTags, onSave, onDiscard }) {
  const [lines, setLines] = useState(() => {
    const ls = initialBody ? initialBody.split('\n') : [''];
    return ls.length ? ls : [''];
  });
  const [cursor, setCursor] = useState({ row: 0, col: 0 });
  const [tagStr, setTagStr] = useState(initialTags.join(', '));
  const [focus, setFocus] = useState('body'); // 'body' | 'tags'

  useInput((input, key) => {
    // ── Save / discard ──
    if (key.ctrl && input === 's') {
      onSave(lines.join('\n'), tagStr);
      return;
    }
    if (key.escape) { onDiscard(); return; }

    // ── Tab: switch focus ──
    if (key.tab) {
      setFocus(f => f === 'body' ? 'tags' : 'body');
      return;
    }

    if (focus !== 'body') return;

    // ── Navigation ──
    if (key.upArrow) {
      setCursor(c => {
        const row = Math.max(0, c.row - 1);
        const col = Math.min(c.col, lines[row].length);
        return { row, col };
      });
      return;
    }
    if (key.downArrow) {
      setCursor(c => {
        const row = Math.min(lines.length - 1, c.row + 1);
        const col = Math.min(c.col, lines[row].length);
        return { row, col };
      });
      return;
    }
    if (key.leftArrow) {
      setCursor(c => {
        if (c.col > 0) return { row: c.row, col: c.col - 1 };
        if (c.row > 0) return { row: c.row - 1, col: lines[c.row - 1].length };
        return c;
      });
      return;
    }
    if (key.rightArrow) {
      setCursor(c => {
        if (c.col < lines[c.row].length) return { row: c.row, col: c.col + 1 };
        if (c.row < lines.length - 1) return { row: c.row + 1, col: 0 };
        return c;
      });
      return;
    }

    // ── Enter: new line ──
    if (key.return) {
      setLines(ls => {
        const next = [...ls];
        const before = next[cursor.row].slice(0, cursor.col);
        const after = next[cursor.row].slice(cursor.col);
        next.splice(cursor.row, 1, before, after);
        return next;
      });
      setCursor(c => ({ row: c.row + 1, col: 0 }));
      return;
    }

    // ── Backspace ──
    if (key.backspace || key.delete) {
      setLines(ls => {
        const next = [...ls];
        if (cursor.col > 0) {
          next[cursor.row] = next[cursor.row].slice(0, cursor.col - 1) + next[cursor.row].slice(cursor.col);
          setCursor(c => ({ ...c, col: c.col - 1 }));
        } else if (cursor.row > 0) {
          const prevLen = next[cursor.row - 1].length;
          next[cursor.row - 1] = next[cursor.row - 1] + next[cursor.row];
          next.splice(cursor.row, 1);
          setCursor({ row: cursor.row - 1, col: prevLen });
        }
        return next;
      });
      return;
    }

    // ── Printable characters ──
    if (input && !key.ctrl && !key.meta) {
      setLines(ls => {
        const next = [...ls];
        next[cursor.row] = next[cursor.row].slice(0, cursor.col) + input + next[cursor.row].slice(cursor.col);
        return next;
      });
      setCursor(c => ({ ...c, col: c.col + input.length }));
    }
  });

  const ts = new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  return h(Box, { flexDirection: 'column', borderStyle: 'round', borderColor: 'yellow', paddingX: 1 },
    // Header
    h(Box, { justifyContent: 'space-between', marginBottom: 1 },
      h(Text, { color: 'yellow', bold: true }, name),
      h(Text, { color: 'gray', dimColor: true }, ts)
    ),
    // Body label
    h(Text, { color: focus === 'body' ? 'white' : 'gray', dimColor: focus !== 'body' },
      `── entry ${focus === 'body' ? '(editing)' : '(Tab to edit)'}`
    ),
    // Body lines
    h(Box, { flexDirection: 'column', paddingLeft: 2, marginBottom: 1 },
      ...lines.map((line, rowIdx) => {
        const isActiveLine = focus === 'body' && rowIdx === cursor.row;
        // Render line with cursor
        if (isActiveLine) {
          const before = line.slice(0, cursor.col);
          const cursorChar = line[cursor.col] || ' ';
          const after = line.slice(cursor.col + 1);
          return h(Box, { key: rowIdx },
            h(Text, { color: 'white' }, before),
            h(Text, { backgroundColor: 'white', color: 'black' }, cursorChar),
            h(Text, { color: 'white' }, after)
          );
        }
        return h(Text, { key: rowIdx, color: 'white', dimColor: true },
          line || ' '
        );
      })
    ),
    // Tags label
    h(Text, { color: focus === 'tags' ? 'magenta' : 'gray', dimColor: focus !== 'tags' },
      `── tags ${focus === 'tags' ? '(editing)' : '(Tab to edit)'}`
    ),
    // Tags input
    h(Box, { paddingLeft: 2, marginBottom: 1 },
      h(TextInput, {
        value: tagStr,
        onChange: setTagStr,
        focus: focus === 'tags',
        showCursor: focus === 'tags',
        placeholder: 'work, ideas, personal  (comma-separated)'
      })
    ),
    // Footer hints
    h(Text, { color: 'gray', dimColor: true },
      '  Ctrl+S save  ·  Esc discard  ·  Tab switch field  ·  Enter new line  ·  #hashtags inline'
    )
  );
}

// ── Delete confirm ────────────────────────────────────────────────────────────

function DeleteConfirm({ name, onConfirm, onCancel }) {
  useInput((input, key) => {
    if (input.toLowerCase() === 'y') onConfirm();
    if (input.toLowerCase() === 'n' || key.escape) onCancel();
  });
  return h(Box, { flexDirection: 'column', paddingLeft: 2, marginY: 1 },
    h(Text, { color: 'red' }, `delete "${name}"? `),
    h(Text, { color: 'gray' }, '[y/n]')
  );
}

// ── Tab completion engine ─────────────────────────────────────────────────────

function getCompletions(value, cwd) {
  const parts = value.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const argIdx = parts.length - 1; // which argument we're completing (0 = command itself)

  // Completing the command name
  if (argIdx === 0) {
    return ALL_COMMANDS.filter(c => c.startsWith(cmd));
  }

  const token = parts[argIdx] || '';
  const map = COMPLETION_MAP[cmd];
  if (!map) return [];

  const kind = map[argIdx];
  if (!kind) return [];

  if (kind === 'entry') {
    const entries = listEntries(cwd).map(e => e.name);
    return entries.filter(e => e.startsWith(token));
  }
  if (kind === 'folder') {
    const subs = listSubfolders(cwd);
    const all = ['..', ...subs];
    return all.filter(f => f.startsWith(token));
  }
  if (kind === 'tag') {
    const tags = getAllTags().map(([t]) => t);
    const tok = token.replace(/^#/, '');
    return tags.filter(t => t.startsWith(tok)).map(t => '#' + t);
  }
  return [];
}

function applyCompletion(value, completion) {
  const parts = value.split(/\s+/);
  parts[parts.length - 1] = completion;
  return parts.join(' ');
}

// ── Prompt with tab completion ────────────────────────────────────────────────

function Prompt({ cwd, onSubmit }) {
  const [value, setValue] = useState('');
  const [tabMatches, setTabMatches] = useState([]);
  const [tabIndex, setTabIndex] = useState(-1);
  const label = cwd === '/' ? '~' : '~' + cwd;

  const handleSubmit = useCallback((val) => {
    setValue('');
    setTabMatches([]);
    setTabIndex(-1);
    onSubmit(val);
  }, [onSubmit]);

  useInput((input, key) => {
    if (key.tab) {
      // First tab press — build completion list
      if (tabMatches.length === 0) {
        const matches = getCompletions(value, cwd);
        if (matches.length === 0) return;
        if (matches.length === 1) {
          // Unambiguous — complete immediately
          setValue(applyCompletion(value, matches[0]));
          return;
        }
        // Multiple matches — complete to longest common prefix then start cycling
        const prefix = longestCommonPrefix(matches);
        const withPrefix = applyCompletion(value, prefix);
        setValue(withPrefix);
        setTabMatches(matches);
        setTabIndex(0);
        setValue(applyCompletion(withPrefix, matches[0]));
      } else {
        // Cycle through matches
        const next = (tabIndex + 1) % tabMatches.length;
        setTabIndex(next);
        setValue(applyCompletion(value, tabMatches[next]));
      }
      return;
    }

    // Any non-tab key resets completion cycle
    if (tabMatches.length > 0) {
      setTabMatches([]);
      setTabIndex(-1);
    }
  });

  return h(Box, { flexDirection: 'column' },
    tabMatches.length > 1
      ? h(Box, { paddingLeft: 2, marginBottom: 0 },
          ...tabMatches.map((m, i) =>
            h(Text, { key: m, color: i === tabIndex ? 'greenBright' : 'gray' }, `${m}  `)
          )
        )
      : null,
    h(Box, null,
      h(Text, { color: 'greenBright', dimColor: true }, `journal ${label}/> `),
      h(TextInput, {
        value,
        onChange: (v) => { setValue(v); },
        onSubmit: handleSubmit,
        placeholder: 'type a command...'
      })
    )
  );
}

function longestCommonPrefix(strs) {
  if (!strs.length) return '';
  let prefix = strs[0];
  for (let i = 1; i < strs.length; i++) {
    while (!strs[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (!prefix) return '';
    }
  }
  return prefix;
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const { exit } = useApp();
  const [cwd, setCwd] = useState('/');
  const [history, setHistory] = useState([]);
  const [mode, setMode] = useState('prompt');
  const [editorState, setEditorState] = useState(null);
  const [deleteState, setDeleteState] = useState(null);

  const push = (cmd, action, cwdSnap) =>
    setHistory(prev => [...prev, { cmd, action, cwd: cwdSnap }]);

  const doClear = () => {
    // Wipe real terminal then let Ink redraw from top
    process.stdout.write('\x1Bc');
    process.stdout.write('\x1B[2J\x1B[0f');
    setHistory([]);
  };

  const handleCommand = useCallback((raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const action = parseCommand(trimmed, cwd);

    if (action.type === 'EXIT') { exit(); return; }
    if (action.type === 'CLEAR') { doClear(); return; }

    if (action.type === 'CD') {
      push(trimmed, { type: 'SUCCESS', message: `→ ${action.newCwd === '/' ? '~/' : '~' + action.newCwd + '/'}` }, cwd);
      setCwd(action.newCwd);
      return;
    }
    if (action.type === 'OPEN_EDITOR') {
      setEditorState(action);
      setMode('editor');
      return;
    }
    if (action.type === 'CONFIRM_DELETE') {
      setDeleteState(action);
      setMode('delete');
      push(trimmed, { type: 'WARN', message: `confirm delete "${action.name}" [y/n]` }, cwd);
      return;
    }
    push(trimmed, action, cwd);
  }, [cwd, exit]);

  const handleSave = useCallback((body, tagStr) => {
    if (!editorState) return;
    const tags = tagStr.split(',').map(t => t.trim().replace(/^#/, '').toLowerCase()).filter(Boolean);
    const result = saveEntry(editorState.folder, editorState.name, body, tags);
    setHistory(prev => [...prev, {
      cmd: null,
      action: { type: 'SAVE_CONFIRM', name: editorState.name, updated: result.updated, tags: result.tags || [] },
      cwd
    }]);
    setEditorState(null);
    setMode('prompt');
  }, [editorState, cwd]);

  const handleDiscard = useCallback(() => {
    setHistory(prev => [...prev, { cmd: null, action: { type: 'WARN', message: 'editor closed without saving' }, cwd }]);
    setEditorState(null);
    setMode('prompt');
  }, [cwd]);

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteState) return;
    deleteEntry(deleteState.folder, deleteState.name);
    setHistory(prev => [...prev, { cmd: null, action: { type: 'DELETE_CONFIRM', name: deleteState.name }, cwd }]);
    setDeleteState(null);
    setMode('prompt');
  }, [deleteState, cwd]);

  const handleDeleteCancel = useCallback(() => {
    setHistory(prev => [...prev, { cmd: null, action: { type: 'WARN', message: 'delete cancelled' }, cwd }]);
    setDeleteState(null);
    setMode('prompt');
  }, [cwd]);

  return h(Box, { flexDirection: 'column' },
    h(Banner, null),
    ...history.map((item, i) =>
      h(Box, { key: i, flexDirection: 'column' },
        item.cmd ? h(PromptLine, { cwd: item.cwd, cmd: item.cmd }) : null,
        item.action ? h(OutputBlock, { action: item.action }) : null
      )
    ),
    mode === 'editor' && editorState
      ? h(MultilineEditor, {
          name: editorState.name,
          initialBody: editorState.initialBody,
          initialTags: editorState.initialTags,
          onSave: handleSave,
          onDiscard: handleDiscard
        })
      : null,
    mode === 'delete' && deleteState
      ? h(DeleteConfirm, { name: deleteState.name, onConfirm: handleDeleteConfirm, onCancel: handleDeleteCancel })
      : null,
    mode === 'prompt'
      ? h(Prompt, { cwd, onSubmit: handleCommand })
      : null
  );
}

render(h(App, null));
