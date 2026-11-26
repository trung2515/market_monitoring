import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { customPeriod, monthPeriod, weekPeriod } from '../src/report/period';
import { isoWeek } from '../src/utils/date';

describe('period', () => {
  it('tuần ISO Thứ Hai → Chủ Nhật', () => {
    const p = weekPeriod('2026-11-26'); // Thứ Năm
    assert.equal(p.from, '2026-11-23');
    assert.equal(p.to, '2026-11-29');
    assert.equal(p.label, '2026-W48');
  });

  it('tuần đầu năm thuộc năm ISO trước', () => {
    assert.deepEqual(isoWeek('2027-01-01'), { year: 2026, week: 53 });
  });

  it('tháng', () => {
    const p = monthPeriod('2026-02-10');
    assert.equal(p.from, '2026-02-01');
    assert.equal(p.to, '2026-02-28');
    assert.equal(p.label, '2026-02');
  });

  it('kỳ tuỳ chọn kiểm tra thứ tự ngày', () => {
    assert.throws(() => customPeriod('2026-11-10', '2026-11-01'));
    assert.equal(customPeriod('2026-11-01', '2026-11-10').label, '2026-11-01_2026-11-10');
  });
});
