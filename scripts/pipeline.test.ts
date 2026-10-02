import { test } from 'node:test';
import assert from 'node:assert/strict';
import luaparse from 'luaparse';
import { extractComments, generateLua, plainText, processComments, questIds, verifyQuestPage, type RawComment, type RawData } from './pipeline.ts';
const comment = (id: number, rating: number, body: string): RawComment => ({ id, rating, body, user: 'Tester', date: '2026-10-02' });
const raw = (comments: RawComment[]): RawData => ({ schemaVersion: 1, questId: 14435, sourceUrl: 'https://www.wowhead.com/quest=14435', fetchedAt: '2026-10-02', comments });

test('all-area quest source is complete, sorted, and includes Ashenvale IDs', async () => {
  const all = await questIds(true);
  const ashenvale = await questIds();
  assert.equal(all.length, 22207);
  assert.ok(ashenvale.every(id => all.includes(id)));
  assert.ok(all.every((id, index) => index === 0 || id > all[index - 1]));
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
    'Cave at 42.1, 63.8\n\nGuide (https://example.com) & Quest (https://www.wowhead.com/quest=42)');
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
