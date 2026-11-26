import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractModelCode, extractSize, isProductSet, parseSoldText } from '../src/utils/text';

describe('parseSoldText', () => {
  it('đọc số có hậu tố k / tr', () => {
    assert.equal(parseSoldText('Đã bán 43,2k'), 43200);
    assert.equal(parseSoldText('Đã bán 838'), 838);
    assert.equal(parseSoldText('Đã bán 1,2tr'), 1_200_000);
    assert.equal(parseSoldText(null), null);
    assert.equal(parseSoldText('Mới'), null);
  });
});

describe('extractModelCode', () => {
  it('lấy token mã model cuối tên', () => {
    assert.equal(extractModelCode('Chảo nhôm sâu chống dính đáy từ 30 cm Elmich EDA0904GO30'), 'EDA0904GO30');
    assert.equal(extractModelCode('Bộ 3 nồi inox 3 lớp nguyên khối Elmich Trimax XR EL-3843'), 'EL-3843');
    assert.equal(extractModelCode('Nồi xửng hấp inox nắp kính 22 cm Green Cook GCST2620-22IH'), 'GCST2620-22IH');
  });
  it('mã có gạch dưới / toàn số', () => {
    assert.equal(extractModelCode('Bình giữ nhiệt Inox 600 ml LocknLock LHC4282KKI_C'), 'LHC4282KKI_C');
    assert.equal(extractModelCode('Nồi inox Elmich Tri-Max 2353733'), '2353733');
  });
  it('không có mã → lấy tên dòng sau tên hãng', () => {
    assert.equal(extractModelCode('Nồi lẩu nhôm chống dính 28 cm Elmich Daily Milan', 'Elmich'), 'DAILY MILAN');
    assert.equal(extractModelCode('Bình giữ nhiệt Inox 730 ml Tactflow', 'Tactflow'), '');
  });
  it('bỏ qua token kích thước', () => {
    assert.equal(extractModelCode('Bình giữ nhiệt Lock&Lock LHC4125 500ml'), 'LHC4125');
  });
});

describe('extractSize', () => {
  it('ưu tiên đường kính trong thông số', () => {
    assert.deepEqual(extractSize('Chảo X', ['Đường kính 28 cm', 'Nhôm']), { key: '28cm', unit: 'cm', value: 28 });
  });
  it('đổi lít sang ml', () => {
    assert.deepEqual(extractSize('Bình giữ nhiệt 1.5 lít Elmich'), { key: '1500ml', unit: 'ml', value: 1500 });
  });
  it('không hiểu nhầm "3 lớp" là 3 lít', () => {
    assert.equal(extractSize('Bộ 3 nồi inox 3 lớp nguyên khối Elmich Trimax XR EL-3843'), null);
  });
});

describe('isProductSet', () => {
  it('nhận diện bộ / combo', () => {
    assert.equal(isProductSet('Bộ 3 nồi inox'), true);
    assert.equal(isProductSet('Chảo inox'), false);
  });
});
