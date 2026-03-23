import {
  saveEntry, loadEntry, deleteEntry, entryExists,
  listEntries, listSubfolders, listAllEntries, getAllFolders,
  createFolder, folderExists, moveEntry,
  getAllTags, addTagsToEntry, removeTagFromEntry,
  search, slugify, mergeTags, extractInlineTags,
  journalRoot, getConfig, setConfig
} from './storage.js';

// ── Parse and dispatch a command string ───────────────────────────────────────
// Returns an action object that the UI renders and responds to.
// Shape: { type, ...payload }

export function parseCommand(raw, cwd) {
  const trimmed = raw.trim();
  if (!trimmed) return { type: 'NOOP' };

  const spaceIdx = trimmed.indexOf(' ');
  const cmd = (spaceIdx < 0 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase();
  const args = spaceIdx < 0 ? '' : trimmed.slice(spaceIdx + 1).trim();

  switch (cmd) {
    case 'help':     return cmdHelp();
    case 'new':      return cmdNew(args, cwd);
    case 'edit':     return cmdEdit(args, cwd);
    case 'ls':
    case 'dir':      return cmdLs(args, cwd);
    case 'cat':
    case 'view':
    case 'read':     return cmdCat(args, cwd);
    case 'rm':
    case 'delete':   return cmdRm(args, cwd);
    case 'mkdir':    return cmdMkdir(args, cwd);
    case 'cd':       return cmdCd(args, cwd);
    case 'folders':  return cmdFolders();
    case 'search':   return cmdSearch(args, cwd);
    case 'tags':     return cmdTags();
    case 'tag':      return cmdTag(args, cwd);
    case 'untag':    return cmdUntag(args, cwd);
    case 'mv':       return cmdMv(args, cwd);
    case 'clear':    return { type: 'CLEAR' };
    case 'exit':
    case 'quit':
    case 'q':        return { type: 'EXIT' };
    default:         return { type: 'ERROR', message: `unknown command: ${cmd} — type "help" to see all commands` };
  }
}

// ── Command handlers ──────────────────────────────────────────────────────────

function cmdHelp() {
  return {
    type: 'HELP',
    sections: [
      {
        title: 'entries',
        commands: [
          ['new <name>',          'create a new entry'],
          ['edit <name>',         'edit an existing entry'],
          ['ls',                  'list entries in current folder'],
          ['ls -t <tag>',         'filter entries by tag'],
          ['ls -t <t1> <t2>',    'filter by multiple tags (AND)'],
          ['cat <name>',          'view an entry'],
          ['rm <name>',           'delete an entry'],
        ]
      },
      {
        title: 'folders',
        commands: [
          ['mkdir <name>',        'create a new folder'],
          ['cd <folder>',         'enter a folder'],
          ['cd ..',               'go up a level'],
          ['cd',                  'go back to root'],
          ['folders',             'list all folders'],
        ]
      },
      {
        title: 'search',
        commands: [
          ['search <query>',      'full-text search all entries'],
          ['search -t <tag>',     'search by tag across all folders'],
          ['search -f <query>',   'search in current folder only'],
        ]
      },
      {
        title: 'tags',
        commands: [
          ['tags',                'list all tags with counts'],
          ['tag <name> <tags>',   'add tags to an entry'],
          ['untag <name> <tag>',  'remove a tag from an entry'],
        ]
      },
      {
        title: 'other',
        commands: [
          ['config dir <path>',   'change where journal files are saved'],
          ['config show',         'show current config'],
          ['clear',               'clear screen, keep banner'],
          ['exit',                'exit the journal'],
        ]
      }
    ]
  };
}

function cmdNew(args, cwd) {
  if (!args) return { type: 'ERROR', message: 'usage: new <entry-name>' };
  const name = slugify(args);
  if (!name) return { type: 'ERROR', message: 'invalid entry name' };
  if (entryExists(cwd, name)) return { type: 'ERROR', message: `"${name}" already exists — use: edit ${name}` };
  return { type: 'OPEN_EDITOR', mode: 'new', name, folder: cwd, initialBody: '', initialTags: [] };
}

function cmdEdit(args, cwd) {
  if (!args) return { type: 'ERROR', message: 'usage: edit <entry-name>' };
  const name = slugify(args);
  const entry = loadEntry(cwd, name);
  if (!entry) return { type: 'ERROR', message: `"${name}" not found — use: new ${name}` };
  return { type: 'OPEN_EDITOR', mode: 'edit', name, folder: cwd, initialBody: entry.body, initialTags: entry.tags || [] };
}

function cmdLs(args, cwd) {
  let filterTags = [];
  if (args) {
    const parts = args.trim().split(/\s+/);
    if (parts[0] === '-t') {
      filterTags = parts.slice(1).map(t => t.replace(/^#/, '').toLowerCase()).filter(Boolean);
      if (!filterTags.length) return { type: 'ERROR', message: 'usage: ls -t <tag>' };
    } else {
      return { type: 'ERROR', message: `unknown option: ${parts[0]} — try: ls -t <tag>` };
    }
  }

  const allEntries = listEntries(cwd);
  const entries = filterTags.length
    ? allEntries.filter(e => filterTags.every(ft => mergeTags(e.tags || [], extractInlineTags(e.body || '')).includes(ft)))
    : allEntries;

  const subfolders = filterTags.length ? [] : listSubfolders(cwd);

  return { type: 'LS', cwd, entries, subfolders, filterTags };
}

function cmdCat(args, cwd) {
  if (!args) return { type: 'ERROR', message: 'usage: cat <entry-name>' };
  const name = slugify(args);
  const entry = loadEntry(cwd, name);
  if (!entry) return { type: 'ERROR', message: `"${name}" not found` };
  return { type: 'CAT', entry };
}

function cmdRm(args, cwd) {
  if (!args) return { type: 'ERROR', message: 'usage: rm <entry-name>' };
  const name = slugify(args);
  if (!entryExists(cwd, name)) return { type: 'ERROR', message: `"${name}" not found` };
  return { type: 'CONFIRM_DELETE', name, folder: cwd };
}

function cmdMkdir(args, cwd) {
  if (!args) return { type: 'ERROR', message: 'usage: mkdir <folder-name>' };
  const name = slugify(args);
  if (!name) return { type: 'ERROR', message: 'invalid folder name' };
  const ok = createFolder(cwd, name);
  if (!ok) return { type: 'ERROR', message: `folder "${name}" already exists` };
  return { type: 'SUCCESS', message: `created folder: ${name}` };
}

function cmdCd(args, cwd) {
  if (!args || args === '~' || args === '/') {
    return { type: 'CD', newCwd: '/' };
  }
  if (args === '..') {
    if (cwd === '/') return { type: 'WARN', message: 'already at root' };
    const parts = cwd.split('/').filter(Boolean);
    parts.pop();
    return { type: 'CD', newCwd: parts.length === 0 ? '/' : '/' + parts.join('/') };
  }
  const name = slugify(args);
  const target = cwd === '/' ? '/' + name : cwd + '/' + name;
  if (!folderExists(target)) return { type: 'ERROR', message: `folder "${name}" not found` };
  return { type: 'CD', newCwd: target };
}

function cmdFolders() {
  const folders = getAllFolders();
  const counts = folders.map(f => ({
    folder: f,
    count: listEntries(f).length
  }));
  return { type: 'FOLDERS', folders: counts };
}

function cmdSearch(args, cwd) {
  if (!args) return { type: 'ERROR', message: 'usage: search <query> | search -t <tag> | search -f <query>' };
  const parts = args.match(/^(-[tf])\s+(.+)$/) || [null, null, args];
  const flag = parts[1];
  const query = (parts[2] || args).trim();

  let results, mode, label;

  if (flag === '-t') {
    mode = 'tag';
    label = `#${query.replace(/^#/, '')}`;
    results = search(query, { tagOnly: true });
  } else if (flag === '-f') {
    mode = 'folder';
    label = `"${query}" in current folder`;
    results = search(query, { folderOnly: cwd });
  } else {
    mode = 'text';
    label = `"${query}"`;
    results = search(query);
  }

  return { type: 'SEARCH', results, mode, query, label };
}

function cmdTags() {
  const tags = getAllTags();
  return { type: 'TAGS', tags };
}

function cmdTag(args, cwd) {
  if (!args) return { type: 'ERROR', message: 'usage: tag <entry-name> <tag1, tag2, ...>' };
  const match = args.match(/^(\S+)\s+(.+)$/);
  if (!match) return { type: 'ERROR', message: 'usage: tag <entry-name> <tag1, tag2, ...>' };
  const name = slugify(match[1]);
  const newTags = match[2].split(',').map(t => t.trim().replace(/^#/, '').toLowerCase()).filter(Boolean);
  const result = addTagsToEntry(cwd, name, newTags);
  if (!result) return { type: 'ERROR', message: `"${name}" not found` };
  return { type: 'TAGGED', name, tags: result.tags || [] };
}

function cmdUntag(args, cwd) {
  if (!args) return { type: 'ERROR', message: 'usage: untag <entry-name> <tag>' };
  const [name, tag] = args.trim().split(/\s+/);
  if (!tag) return { type: 'ERROR', message: 'usage: untag <entry-name> <tag>' };
  const result = removeTagFromEntry(cwd, slugify(name), tag);
  if (!result) return { type: 'ERROR', message: `"${name}" not found` };
  return { type: 'SUCCESS', message: `removed #${tag.replace(/^#/, '')} from ${name}` };
}

function cmdMv(args, cwd) {
  if (!args) return { type: 'ERROR', message: 'usage: mv <entry> <dest-folder>  or  mv <folder>/<entry> <dest-folder>' };
  const parts = args.trim().split(/\s+/);
  if (parts.length < 2) return { type: 'ERROR', message: 'usage: mv <entry> <dest-folder>' };

  const dest = parts[parts.length - 1];
  const src = parts.slice(0, parts.length - 1).join(' ');

  // Parse source: may be "folder/entry" or just "entry" (use cwd)
  let srcFolder, entryName;
  if (src.includes('/')) {
    const idx = src.lastIndexOf('/');
    const rawFolder = src.slice(0, idx);
    entryName = slugify(src.slice(idx + 1));
    srcFolder = rawFolder === '' || rawFolder === '~' ? '/' : '/' + rawFolder.replace(/^~?\/?/, '');
  } else {
    srcFolder = cwd;
    entryName = slugify(src);
  }

  const destFolder = dest === '/' || dest === '~' ? '/' : '/' + dest.replace(/^~?\/?/, '').replace(/\/$/, '');

  if (!entryName) return { type: 'ERROR', message: 'invalid entry name' };

  const result = moveEntry(srcFolder, entryName, destFolder);
  if (!result.ok) {
    if (result.reason === 'not_found') return { type: 'ERROR', message: `"${entryName}" not found in ${srcFolder === '/' ? '~/' : '~' + srcFolder + '/'}` };
    if (result.reason === 'exists') return { type: 'ERROR', message: `"${entryName}" already exists in destination` };
  }
  const fromLabel = srcFolder === '/' ? '~/' : '~' + srcFolder + '/';
  const toLabel = destFolder === '/' ? '~/' : '~' + destFolder + '/';
  return { type: 'SUCCESS', message: `moved: ${fromLabel}${entryName}  →  ${toLabel}${entryName}` };
}

function cmdConfig(args) {
  if (!args || args === 'show') {
    const cfg = getConfig();
    return { type: 'CONFIG_SHOW', config: cfg, journalRoot: journalRoot() };
  }
  const parts = args.trim().split(/\s+/);
  if (parts[0] === 'dir' && parts[1]) {
    setConfig('journalDir', parts.slice(1).join(' '));
    return { type: 'SUCCESS', message: `journal directory set to: ${parts.slice(1).join(' ')}` };
  }
  return { type: 'ERROR', message: 'usage: config show | config dir <path>' };
}

// ── Tab completion data ───────────────────────────────────────────────────────
// Returns sorted list of completions for the current input token.

export const ALL_COMMANDS = [
  'new', 'edit', 'ls', 'cat', 'mv', 'rm', 'mkdir', 'cd',
  'folders', 'search', 'tags', 'tag', 'untag', 'config', 'clear', 'help', 'exit'
];

// Which argument position each command completes, and what kind
// position 1 = first arg, 'entry' | 'folder' | 'entry_or_folder' | 'tag' | null
export const COMPLETION_MAP = {
  edit:   { 1: 'entry' },
  cat:    { 1: 'entry' },
  rm:     { 1: 'entry' },
  tag:    { 1: 'entry' },
  untag:  { 1: 'entry', 2: 'tag' },
  mv:     { 1: 'entry', 2: 'folder' },
  cd:     { 1: 'folder' },
  mkdir:  { 1: 'folder' },
  'search': { 1: null },
  'search -t': { 1: 'tag' },
};
