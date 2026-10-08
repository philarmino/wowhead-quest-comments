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
  notFound?: true;
}
export interface NotFoundData {
  schemaVersion: 1; questId: number; sourceUrl: string; fetchedAt: string;
  comments: []; notFound: true;
}
export interface Comment { id: number; author: string; score: number; text: string; date: string; sourceUrl: string }
export interface ProcessedData extends Omit<RawData, 'comments'> { comments: Comment[] }

export function options() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
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
  if (positionals.length)
    throw new Error(
      `Unexpected argument '${positionals[0]}'. Pass options after "--" so npm forwards them, ` +
      'for example: npm run fetch -- --expansion dragonflight --max-requests 99',
    );
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
export async function questIds(): Promise<number[]> {
  const source = await readJson(resolve(root, 'scripts/quest-ids.json'));
  if (!isObject(source) || source.schemaVersion !== 1 ||
      !Array.isArray(source.failedAreaIds) || source.failedAreaIds.length ||
      !Array.isArray(source.questIds) || source.questIds.length === 0)
    throw new Error('Invalid or incomplete quest ID list in scripts/quest-ids.json.');
  const ids = source.questIds;
  if (!ids.every(id => Number.isSafeInteger(id) && id > 0) ||
      ids.some((id, index) => index > 0 && id <= ids[index - 1]))
    throw new Error('Invalid or duplicate quest ID in scripts/quest-ids.json.');
  return ids;
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
export function isNotFoundRaw(value: unknown, questId: number): value is NotFoundData {
  return isObject(value) && value.schemaVersion === 1 && value.questId === questId &&
    value.notFound === true && Array.isArray(value.comments) && value.comments.length === 0 &&
    typeof value.sourceUrl === 'string' && typeof value.fetchedAt === 'string';
}

export function validateRaw(value: unknown, questId: number): asserts value is RawData {
  if (isNotFoundRaw(value, questId))
    throw new Error('Raw cache marks this quest as missing on Wowhead.');
  if (!isObject(value) || value.schemaVersion !== 1 || value.questId !== questId ||
      typeof value.sourceUrl !== 'string' || typeof value.fetchedAt !== 'string' || !Array.isArray(value.comments) ||
      value.notFound === true)
    throw new Error('Invalid raw data or incorrect quest ID.');
  for (const c of value.comments) {
    if (!isObject(c) || !Number.isSafeInteger(c.id) || typeof c.user !== 'string' ||
        typeof c.body !== 'string' || typeof c.rating !== 'number' || !Number.isFinite(c.rating) || typeof c.date !== 'string')
      throw new Error('Unexpected Wowhead comment format. Existing data will not be replaced.');
  }
}

export function notFoundRaw(questId: number, sourceUrl: string, fetchedAt = new Date().toISOString()): NotFoundData {
  return { schemaVersion: 1, questId, sourceUrl, fetchedAt, comments: [], notFound: true };
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

const ENTITY = 'quest|item|npc|spell|object|achievement|zone|currency|faction|storyline|title|follower|class|race|garrisonability|mission|itemset|skill|pet|event';
const entityTag = new RegExp(`\\[(${ENTITY})=(\\d+)[^\\]]*\\]([\\s\\S]*?)\\[\\/\\1\\]`, 'gi');
const bareEntityTag = new RegExp(`\\[(${ENTITY})=(\\d+)(?:\\.\\d+)?\\]`, 'gi');
export function plainText(body: string): string {
  return decodeHTML(body
    .replace(/\\r\\n|\\n|\\r/g, '\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|div|li)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, '$2 ($1)')
    .replace(entityTag, '$3 (https://www.wowhead.com/$1=$2)')
    .replace(bareEntityTag, 'https://www.wowhead.com/$1=$2')
    .replace(/\[icondb=\d+\]/gi, '')
    .replace(/\[(?:\*|li)\]/gi, '\n• ')
    .replace(/\[(?:\/?tr|\/?table[^\]]*|hr|br)\]/gi, '\n')
    .replace(/\[\/td\]/gi, ' ')
    .replace(/\[\/?(?:b|i|u|s|small|quote|code|ul|ol|li|list|color|size|url|td|pre|ins|del|spoiler|sup|sub|h[1-6]|center)(?:[= ][^\]]*)?\]/gi, '')
  ).replace(/https?:\/\/(?:www\.)?wowhead\.com\/\??/gi, 'wowhead.com/')
    .replace(/\r\n?/g, '\n').replace(/[\t\u00a0 ]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
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
// Lua 5.1 allows at most 262143 constants per function, so statements are split into chunk functions.
const ENTRIES_PER_CHUNK = 2000;
// Shorter repeated texts cost less inline than as a T[n] reference.
const SHARED_TEXT_MIN_LENGTH = 40;
function pushChunks(lines: string[], statements: { line: string; weight: number }[]) {
  let weight = 0;
  for (const statement of statements) {
    if (weight && weight + statement.weight > ENTRIES_PER_CHUNK) { lines.push('end)()'); weight = 0; }
    if (!weight) lines.push(';(function()');
    lines.push(statement.line);
    weight += Math.max(1, statement.weight);
  }
  if (weight) lines.push('end)()');
}
// Comments are emitted as { author, score, "YYYY-MM-DD", text }; see the field indices in Core.lua.
export function generateLua(input: ProcessedData | ProcessedData[]): string {
  const datasets = [...(Array.isArray(input) ? input : [input])].sort((a, b) => a.questId - b.questId);
  const seen = new Set<number>();
  // Escape WoW markup too: comments must not inject texture, link or color codes.
  const display = (s: string) => luaString(s.replace(/\|/g, '||'));
  const textCounts = new Map<string, number>();
  for (const data of datasets) {
    if (!Number.isSafeInteger(data.questId) || data.questId <= 0 || !Array.isArray(data.comments) || seen.has(data.questId))
      throw new Error('Invalid or duplicate quest data.');
    seen.add(data.questId);
    for (const c of data.comments) {
      if (!Number.isSafeInteger(c.id) || !Number.isFinite(c.score) ||
          [c.author, c.text, c.date, c.sourceUrl].some(v => typeof v !== 'string'))
        throw new Error('Invalid processed comment.');
      textCounts.set(c.text, (textCounts.get(c.text) ?? 0) + 1);
    }
  }
  const shared = new Map<string, number>();
  const sharedStatements: { line: string; weight: number }[] = [];
  for (const [text, count] of textCounts) {
    if (count < 2 || text.length < SHARED_TEXT_MIN_LENGTH) continue;
    shared.set(text, shared.size + 1);
    sharedStatements.push({ line: `T[${shared.size}]=${display(text)}`, weight: 1 });
  }
  const questStatements = datasets.map(data => ({
    line: `db[${data.questId}]={` + data.comments.map(c => {
      const text = shared.has(c.text) ? `T[${shared.get(c.text)}]` : display(c.text);
      return `{${display(c.author)},${c.score},${luaString(c.date.slice(0, 10))},${text}}`;
    }).join(',') + '}',
    weight: data.comments.length,
  }));
  const lines = ['-- Generated by npm run generate; do not edit manually.', 'local _, ns = ...', 'local db, T = {}, {}', 'ns.db = db'];
  pushChunks(lines, sharedStatements);
  pushChunks(lines, questStatements);
  lines.push('');
  const build = createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 12);
  lines.splice(2, 0, `ns.dataBuild = ${luaString(build)}`);
  return lines.join('\n');
}
