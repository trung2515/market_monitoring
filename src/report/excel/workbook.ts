import * as ExcelJS from 'exceljs';
import type { ReportData } from '../analysis';
import {
  addGoneProductsSheet,
  addNewProductsSheet,
  addPriceChangeSheet,
  addPriceListSheet,
  addSalesSheet,
  addSegmentSheet,
} from './sheets/listSheets';
import { addSummarySheet } from './sheets/summarySheet';

/** Thứ tự sheet trong file Excel. Thêm sheet mới: viết hàm addXxxSheet rồi thêm vào đây. */
const SHEETS: ((wb: ExcelJS.Workbook, data: ReportData) => void)[] = [
  addPriceListSheet,
  addPriceChangeSheet,
  addNewProductsSheet,
  addGoneProductsSheet,
  addSegmentSheet,
  addSalesSheet,
];

export function buildWorkbook(data: ReportData, generatedAt = new Date()): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'market-monitoring';
  wb.created = generatedAt;

  addSummarySheet(wb, data, generatedAt);
  for (const addSheet of SHEETS) addSheet(wb, data);
  return wb;
}
