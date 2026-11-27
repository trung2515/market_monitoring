/**
 * Bảng màu & kiểu chữ dùng chung cho toàn bộ file Excel.
 * Muốn đổi "giao diện" báo cáo: chỉ cần sửa file này.
 *
 * Tông chủ đạo: xanh navy (tiêu đề, header) + xám trung tính (viền, chữ phụ),
 * điểm nhấn xanh nhạt cho dòng của công ty, cam nhạt cho dòng cần chú ý.
 */
export const THEME = {
  font: 'Calibri',
  fontSize: 10,

  // Chữ
  title: 'FF1F3864', // navy đậm – tiêu đề sheet
  text: 'FF262626',
  muted: 'FF7F7F7F',
  link: 'FF2F5597',

  // Header bảng
  headerBg: 'FF1F3864',
  headerFg: 'FFFFFFFF',
  /** Màu dòng nhóm cột (gộp ô) – xen kẽ để phân biệt các nhóm */
  groupBg: ['FF2F5496', 'FF44546A'],
  /** Nhóm cột của công ty (vd "Elmich") */
  ownGroupBg: 'FF1E6B52',

  // Thân bảng
  zebraBg: 'FFF5F7FA',
  ownRowBg: 'FFE2F0D9', // xanh lá nhạt – dòng của công ty
  attentionBg: 'FFFCE4D6', // cam nhạt – dòng cần chú ý (vd chưa có đối thủ, khoảng giá bỏ trống)
  border: 'FFD9DEE7',

  // Số tăng / giảm
  up: 'FFC00000',
  down: 'FF2E7D32',

  // Màu tab sheet
  tab: {
    summary: 'FF1F3864',
    category: 'FF2F5496',
    market: 'FF1E6B52',
    tracking: 'FF7F7F7F',
  },
} as const;

export type HighlightKind = 'own' | 'attention';

export const HIGHLIGHT_BG: Record<HighlightKind, string> = {
  own: THEME.ownRowBg,
  attention: THEME.attentionBg,
};
