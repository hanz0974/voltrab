import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { compileFunction } from 'node:vm';
import { test } from 'node:test';

// Load the real pricing code with an in-memory API; no credentials or database writes.
const source = (path) => stripTypeScriptTypes(
  readFileSync(new URL(path, import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/export /g, ''),
);
const readAllRows = compileFunction(`${source('../src/lib/readAllRows.ts')}; return readAllRows;`)();
const makeCatalog = compileFunction(
  `${source('../src/lib/componentCatalog.ts')}; return fetchActiveComponents;`,
  ['supabase', 'getBiayaUmumKoef', 'isHiddenSettingComponentId', 'readAllRows'],
);

function api(tables, options = {}) {
  return { from(table) {
    const orders = [];
    const query = {
      select(_columns, config) { assert.equal(config.count, 'exact'); return query; },
      order(key) { orders.push(key); return query; },
      async range(from, to) {
        if (options.failAt !== undefined && table === 'component_detail_view' && from >= options.failAt) {
          return { data: null, error: { message: 'network failure' }, count: null };
        }
        const rows = [...tables[table]].sort((a, b) => {
          for (const key of orders) {
            const delta = String(a[key]).localeCompare(String(b[key]));
            if (delta) return delta;
          }
          return 0;
        });
        return {
          data: rows.slice(from, Math.min(to + 1, from + (options.cap ?? 1000))),
          error: null, count: rows.length,
        };
      },
    };
    return query;
  } };
}

function fixture() {
  return {
    components: [
      { id: 'test', name: 'Synthetic component', category: 'Lainnya', unit: 'unit', price: 1 },
      { id: 'manual', name: 'Manual', category: 'Lainnya', unit: 'unit', price: 123 },
      { id: 'hidden', name: 'Setting', category: 'Lainnya', unit: 'unit', price: 0 },
    ],
    // Costs on both sides of the former 1,000-row cutoff must all contribute.
    component_detail_view: Array.from({ length: 1401 }, (_, i) => ({
      id: String(i).padStart(5, '0'), component_id: 'test', jumlah_harga: i === 1400 ? '5000' : 10,
    })),
  };
}

test('catalog includes costs beyond 1,000 rows, applies coefficient, preserves manual prices', async () => {
  for (const coefficient of [0.1, 0.15]) {
    const fetch = makeCatalog(api(fixture()), async () => coefficient, (id) => id === 'hidden', readAllRows);
    const rows = await fetch();
    assert.equal(rows.find((r) => r.id === 'test').price, Math.round(19000 * (1 + coefficient)));
    assert.equal(rows.find((r) => r.id === 'manual').price, 123);
    assert.equal(rows.some((r) => r.id === 'hidden'), false);
  }
});

test('catalog rejects a later-page failure instead of returning a partial price', async () => {
  const fetch = makeCatalog(api(fixture(), { failAt: 500 }), async () => 0.1, () => false, readAllRows);
  await assert.rejects(fetch(), /network failure/);
});

test('smaller server page limits do not skip rows', async () => {
  const fetch = makeCatalog(api(fixture(), { cap: 127 }), async () => 0.1, () => false, readAllRows);
  assert.equal((await fetch()).find((r) => r.id === 'test').price, 20900);
});

test('missing rows or changing counts fail closed', async () => {
  await assert.rejects(readAllRows(async () => ({ data: [], error: null, count: 1 })), /belum lengkap/);
  await assert.rejects(readAllRows(async (from) => ({
    data: [from], error: null, count: from === 0 ? 2 : 3,
  })), /berubah/);
  await assert.rejects(readAllRows(async () => ({ data: [], error: null, count: null })), /jumlah baris/);
  assert.deepEqual(await readAllRows(async () => ({ data: [], error: null, count: 0 })), []);
});
