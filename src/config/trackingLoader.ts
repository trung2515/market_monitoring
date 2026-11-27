import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseTrackingConfig, type TrackingConfig } from './tracking';

/** Đọc config/tracking.json từ ổ đĩa (chỉ dùng trên Node; Worker nhúng file JSON lúc build). */
export function loadTrackingConfig(filePath: string): TrackingConfig {
  const abs = path.resolve(process.cwd(), filePath);
  const json: unknown = JSON.parse(readFileSync(abs, 'utf8'));
  return parseTrackingConfig(json);
}
