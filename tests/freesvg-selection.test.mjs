import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sampleFreeSvgPages, freeSvgAssetKey, freeSvgKeys, loadFreeSvgBatch,
  readFreeSvgHistory, saveFreeSvgHistory, FREESVG_HISTORY_KEY } from '../app/lib/freesvg-selection.ts';

function item(id, filename = `image-${id}.png`) {
  return { title: `Image ${id}`, source: 'freesvg.org', sourceUrl: `https://freesvg.org/image-${id}`,
    previewImage: `https://freesvg.org/img/${filename}`, downloadUrl: `/api/download-freesvg?id=${id}` };
}
const json = data => new Response(JSON.stringify(data));

test('six slots cover six disjoint bands across the complete catalog', () => {
  for (const random of [() => 0, () => 0.999999, Math.random]) {
    const plans = sampleFreeSvgPages(5762, 6, random);
    assert.equal(new Set(plans.map(plan => plan.page)).size, 6);
    const sorted = plans.toSorted((a, b) => a.first - b.first);
    assert.equal(sorted[0].first, 1);
    assert.equal(sorted.at(-1).last, 5762);
    sorted.forEach((plan, i) => {
      assert(plan.page >= plan.first && plan.page <= plan.last);
      if (i) assert.equal(sorted[i - 1].last + 1, plan.first);
    });
  }
});

test('every page, including the oldest and newest, remains eligible', () => {
  const first = sampleFreeSvgPages(5762, 1, () => 0);
  const last = sampleFreeSvgPages(5762, 1, () => 0.999999);
  assert.equal(first[0].page, 1);
  assert.equal(last[0].page, 5762);
  assert.equal(sampleFreeSvgPages(3, 6).length, 3);
});

test('thumbnail, full-size image and URL encoding share the same identity', () => {
  const key = freeSvgAssetKey('https://freesvg.org/thumbs/Woman%27s%20face.png?mode=contain');
  assert.equal(key, freeSvgAssetKey("https://freesvg.org/img/Woman's%20face.png"));
  assert.equal(key, freeSvgAssetKey('https://freesvg.org/storage/img/thumb/Woman%27s%20face.png'));
  assert.equal(key, freeSvgAssetKey('https://freesvg.org/storage/img/Woman%27s%20face.png'));
});

test('client rejects old IDs, duplicated assets and duplicate results in a batch', async () => {
  const seen = new Set(freeSvgKeys(item(1)));
  const requests = [];
  const result = await loadFreeSvgBatch(3, seen, async (url, init) => {
    requests.push(JSON.parse(init.body));
    return requests.length === 1
      ? json({ items: [item(1), item(2), item(22, 'image-2.png'), item(2)] })
      : json({ items: [item(3), item(4)] });
  });
  assert.deepEqual(result.map(x => x.downloadUrl), [2,3,4].map(id => `/api/download-freesvg?id=${id}`));
  assert.equal(requests[0].count, 3);
  assert.equal(requests[1].count, 2);
  assert(requests[1].exclude.includes('id:2'));
  assert(seen.has('id:4'));
});

test('repeated server answers cannot force already-seen images into the UI', async () => {
  const seen = new Set(freeSvgKeys(item(1)));
  let calls = 0;
  await assert.rejects(loadFreeSvgBatch(1, seen, async () => {
    calls++;
    return json({ items: [item(1)] });
  }), /unseen/);
  assert.equal(calls, 3);
  assert.deepEqual([...seen], freeSvgKeys(item(1)));
});

test('full history is enforced even beyond the bounded server exclusion payload', async () => {
  const seen = new Set(['id:1', ...Array.from({ length: 11000 }, (_, i) => `id:${i + 100}`)]);
  let calls = 0;
  const result = await loadFreeSvgBatch(1, seen, async (url, init) => {
    assert.equal(JSON.parse(init.body).exclude.length, 10000);
    calls++;
    return json({ items: [calls === 1 ? item(1) : item(2)] });
  });
  assert.equal(calls, 2);
  assert.equal(result[0].downloadUrl, '/api/download-freesvg?id=2');
});

test('history survives reloads and does not clear itself on a failed batch', async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const first = new Set(freeSvgKeys(item(42)));
  saveFreeSvgHistory(storage, first);
  assert(values.has(FREESVG_HISTORY_KEY));
  const restored = readFreeSvgHistory(storage);
  const result = await loadFreeSvgBatch(1, restored, async () => json({ items: [item(42), item(43)] }));
  assert.equal(result[0].downloadUrl, '/api/download-freesvg?id=43');
  assert(restored.has('id:42') && restored.has('id:43'));
});

test('unavailable or corrupted storage preserves a working in-memory session', () => {
  assert.equal(readFreeSvgHistory({ getItem: () => '{bad' }).size, 0);
  const seen = new Set(['id:1']);
  saveFreeSvgHistory({ setItem: () => { throw new Error('Quota exceeded'); } }, seen);
  assert(seen.has('id:1'));
});
