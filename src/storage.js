import fs from 'fs';
import path from 'path';
import os from 'os';
import matter from 'gray-matter';

// ── Journal root directory ────────────────────────────────────────────────────
// Default: ~/.journal  (can be overridden by JOURNAL_DIR env var or config file)

const CONFIG_PATH = path.join(os.homedir(), '.journal-config.json');

function getJournalRoot() {
  if (process.env.JOURNAL_DIR) return process.env.JOURNAL_DIR;
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (cfg.journalDir) return cfg.journalDir;
  } catch (_) {}
  return path.join(os.homedir(), '.journal');
}

export function journalRoot() {
  return getJournalRoot();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function slugify(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-_]/g, '');
}

function entryPath(folder, name) {
  const root = journalRoot();
  const folderPath = folder === '/' ? root : path.join(root, folder.replace(/^\//, ''));
  return path.join(folderPath, `${name}.md`);
}

function folderPath(folder) {
  const root = journalRoot();
  return folder === '/' ? root : path.join(root, folder.replace(/^\//, ''));
}

function formatDate() {
  return new Date().toLocaleString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short',
    day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function extractInlineTags(body) {
  const matches = body.match(/#([a-zA-Z0-9_]+)/g) || [];
  return matches.map(t => t.slice(1).toLowerCase());
}

function mergeTags(a, b) {
  return [...new Set([...a, ...b])];
}

// ── Entry CRUD ────────────────────────────────────────────────────────────────

export function saveEntry(folder, name, body, tags = []) {
  const root = journalRoot();
  ensureDir(root);
  const fp = folderPath(folder);
  ensureDir(fp);

  const filePath = entryPath(folder, name);
  const now = formatDate();
  const inlineTags = extractInlineTags(body);
  const allTags = mergeTags(tags, inlineTags);

  let created = now;
  // preserve original created date if entry already exists
  if (fs.existsSync(filePath)) {
    try {
      const existing = matter(fs.readFileSync(filePath, 'utf8'));
      created = existing.data.created || now;
    } catch (_) {}
  }

  const fileContent = matter.stringify(body, {
    created,
    updated: now,
    tags: allTags,
  });

  fs.writeFileSync(filePath, fileContent, 'utf8');
  return { name, created, updated: now, tags: allTags };
}

export function loadEntry(folder, name) {
  const filePath = entryPath(folder, name);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = matter(raw);
  return {
    name,
    folder,
    body: parsed.content.trim(),
    created: parsed.data.created || '',
    updated: parsed.data.updated || parsed.data.created || '',
    tags: parsed.data.tags || [],
  };
}

export function deleteEntry(folder, name) {
  const filePath = entryPath(folder, name);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}

export function entryExists(folder, name) {
  return fs.existsSync(entryPath(folder, name));
}

// ── Listing ───────────────────────────────────────────────────────────────────

export function listEntries(folder) {
  const fp = folderPath(folder);
  if (!fs.existsSync(fp)) return [];
  const files = fs.readdirSync(fp).filter(f => f.endsWith('.md'));
  return files.map(f => {
    const name = f.replace(/\.md$/, '');
    return loadEntry(folder, name);
  }).filter(Boolean).sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
}

export function listSubfolders(folder) {
  const fp = folderPath(folder);
  if (!fs.existsSync(fp)) return [];
  return fs.readdirSync(fp)
    .filter(f => {
      const full = path.join(fp, f);
      return fs.statSync(full).isDirectory();
    })
    .sort();
}

export function listAllEntries() {
  const root = journalRoot();
  ensureDir(root);
  const results = [];

  function walk(dir, virtualFolder) {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir);
    items.forEach(item => {
      const full = path.join(dir, item);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        const subFolder = virtualFolder === '/' ? '/' + item : virtualFolder + '/' + item;
        walk(full, subFolder);
      } else if (item.endsWith('.md')) {
        const name = item.replace(/\.md$/, '');
        const entry = loadEntry(virtualFolder, name);
        if (entry) results.push(entry);
      }
    });
  }

  walk(root, '/');
  return results;
}

// ── Folders ───────────────────────────────────────────────────────────────────

export function createFolder(folder, name) {
  const newPath = folder === '/' ? path.join(journalRoot(), name) : path.join(folderPath(folder), name);
  if (fs.existsSync(newPath)) return false;
  fs.mkdirSync(newPath, { recursive: true });
  return true;
}

export function folderExists(folder) {
  return fs.existsSync(folderPath(folder));
}

export function getAllFolders() {
  const root = journalRoot();
  ensureDir(root);
  const folders = ['/'];

  function walk(dir, virtualFolder) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(item => {
      const full = path.join(dir, item);
      if (fs.statSync(full).isDirectory()) {
        const sub = virtualFolder === '/' ? '/' + item : virtualFolder + '/' + item;
        folders.push(sub);
        walk(full, sub);
      }
    });
  }

  walk(root, '/');
  return folders;
}

// ── Tags ──────────────────────────────────────────────────────────────────────

export function getAllTags() {
  const entries = listAllEntries();
  const counts = {};
  entries.forEach(e => {
    const tags = mergeTags(e.tags || [], extractInlineTags(e.body || ''));
    tags.forEach(t => { counts[t] = (counts[t] || 0) + 1; });
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

export function moveEntry(srcFolder, name, destFolder) {
  const root = journalRoot();
  // ensure dest folder exists
  const destPath = destFolder === '/' ? root : path.join(root, destFolder.replace(/^\//, ''));
  ensureDir(destPath);

  const srcFile = entryPath(srcFolder, name);
  const destFile = entryPath(destFolder, name);
  if (!fs.existsSync(srcFile)) return { ok: false, reason: 'not_found' };
  if (fs.existsSync(destFile)) return { ok: false, reason: 'exists' };
  fs.renameSync(srcFile, destFile);
  return { ok: true };
}

export function addTagsToEntry(folder, name, newTags) {
  const entry = loadEntry(folder, name);
  if (!entry) return null;
  const merged = mergeTags(entry.tags || [], newTags.map(t => t.replace(/^#/, '').toLowerCase()));
  return saveEntry(folder, name, entry.body, merged);
}

export function removeTagFromEntry(folder, name, tag) {
  const entry = loadEntry(folder, name);
  if (!entry) return null;
  const t = tag.replace(/^#/, '').toLowerCase();
  const filtered = (entry.tags || []).filter(x => x !== t);
  return saveEntry(folder, name, entry.body, filtered);
}

// ── Search ────────────────────────────────────────────────────────────────────

export function search(query, { tagOnly = false, folderOnly = null } = {}) {
  let entries = listAllEntries();
  if (folderOnly) entries = entries.filter(e => e.folder === folderOnly);

  const q = query.replace(/^#/, '').toLowerCase();

  if (tagOnly) {
    return entries.filter(e => {
      const tags = mergeTags(e.tags || [], extractInlineTags(e.body || ''));
      return tags.includes(q);
    });
  }

  return entries.filter(e => {
    const tags = mergeTags(e.tags || [], extractInlineTags(e.body || ''));
    return (
      e.name.toLowerCase().includes(q) ||
      (e.body || '').toLowerCase().includes(q) ||
      tags.some(t => t.includes(q))
    );
  });
}

// ── Config ────────────────────────────────────────────────────────────────────

export function getConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (_) {
    return { journalDir: path.join(os.homedir(), '.journal') };
  }
}

export function setConfig(key, value) {
  const cfg = getConfig();
  cfg[key] = value;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

export { slugify, formatDate, extractInlineTags, mergeTags };
