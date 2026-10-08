import { test } from 'node:test';
import assert from 'node:assert/strict';
import luaparse from 'luaparse';
import { extractComments, generateLua, isNotFoundRaw, notFoundRaw, plainText, processComments, questIds, validateRaw, verifyQuestPage, type RawComment, type RawData } from './pipeline.ts';
const comment = (id: number, rating: number, body: string): RawComment => ({ id, rating, body, user: 'Tester', date: '2026-10-02' });
const raw = (comments: RawComment[]): RawData => ({ schemaVersion: 1, questId: 14435, sourceUrl: 'https://www.wowhead.com/quest=14435', fetchedAt: '2026-10-02', comments });

test('404 markers are recognized and rejected as comment data', () => {
  const missing = notFoundRaw(33169, 'https://www.wowhead.com/quest=33169', '2026-10-08T00:00:00.000Z');
  assert.equal(isNotFoundRaw(missing, 33169), true);
  assert.equal(isNotFoundRaw(missing, 1), false);
  assert.throws(() => validateRaw(missing, 33169), /missing on Wowhead/);
  assert.doesNotThrow(() => validateRaw(raw([comment(1, 1, 'ok')]), 14435));
});

test('quest ID list is complete and strictly sorted', async () => {
  const ids = await questIds();
  assert.equal(ids.length, 22207);
  assert.ok(ids.includes(2));
  assert.ok(ids.includes(14435));
  assert.ok(ids.every((id, index) => index === 0 || id > ids[index - 1]));
});

test('rejects another quest even if the target appears in a related link', () => {
  assert.doesNotThrow(() => verifyQuestPage('<link rel="canonical" href="https://www.wowhead.com/quest=14435/title">', 14435));
  assert.throws(() => verifyQuestPage('<link rel="canonical" href="https://www.wowhead.com/quest=12345/title"><a href="/quest=14435">Related</a>', 14435));
});

test('extracts nested JSON, brackets and escaped quotes without executing page code', () => {
  const c = { ...comment(1, 10, 'a ] "quote" \\ path'), replies: [{ body: 'nested ]' }] };
  assert.deepEqual(extractComments(`var lv_comments0 = ${JSON.stringify([c])}; evil();`), [c]);
  assert.throws(() => extractComments('<html>challenge</html>'));
  assert.throws(() => extractComments('var lv_comments0 = [evil()];'));
  assert.throws(() => extractComments('var lv_comments0 = [{"id":1}]'));
});
test('preserves coordinates, paragraphs, entities and labeled links', () => {
  assert.equal(plainText('[b]Cave[/b] at 42.1, 63.8\\r\\n\\r\\n[url=https://example.com]Guide[/url] &amp; [quest=42]Quest[/quest]'),
    'Cave at 42.1, 63.8\n\nGuide (https://example.com) & Quest (wowhead.com/quest=42)');
});
test('flattens tables, list items and whitespace and shortens Wowhead links', () => {
  assert.equal(plainText('[table border=1][tr][td align=left]\t1.&nbsp;[zone=3959][/td][td][url=http://www.wowhead.com/?quest=7]Seven[/url][/td][/tr]\t\t[/table][ul][li]a[/li][/ul]'),
    '1. wowhead.com/zone=3959 Seven (wowhead.com/quest=7)\n\n• a');
});
test('selects highest rated eligible unique comments and preserves long text', () => {
  const long = 'Long comment '.repeat(1000);
  const result = processComments(raw([
    comment(1, 5, 'duplicate'), comment(2, 10, 'duplicate'),
    { ...comment(3, 100, 'deleted'), deleted: 1 },
    { ...comment(4, 100, 'old'), outofdate: 1 },
    { ...comment(5, 100, 'reply'), indent: 1 },
    comment(6, 9, long), comment(7, -1, 'last'),
  ]), 2);
  assert.deepEqual(result.comments.map(c => c.id), [2, 6]);
  assert.equal(result.comments[1].text, long.trim());
});
test('Lua output safely encodes quotes, backslashes, controls and WoW markup', () => {
  const output = generateLua(processComments(raw([comment(1, 3, '" \\ newline\n\u0001 |Tbad:32|t ä')]), 5));
  assert.doesNotThrow(() => luaparse.parse(output, { luaVersion: '5.1' }));
  assert.ok(output.includes('||Tbad:32||t'));
  assert.ok(output.includes('\\001'));
  assert.ok(output.includes('\\"'));
  assert.equal(output, generateLua(processComments(raw([comment(1, 3, '" \\ newline\n\u0001 |Tbad:32|t ä')]), 5)));
});
test('Lua output splits large databases into chunk functions to stay below the Lua 5.1 constant limit', () => {
  const quests = Array.from({ length: 1000 }, (_, i) => ({
    ...processComments(raw(Array.from({ length: 5 }, (_, j) => comment(j + 1, j, `text ${i} ${j}`))), 5),
    questId: i + 1,
  }));
  const output = generateLua(quests);
  assert.doesNotThrow(() => luaparse.parse(output, { luaVersion: '5.1' }));
  const chunks = output.split(';(function()').slice(1);
  assert.ok(chunks.length >= 3);
  for (const chunk of chunks) assert.ok((chunk.match(/\{"Tester",/g) ?? []).length <= 2000);
});
test('Lua output stores repeated long texts once and keeps only displayed fields', () => {
  const guide = 'A long guide that is shared by several quests in one chain.';
  const output = generateLua([1, 2].map(questId => ({ ...processComments(raw([comment(9, 4, guide), comment(10, 1, 'short')]), 5), questId })));
  assert.equal(output.split(guide).length - 1, 1);
  assert.ok(output.includes('db[1]={{"Tester",4,"2026-10-02",T[1]},{"Tester",1,"2026-10-02","short"}}'));
  assert.ok(!output.includes('sourceUrl'));
});
