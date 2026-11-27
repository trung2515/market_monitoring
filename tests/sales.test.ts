import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PriceSnapshot } from '../src/domain/types';
import { computeSales, salesBaseDates } from '../src/report/sales';

const snap = (crawlDate: string, productCode: string, totalRate: number | null) =>
  ({ crawlDate, productCode, totalRate, soldCount: null }) as unknown as PriceSnapshot;

function source(dates: string[]) {
  return {
    latestDateBefore: async (d: string) => dates.filter((x) => x < d).at(-1) ?? null,
    crawlDates: async (from: string, to: string) => dates.filter((x) => x >= from && x <= to),
  };
}

describe('Số bán trong ngày / tuần / tháng', () => {
  it('chọn đúng ngày mốc', async () => {
    // 26/11/2026 là thứ Năm → tuần bắt đầu 23/11
    const base = await salesBaseDates(source(['2026-10-30', '2026-11-20', '2026-11-25', '2026-11-26']), '2026-11-26');
    assert.deepEqual(base, { day: '2026-11-25', week: '2026-11-20', month: '2026-10-30' });
  });

  it('chưa có dữ liệu trước kỳ thì lấy lần cào đầu tiên trong kỳ', async () => {
    const base = await salesBaseDates(source(['2026-11-24', '2026-11-26']), '2026-11-26');
    assert.deepEqual(base, { day: '2026-11-24', week: '2026-11-24', month: '2026-11-24' });
    assert.deepEqual(await salesBaseDates(source(['2026-11-26']), '2026-11-26'), {
      day: null,
      week: null,
      month: null,
    });
  });

  it('trừ tổng đã bán, sản phẩm mới hoặc thiếu số thì để trống', () => {
    const res = computeSales('2026-11-26', { day: '2026-11-25', week: '2026-11-20', month: null }, [
      snap('2026-11-20', 'A', 900),
      snap('2026-11-25', 'A', 990),
      snap('2026-11-26', 'A', 1000),
      snap('2026-11-25', 'B', 50),
      snap('2026-11-26', 'B', 55),
      snap('2026-11-26', 'C', null),
    ]);
    assert.deepEqual(res.byCode.get('A'), { day: 10, week: 100, month: null });
    assert.deepEqual(res.byCode.get('B'), { day: 5, week: null, month: null });
    assert.deepEqual(res.byCode.get('C'), { day: null, week: null, month: null });
  });
});
