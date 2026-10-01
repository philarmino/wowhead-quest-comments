import { decodeHTML } from 'entities';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const root = fileURLToPath(new URL('../', import.meta.url));
export interface RawComment {
  id: number; user: string; body: string; rating: number; date: string;
  deleted?: number; outofdate?: number; indent?: number;
  [key: string]: unknown;
}
export interface RawData {
  schemaVersion: 1; questId: number; sourceUrl: string; fetchedAt: string;
  comments: RawComment[];
}
export interface Comment { id: number; author: string; score: number; text: string; date: string; sourceUrl: string }
export interface ProcessedData extends Omit<RawData, 'comments'> { comments: Comment[] }

export function options() {
  const { values } = parseArgs({ options: {
    quest: { type: 'string', default: '14435' },
    limit: { type: 'string', default: '5' },
    refresh: { type: 'boolean', default: false },
    html: { type: 'string' },
  }});
  const questId = Number(values.quest), limit = Number(values.limit);
  if (!Number.isSafeInteger(questId) || questId <= 0 || !Number.isSafeInteger(limit) || limit <= 0)
    throw new Error('--quest und --limit müssen positive ganze Zahlen sein.');
  return { questId, limit, refresh: values.refresh, html: values.html };
}
export const dataPath = (kind: 'raw' | 'processed', id: number) => resolve(root, 'data', kind, `${id}.json`);
export async function atomicWrite(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, content, 'utf8');
  await rename(temporary, path);
}
export async function readJson(path: string): Promise<unknown> { return JSON.parse(await readFile(path, 'utf8')); }
export function verifyQuestPage(html: string, questId: number) {
  const canonical = html.match(/<link\b[^>]*>/gi)?.find(tag => /rel=["']canonical["']/i.test(tag));
  const href = canonical?.match(/href=["']([^"']+)["']/i)?.[1];
  if (!href) throw new Error('Die Seite enthält keine kanonische Quest-URL.');
  const url = new URL(decodeHTML(href));
  if (url.hostname !== 'www.wowhead.com' || !new RegExp(`^/quest=${questId}(?:/|$)`).test(url.pathname))
    throw new Error('Die HTML-Seite gehört nicht zur angeforderten Retail-Quest.');
}
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function validateRaw(value: unknown, questId: number): asserts value is RawData {
  if (!isObject(value) || value.schemaVersion !== 1 || value.questId !== questId ||
      typeof value.sourceUrl !== 'string' || typeof value.fetchedAt !== 'string' || !Array.isArray(value.comments))
    throw new Error('Ungültige Rohdaten oder falsche Quest-ID.');
  for (const c of value.comments) {
    if (!isObject(c) || !Number.isSafeInteger(c.id) || typeof c.user !== 'string' ||
        typeof c.body !== 'string' || typeof c.rating !== 'number' || !Number.isFinite(c.rating) || typeof c.date !== 'string')
      throw new Error('Unerwartetes Wowhead-Kommentarformat. Bestehende Daten werden nicht ersetzt.');
  }
}

// Read JSON only: never execute JavaScript from a downloaded page.
export function extractComments(html: string): RawComment[] {
  const marker = /\b(?:var|let|const)\s+lv_comments0\s*=\s*/g.exec(html);
  if (!marker) throw new Error('Keine lv_comments0-Daten gefunden (möglicherweise Sperrseite oder geändertes Seitenformat).');
  const start = marker.index + marker[0].length;
  if (html[start] !== '[') throw new Error('Kommentar-Datensatz ist kein JSON-Array.');
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < html.length; i++) {
    const char = html[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '[') depth++;
    else if (char === ']' && --depth === 0) {
      const comments: unknown = JSON.parse(html.slice(start, i + 1));
      const envelope = { schemaVersion: 1, questId: 1, sourceUrl: '', fetchedAt: '', comments };
      validateRaw(envelope, 1);
      return envelope.comments;
    }
  }
  throw new Error('Unvollständiger Kommentar-Datensatz.');
}

export function plainText(body: string): string {
  return decodeHTML(body
    .replace(/\\r\\n|\\n|\\r/g, '\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|div|li)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, '$2 ($1)')
    .replace(/\[(quest|item|npc|spell|object|achievement)=(\d+)[^\]]*\]([\s\S]*?)\[\/\1\]/gi, '$3 (https://www.wowhead.com/$1=$2)')
    .replace(/\[(quest|item|npc|spell|object|achievement)=(\d+)\]/gi, 'https://www.wowhead.com/$1=$2')
    .replace(/\[\*\]/g, '\n• ')
    .replace(/\[\/?(?:b|i|u|s|small|quote|code|ul|ol|li|list|color|size|url)(?:=[^\]]*)?\]/gi, '')
  ).replace(/\r\n?/g, '\n').replace(/[\t ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
export function processComments(raw: RawData, limit: number): ProcessedData {
  const seenIds = new Set<number>(), seenText = new Set<string>();
  const comments: Comment[] = [];
  const sorted = raw.comments.filter(c => !c.deleted && !c.outofdate && !c.indent)
    .sort((a, b) => b.rating - a.rating || a.id - b.id);
  for (const c of sorted) {
    const text = plainText(c.body);
    const key = text.replace(/\s+/g, ' ').toLowerCase();
    if (!text || seenIds.has(c.id) || seenText.has(key)) continue;
    seenIds.add(c.id); seenText.add(key);
    comments.push({ id: c.id, author: c.user, score: c.rating, text, date: c.date,
      sourceUrl: `${raw.sourceUrl}#comments:id=${c.id}` });
    if (comments.length === limit) break;
  }
  return { ...raw, comments };
}
export function luaString(value: string): string {
  return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    .replace(/\n/g, '\\n').replace(/\r/g, '\\r')
    .replace(/[\x00-\x1f\x7f]/g, c => '\\' + c.charCodeAt(0).toString().padStart(3, '0')) + '"';
}
export function generateLua(data: ProcessedData): string {
  if (!Number.isSafeInteger(data.questId) || data.questId <= 0 || !Array.isArray(data.comments))
    throw new Error('Ungültige aufbereitete Daten.');
  const lines = ['-- Generated by npm run generate; do not edit manually.', 'WowheadQuestCommentsDB = {', `    [${data.questId}] = {`];
  for (const c of data.comments) {
    if (!Number.isSafeInteger(c.id) || !Number.isFinite(c.score) ||
        [c.author, c.text, c.date, c.sourceUrl].some(v => typeof v !== 'string'))
      throw new Error('Ungültiger aufbereiteter Kommentar.');
    // Escape WoW markup too: comments must not inject texture, link or color codes.
    const display = (s: string) => luaString(s.replace(/\|/g, '||'));
    lines.push('        {', `            id = ${c.id},`, `            score = ${c.score},`,
      `            author = ${display(c.author)},`, `            text = ${display(c.text)},`,
      `            date = ${luaString(c.date)},`, `            sourceUrl = ${luaString(c.sourceUrl)},`, '        },');
  }
  lines.push('    },', '}', '');
  return lines.join('\n');
}
