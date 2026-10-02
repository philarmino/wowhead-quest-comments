import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaCatalog, areaIds, expansionId, selectAreaQuestIds } from './area-selection.ts';

test('area IDs accept repeated and comma-separated values and reject invalid IDs', () => {
  assert.deepEqual(areaIds(['331, 14', '331']), [14, 331]);
  assert.throws(() => areaIds(['331,nope']), /positive area IDs/);
  assert.equal(expansionId('The War Within'), 10);
  assert.equal(expansionId('classic'), 0);
  assert.throws(() => expansionId('unknown'), /Unknown expansion/);
});

test('area selection combines cached quest lists without duplicates', async () => {
  const result = await selectAreaQuestIds([14, 331]);
  const single = await selectAreaQuestIds([331], 0);
  assert.equal(result.selectedAreas.length, 2);
  assert.ok(result.ids.length >= single.ids.length);
  assert.ok(single.ids.every(id => result.ids.includes(id)));
  assert.ok(result.ids.every((id, index) => index === 0 || id > result.ids[index - 1]));
});

test('expansion selection includes known zones and rejects mismatches or unknown mappings', async () => {
  const catalog = await areaCatalog();
  assert.ok(catalog.unmapped.some(area => area.id === 35));
  const dragonflight = await selectAreaQuestIds([], 9);
  assert.ok(dragonflight.selectedAreas.some(area => area.id === 13644));
  assert.ok(dragonflight.ids.length > 0);
  await assert.rejects(selectAreaQuestIds([331], 9), /has classic; requested dragonflight/);
  await assert.rejects(selectAreaQuestIds([35], 0), /no known expansion/);
  await assert.rejects(selectAreaQuestIds([999999]), /not in/);
});
