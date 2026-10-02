import { decodeHTML } from 'entities';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
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
    quest: { type: 'string' },
    limit: { type: 'string', default: '5' },
    'all-areas': { type: 'boolean', default: false },
    area: { type: 'string', multiple: true },
    expansion: { type: 'string' },
    'full-refresh': { type: 'boolean', default: false },
    'max-requests': { type: 'string' },
    'delay-ms': { type: 'string', default: '2000' },
    concurrency: { type: 'string', default: '1' },
    html: { type: 'string' },
  }});
  const questId = values.quest === undefined ? undefined : Number(values.quest), limit = Number(values.limit);
  const maxRequests = values['max-requests'] === undefined ? undefined : Number(values['max-requests']);
  const delayMs = Number(values['delay-ms']);
  const concurrency = Number(values.concurrency);
  if ((questId !== undefined && (!Number.isSafeInteger(questId) || questId <= 0)) ||
      !Number.isSafeInteger(limit) || limit <= 0 ||
      (maxRequests !== undefined && (!Number.isSafeInteger(maxRequests) || maxRequests <= 0)) ||
      !Number.isSafeInteger(delayMs) || delayMs < 0 ||
      !Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 16)
    throw new Error('--quest, --limit, --max-requests and --concurrency must be positive integers; --delay-ms must be a nonnegative integer.');
  return { questId, limit, allAreas: values['all-areas'], fullRefresh: values['full-refresh'],
    areas: values.area ?? [], expansion: values.expansion,
    maxRequests, delayMs, concurrency, html: values.html };
}
export const dataPath = (kind: 'raw' | 'processed', id: number) => resolve(root, 'data', kind, `${id}.json`);
export async function cachedQuestIds(kind: 'raw' | 'processed'): Promise<number[]> {
  let names: string[];
  try { names = await readdir(resolve(root, 'data', kind)); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return names.filter(name => /^[1-9]\d*\.json$/.test(name))
    .map(name => Number(name.slice(0, -5)))
    .filter(Number.isSafeInteger).sort((a, b) => a - b);
}
export async function questIds(allAreas = false): Promise<number[]> {
  if (allAreas) {
    const source = await readJson(resolve(root, 'scripts/quest-ids.json'));
    if (!isObject(source) || source.schemaVersion !== 1 ||
        !Array.isArray(source.failedAreaIds) || source.failedAreaIds.length ||
        !Array.isArray(source.questIds) || source.questIds.length === 0)
      throw new Error('Invalid or incomplete all-area quest ID list.');
    const ids = source.questIds;
    if (!ids.every(id => Number.isSafeInteger(id) && id > 0) ||
        ids.some((id, index) => index > 0 && id <= ids[index - 1]))
      throw new Error('Invalid or duplicate quest ID in all-area list.');
    return ids;
  }
  const source = await readJson(resolve(root, 'scripts/quests-eschental.json'));
  if (!isObject(source) || !Array.isArray(source.quests)) throw new Error('Invalid Ashenvale quest list.');
  const ids = source.quests.map((quest: unknown) => isObject(quest) ? quest.id : undefined);
  if (!ids.every(id => Number.isSafeInteger(id) && (id as number) > 0) || new Set(ids).size !== ids.length)
    throw new Error('Invalid or duplicate quest ID in the Ashenvale quest list.');
  return [...new Set([14435, ...ids as number[]])].sort((a, b) => a - b);
}
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
  if (!href) throw new Error('The page does not contain a canonical quest URL.');
  const url = new URL(decodeHTML(href));
  if (url.hostname !== 'www.wowhead.com' || !new RegExp(`^/quest=${questId}(?:/|$)`).test(url.pathname))
    throw new Error('The HTML page does not belong to the requested Retail quest.');
}
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function validateRaw(value: unknown, questId: number): asserts value is RawData {
  if (!isObject(value) || value.schemaVersion !== 1 || value.questId !== questId ||
      typeof value.sourceUrl !== 'string' || typeof value.fetchedAt !== 'string' || !Array.isArray(value.comments))
    throw new Error('Invalid raw data or incorrect quest ID.');
  for (const c of value.comments) {
    if (!isObject(c) || !Number.isSafeInteger(c.id) || typeof c.user !== 'string' ||
        typeof c.body !== 'string' || typeof c.rating !== 'number' || !Number.isFinite(c.rating) || typeof c.date !== 'string')
      throw new Error('Unexpected Wowhead comment format. Existing data will not be replaced.');
  }
}

// Read JSON only: never execute JavaScript from a downloaded page.
export function extractComments(html: string): RawComment[] {
  const marker = /\b(?:var|let|const)\s+lv_comments0\s*=\s*/g.exec(html);
  if (!marker) throw new Error('No lv_comments0 data found (possible block page or changed page format).');
  const start = marker.index + marker[0].length;
  if (html[start] !== '[') throw new Error('The comment dataset is not a JSON array.');
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
  throw new Error('Incomplete comment dataset.');
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
export function generateLua(input: ProcessedData | ProcessedData[]): string {
  const datasets = Array.isArray(input) ? input : [input];
  const seen = new Set<number>();
  const lines = ['-- Generated by npm run generate; do not edit manually.', 'local _, ns = ...', 'ns.db = {'];
  for (const data of [...datasets].sort((a, b) => a.questId - b.questId)) {
    if (!Number.isSafeInteger(data.questId) || data.questId <= 0 || !Array.isArray(data.comments) || seen.has(data.questId))
      throw new Error('Invalid or duplicate quest data.');
    seen.add(data.questId);
    lines.push(`    [${data.questId}] = {`);
    for (const c of data.comments) {
      if (!Number.isSafeInteger(c.id) || !Number.isFinite(c.score) ||
          [c.author, c.text, c.date, c.sourceUrl].some(v => typeof v !== 'string'))
        throw new Error('Invalid processed comment.');
      // Escape WoW markup too: comments must not inject texture, link or color codes.
      const display = (s: string) => luaString(s.replace(/\|/g, '||'));
      lines.push('        {', `            id = ${c.id},`, `            score = ${c.score},`,
        `            author = ${display(c.author)},`, `            text = ${display(c.text)},`,
        `            date = ${luaString(c.date)},`, `            sourceUrl = ${luaString(c.sourceUrl)},`, '        },');
    }
    lines.push('    },');
  }
  lines.push('}', '');
  const build = createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 12);
  lines.splice(2, 0, `ns.dataBuild = ${luaString(build)}`);
  return lines.join('\n');
}
