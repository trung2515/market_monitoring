import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withStoredCategories } from '../src/config/categories';
import { parseTrackingConfig } from '../src/config/tracking';
import { openDatabase } from '../src/db/database';
import { NodeSqliteDriver } from '../src/db/sql';
import { SqlStore } from '../src/db/sqlStore';

const config = (...slugs: string[]) =>
  parseTrackingConfig({ ownBrand: 'Elmich', categories: slugs.map((slug) => ({ slug, name: slug })) });
const state = async (store: SqlStore) =>
  Object.fromEntries((await store.categories()).map((c) => [c.slug, c.enabled]));

describe('Đồng bộ danh mục từ config', () => {
  it('bỏ danh mục khỏi config → tự ngừng theo dõi; thêm lại → theo dõi lại; danh mục thêm trên web không bị đụng', async () => {
    const store = new SqlStore(new NodeSqliteDriver(openDatabase(':memory:')));
    await withStoredCategories(store, config('chao', 'noi', 'thot'));
    await store.addCategory('may-say-toc', 'Máy sấy tóc'); // thêm trên web
    assert.deepEqual(await state(store), { chao: true, noi: true, thot: true, 'may-say-toc': true });

    await withStoredCategories(store, config('chao', 'noi'));
    assert.deepEqual(await state(store), { chao: true, noi: true, thot: false, 'may-say-toc': true });

    // Bật lại trên web → lần sau không bị tắt lại
    await store.updateCategory('thot', { enabled: true });
    await withStoredCategories(store, config('chao', 'noi', 'ban-ui'));
    assert.deepEqual(await state(store), { chao: true, noi: true, thot: true, 'may-say-toc': true, 'ban-ui': true });
  });
});
