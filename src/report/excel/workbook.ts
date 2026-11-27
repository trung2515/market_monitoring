import * as ExcelJS from 'exceljs';
import type { ReportData } from '../analysis';
import { addCategorySheets } from './sheets/categorySheets';
import { addGoneProductsSheet, addNewProductsSheet, addPriceChangeSheet, addSalesSheet } from './sheets/listSheets';
import {
  addMarketShareSheet,
  addFlashCalendarSheet,
  addPriceBandSheet,
  addPriceHistorySheet,
  addPromotionSheet,
  addTopSellersSheet,
} from './sheets/marketSheets';
import { addSummarySheet } from './sheets/summarySheet';

/**
 * Thứ tự sheet trong file Excel:
 *   Tổng quan → 1 sheet cho mỗi danh mục → Thị phần → Top bán chạy → Phân khúc giá → Khuyến mãi
 *   → Lịch flash sale → Lịch sử giá → Biến động giá → SP mới → Ngừng hiển thị → Lượt bán
 * Thêm sheet mới: viết hàm addXxxSheet rồi thêm vào mảng dưới.
 */
const SHEETS: ((wb: ExcelJS.Workbook, data: ReportData) => void)[] = [
  addCategorySheets,
  addMarketShareSheet,
  addTopSellersSheet,
  addPriceBandSheet,
  addPromotionSheet,
  addFlashCalendarSheet,
  addPriceHistorySheet,
  addPriceChangeSheet,
  addNewProductsSheet,
  addGoneProductsSheet,
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
