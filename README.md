# Market Monitoring – Điện Máy Xanh

Công cụ theo dõi giá và sản phẩm của Elmich và các đối thủ (Sunhouse, Lock&Lock, Tefal…) trên **dienmayxanh.com**.

- Tự **cào dữ liệu hằng ngày** theo lịch: mã SP, giá niêm yết, giá bán, % giảm, giá flash sale, số đã bán, rating, thông số chính.
- Giao diện web có nút **Xuất Excel theo tuần / tháng / khoảng tuỳ chọn**, lọc được theo danh mục và thương hiệu.
- Báo cáo Excel gồm: Tổng quan · **1 sheet cho mỗi danh mục** (Elmich + đối thủ cùng tầm giá, và toàn bộ sản phẩm) · Biến động giá · SP mới · Ngừng hiển thị · Lượt bán.

---

## 1. Yêu cầu

- **Node.js ≥ 22.13** (khuyên dùng Node 24 LTS). Dự án dùng SQLite có sẵn trong Node (`node:sqlite`), **không cần cài database**.
- Máy chạy phải truy cập được `api.dienmayxanh.com`.

## 2. Chạy thử trên máy

```bash
npm install
cp .env.example .env          # Windows: copy .env.example .env
npm run crawl                 # cào 1 lượt ngay (mất ~1–2 phút)
npm run dev                   # mở http://localhost:3000
```

Các lệnh khác:

| Lệnh                                                                                           | Việc làm                                        |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `npm run dev`                                                                                  | Chạy web + lịch cào, tự reload khi sửa code     |
| `npm run crawl`                                                                                | Cào 1 lượt ngay từ dòng lệnh                    |
| `npm run export -- --period week`                                                              | Xuất Excel tuần hiện tại vào thư mục `reports/` |
| `npm run export -- --period month --date 2026-11-01`                                           | Xuất Excel tháng 11/2026                        |
| `npm run export -- --period custom --from 2026-11-01 --to 2026-11-15 --brands Elmich,Sunhouse` | Khoảng tuỳ chọn, lọc hãng                       |
| `npm test`                                                                                     | Chạy unit test                                  |
| `npm run typecheck`                                                                            | Kiểm tra kiểu TypeScript                        |
| `npm run build` → `npm start`                                                                  | Build & chạy bản production                     |

### Format code (Prettier)

Dự án dùng **Prettier**, cấu hình trong `.prettierrc.json`: nháy đơn, có dấu `;`, tối đa 120 ký tự mỗi dòng.

- **VS Code:** cài extension **Prettier – Code formatter** (`esbenp.prettier-vscode`). VS Code sẽ tự gợi ý khi mở dự án. File `.vscode/settings.json` đã bật **format khi lưu**.
- **Dòng lệnh:** `npm run format` để format toàn bộ, `npm run format:check` để kiểm tra mà không sửa file.

> Node 22 có thể in cảnh báo `ExperimentalWarning: SQLite is an experimental feature` – không ảnh hưởng.

## 3. Cấu hình

### `.env` – cấu hình kỹ thuật

Xem chú thích trong [.env.example](.env.example). Quan trọng:

- `AUTH_USER` / `AUTH_PASSWORD`: bật đăng nhập cho web (**bắt buộc khi đưa lên Internet**).
- `CRAWL_CRON`: giờ cào tự động (mặc định `15 6 * * *` = 6:15 sáng mỗi ngày, giờ VN).
- `DMX_PROVINCE_ID`: khu vực giá. Giữ cố định để số liệu các kỳ so sánh được với nhau.
- `DMX_REQUEST_DELAY_MS`: nghỉ giữa các request (mặc định 2 giây). Đừng hạ quá thấp.

### `config/tracking.json` – cấu hình nghiệp vụ (không cần sửa code)

```jsonc
{
  "ownBrand": "Elmich", // thương hiệu của công ty mình
  "competitorBrands": ["Sunhouse", "Lock&Lock"], // đối thủ chính (dùng cho bộ lọc nhanh trên web)
  "categories": [
    // danh mục cần theo dõi
    { "slug": "chao-chong-dinh", "name": "Chảo" }, // slug = phần đường dẫn trên dienmayxanh.com
  ],
  "segment": {
    "priceTolerancePercent": 20, // đối thủ có giá bán trong ±20% giá Elmich = cùng tầm giá
    "maxCompetitorsPerProduct": 3, // số đối thủ hiện cạnh mỗi sản phẩm Elmich
    "onlyListedCompetitors": false, // true = chỉ so với competitorBrands
    "manualPairs": [
      // ghép tay khi quy tắc tự động chưa đúng (theo mã model)
      { "own": "EL-5753MN", "competitor": "SBDS28MT", "note": "..." },
    ],
  },
}
```

**Thêm danh mục mới:** mở danh mục trên web ĐMX, ví dụ `https://www.dienmayxanh.com/binh-ly-giu-nhiet`, rồi lấy phần cuối `binh-ly-giu-nhiet` làm `slug`. Thêm `"enabled": false` để tạm tắt một danh mục. Sửa xong thì khởi động lại app.

## 4. Báo cáo Excel

| Sheet                                                    | Nội dung                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tổng quan**                                            | Theo danh mục × hãng: số SKU, giá TB/min/max, % giảm TB, số SKU flash sale, SKU mới/ngừng, số SKU tăng/giảm giá, lượt bán tăng thêm. Bên phải là thông tin kỳ và các cảnh báo dữ liệu                                                                                                                           |
| **Mỗi danh mục 1 sheet** (Chảo, Nồi, Bình đun siêu tốc…) | **[1]** Mỗi dòng là 1 sản phẩm Elmich: mã, tên, kích thước, giá gốc, giá bán, % giảm, giá flash sale, đã bán. Bên phải là **3 đối thủ cùng tầm giá** (hãng, mã, tên, giá bán, flash sale, % chênh). **[2]** Toàn bộ sản phẩm của mọi hãng trong danh mục, sắp theo giá, có cột đổi giá trong kỳ / SP mới / link |
| **Biến động giá**                                        | SKU đổi giá giữa đầu kỳ và cuối kỳ: chênh lệch, %, giá min/max trong kỳ, số lần đổi giá                                                                                                                                                                                                                         |
| **SP mới**                                               | SKU lần đầu xuất hiện trong kỳ                                                                                                                                                                                                                                                                                  |
| **Ngừng hiển thị**                                       | SKU có ở đầu kỳ nhưng biến mất ở cuối kỳ (hết hàng, ngừng bán, bị ẩn)                                                                                                                                                                                                                                           |
| **Lượt bán**                                             | Lượt bán tăng thêm (ước tính từ bộ đếm "đã bán" công khai) và doanh thu ước tính                                                                                                                                                                                                                                |

Dòng của Elmich được tô vàng. Ở bảng [1], dòng tô vàng là sản phẩm Elmich chưa tìm được đối thủ cùng tầm giá.

**Cách chọn "đối thủ cùng tầm giá"** (chỉnh trong `config/tracking.json` → `segment`):

- Giá bán của đối thủ chênh trong **±`priceTolerancePercent`%** (mặc định 20%) so với giá bán của Elmich, và cùng loại bộ/lẻ.
- Trong số đó, ưu tiên sản phẩm **cùng kích thước/dung tích**, sau đó đến sản phẩm có giá gần nhất. Mỗi sản phẩm Elmich lấy tối đa `maxCompetitorsPerProduct` đối thủ (mặc định 3).
- `onlyListedCompetitors: true` để chỉ so với các hãng trong `competitorBrands`. Mặc định là `false`, tức so với mọi hãng khác.
- `manualPairs`: ghép tay theo mã model, ví dụ `{ "own": "EL-5753MN", "competitor": "SBDS28MT" }`. Cặp ghép tay luôn đứng đầu danh sách đối thủ.

**Mốc so sánh "đầu kỳ"** là ngày có dữ liệu gần nhất _trước_ ngày bắt đầu kỳ. Ví dụ báo cáo tuần 23–29/11 so dữ liệu ngày 22/11 (hoặc ngày gần nhất trước đó) với ngày có dữ liệu cuối cùng trong tuần. Nếu chưa có dữ liệu trước kỳ, hệ thống dùng ngày đầu tiên trong kỳ và ghi chú trong sheet Tổng quan.

> Hệ thống chỉ biết biến động **từ ngày bắt đầu chạy**. Báo cáo tuần đầu tiên sẽ chưa có nhiều thông tin; sau 1–2 tuần cào đều đặn số liệu mới đầy đủ.

## 5. Kiến trúc

```
src/
├─ config/        env.ts (.env, validate bằng zod) · tracking.ts (config/tracking.json)
├─ domain/        types.ts – mô hình dữ liệu chung (Product, PriceSnapshot, CrawlRun)
├─ crawler/
│  ├─ dmx/        client.ts (gọi API ĐMX, phân trang, retry) · schema.ts (zod) · normalize.ts (JSON → domain)
│  └─ crawlService.ts – điều phối 1 lượt cào, lưu DB, cảnh báo bất thường
├─ db/            database.ts (node:sqlite + migration) · repositories/ (products, snapshots, crawl_runs)
├─ report/
│  ├─ period.ts   tính kỳ tuần/tháng
│  ├─ analysis.ts TOÀN BỘ logic phân tích (hàm thuần, có test)
│  ├─ excel/      tableSheet.ts (helper tạo sheet) · columns.ts (bộ cột dùng lại) · sheets/ · workbook.ts
│  └─ reportService.ts – DB → analysis → Excel
├─ web/           app.ts (Express) · auth.ts (Basic Auth) · routes/api.ts
├─ jobs/          scheduler.ts (node-cron)
├─ cli/           crawl.ts · export.ts
├─ container.ts   composition root – nơi duy nhất khởi tạo & nối các thành phần
└─ index.ts       khởi động server
public/           giao diện web (HTML/JS thuần, không cần build)
tests/            unit test (node:test), fixtures/ = JSON thật từ API ĐMX
```

**Luồng dữ liệu:** `node-cron` → `CrawlService` → `DmxClient` (API ĐMX) → `normalize` → SQLite (`products`, `price_snapshots`).
Khi bấm xuất: `ReportService` → `analysis` → `excel/workbook` → tải file về.

**Bảng dữ liệu:**

- `products`: 1 dòng/SKU, có `first_seen_date` và `last_seen_date`.
- `price_snapshots`: 1 dòng/SKU/ngày. Cào lại trong ngày sẽ ghi đè, không nhân đôi.
- `crawl_runs`: nhật ký mỗi lượt cào (trạng thái, số SP, cảnh báo, lỗi).

### Hướng dẫn bảo trì nhanh

| Muốn…                                                      | Sửa ở đâu                                                                                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Thêm/bớt danh mục, đối thủ                                 | `config/tracking.json`                                                                                                      |
| Thêm/bớt cột trong Excel                                   | mảng cột trong `src/report/excel/sheets/*.ts` (sheet danh mục: `categorySheets.ts`)                                         |
| Thêm sheet mới                                             | viết hàm `addXxxSheet` rồi thêm vào mảng `SHEETS` trong `excel/workbook.ts`                                                 |
| Đổi quy tắc chọn đối thủ cùng tầm giá / định nghĩa SP mới… | `src/report/analysis.ts` (`findCompetitors`, + test trong `tests/report.test.ts`)                                           |
| Trích mã model / kích thước sai                            | `src/utils/text.ts` (+ `tests/text.test.ts`)                                                                                |
| Thêm trường dữ liệu mới từ ĐMX                             | `crawler/dmx/schema.ts` → `normalize.ts` → `domain/types.ts` → thêm **migration mới** trong `db/migrations.ts` → repository |
| Theo dõi thêm sàn khác (TGDĐ, Shopee…)                     | viết client + normalize mới trả về `CrawledProduct`; phần DB/báo cáo dùng lại được                                          |

### Khi ĐMX thay đổi API

Crawler validate JSON bằng zod. Nếu ĐMX đổi cấu trúc, lượt cào sẽ báo lỗi rõ ràng (xem bảng "Lần cào gần đây" trên web hoặc log), không ghi dữ liệu sai vào DB. Ngoài ra, nếu số SP của một danh mục giảm hơn 50% so với lần trước, hệ thống sẽ cảnh báo.

Cách tìm API mới: mở trang danh mục bằng Chrome, mở DevTools → tab **Network** → lọc **Fetch/XHR** → bấm "Xem thêm" để thấy request mới. Sau đó cập nhật `DMX_CATEGORY_API`, body hoặc header trong `crawler/dmx/client.ts`, và cập nhật `schema.ts`.

## 6. Deploy lên VPS (Ubuntu)

```bash
# 1. Cài Node 24 + pm2
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm i -g pm2

# 2. Lấy code
git clone <repo-cua-ban> market_monitoring && cd market_monitoring
npm ci
cp .env.example .env && nano .env      # đặt AUTH_USER / AUTH_PASSWORD
npm run build

# 3. Chạy nền + tự khởi động cùng máy
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup

# Cập nhật code về sau
git pull && npm ci && npm run build && pm2 restart market-monitoring
```

Đặt **Caddy** hoặc **Nginx** phía trước để có HTTPS. Ví dụ Caddyfile:

```
monitor.ten-mien-cua-ban.vn {
  reverse_proxy localhost:3000
}
```

**Hoặc dùng Docker** (cần commit file `package-lock.json`, file này được tạo ra khi chạy `npm install` lần đầu):

```bash
docker build -t market-monitoring .
docker run -d --name market-monitoring --restart unless-stopped \
  -p 3000:3000 --env-file .env -v $(pwd)/data:/app/data market-monitoring
```

**Sao lưu:** toàn bộ dữ liệu nằm trong `data/market.db`. Chỉ cần sao lưu file này định kỳ.

> Nên dùng VPS đặt tại Việt Nam: IP Việt Nam giống người dùng thật hơn và ít bị ĐMX chặn hơn. Chỉ chạy **1 instance** để tránh cào trùng và tranh chấp ghi SQLite.

## 7. Lưu ý sử dụng

- Hệ thống chỉ đọc **dữ liệu công khai** (không đăng nhập), tốc độ thấp (nghỉ 2 giây giữa các request, mỗi ngày một lượt). Nên đọc điều khoản sử dụng của ĐMX và giữ tần suất hợp lý.
- "Đã bán" là con số ĐMX hiển thị công khai, chỉ dùng để tham khảo **xu hướng**, không phải doanh số thực.
- Giá có thể khác nhau theo tỉnh/thành. Báo cáo dùng một khu vực cố định (`DMX_PROVINCE_ID`).
