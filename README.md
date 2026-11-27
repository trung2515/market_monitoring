# Theo dõi giá Điện Máy Xanh – Elmich

Công cụ tự lấy giá sản phẩm của **Elmich** và các đối thủ (Sunhouse, Lock&Lock, Tefal…) trên **dienmayxanh.com**, rồi xuất báo cáo Excel để phân tích thị trường.

- **Link web:** https://elmich-monitor.dinhtrung2515.workers.dev (đăng nhập bằng tài khoản đã đặt).
- Mỗi sáng **7:25** hệ thống tự lấy dữ liệu, không cần bật máy.
- Trên web có 2 nút chính: **Lấy data hôm nay** và **Tải file Excel** (theo tuần, tháng hoặc khoảng ngày tuỳ chọn).

---

## 1. Dùng hằng ngày

1. Mở link web và đăng nhập. Phiên đăng nhập có hiệu lực **đến hết ngày** (0h giờ VN), sang ngày mới cần đăng nhập lại. Đổi mật khẩu (`npx wrangler secret put AUTH_PASSWORD`) thì mọi máy đang đăng nhập đều bị đăng xuất.
2. Chọn kỳ báo cáo (**Theo tuần / Theo tháng / Tuỳ chọn**), chọn danh mục và thương hiệu nếu cần lọc.
3. Bấm **Tải file Excel**.

Phần **Tổng quan thị trường** trên web có các biểu đồ xem nhanh (lọc theo danh mục, 7 / 30 / 90 ngày): thị phần theo lượt bán, bán trong kỳ theo hãng, giá bán trung bình, số sản phẩm theo khoảng giá, số sản phẩm chạy flash sale mỗi ngày, và danh sách sản phẩm mới của đối thủ. Rê chuột vào biểu đồ để xem số chi tiết, bấm "Xem số liệu" để xem dạng bảng.

Nút **Lấy data hôm nay** chỉ cần bấm khi muốn có giá mới nhất ngay lúc đó, ví dụ đang có flash sale. Mất khoảng dưới 1 phút. Lỡ đóng trang giữa chừng cũng không sao: hệ thống tự làm tiếp trong vòng 10 phút. Lấy lại trong cùng ngày sẽ ghi đè dữ liệu ngày đó, không bị trùng.

> Hệ thống chỉ có dữ liệu **từ ngày bắt đầu chạy**. ĐMX không cho xem lại giá của các ngày đã qua. Ngày nào không lấy được dữ liệu thì để trống.

## 2. File Excel có gì

| Sheet                                    | Nội dung                                                                                                                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tổng quan**                            | Số liệu tóm tắt theo danh mục và hãng                                                                                                                                                   |
| **Mỗi danh mục 1 sheet** (Chảo, Nồi, …) | **Bảng [1]:** mỗi dòng là 1 sản phẩm Elmich, bên cạnh là tối đa 3 đối thủ cùng tầm giá. **Bảng [2]:** toàn bộ sản phẩm của mọi hãng trong danh mục                                      |
| **Thị phần**                             | Xếp hạng các hãng theo số lượng đã bán                                                                                                                                                  |
| **Top bán chạy**                         | 10 sản phẩm bán chạy nhất mỗi danh mục                                                                                                                                                  |
| **Phân khúc giá**                        | Số sản phẩm theo từng khoảng giá, khoảng giá nào Elmich chưa có hàng                                                                                                                    |
| **Khuyến mãi**                           | Mọi chương trình đang chạy: giảm giá, flash sale (giờ bắt đầu – kết thúc, số suất), quà tặng, trả góp                                                                                  |
| **Lịch flash sale**                      | Giá flash sale theo từng ngày                                                                                                                                                           |
| **Lịch sử giá**                          | Giá bán theo từng ngày, mỗi ngày một cột                                                                                                                                                |
| **Biến động giá**                        | Sản phẩm đổi giá trong kỳ                                                                                                                                                               |
| **SP mới / Ngừng hiển thị**              | Sản phẩm mới xuất hiện / biến mất trong kỳ                                                                                                                                              |
| **Lượt bán**                             | Số bán thêm trong kỳ của từng sản phẩm                                                                                                                                                  |

**Các cột giá:**

- **Giá niêm yết:** giá gốc (giá gạch ngang trên web).
- **Giá bán hiện tại:** giá đang bán (đã giảm).
- **Giá flash sale:** giá giờ vàng, kèm **thời gian flash** (từ giờ nào đến giờ nào). Lượt buổi sáng ghi nhận cả flash sale sẽ diễn ra muộn hơn trong ngày. Bấm lấy lại trong ngày **không làm mất** flash sale đã ghi nhận trước đó.

**Các cột số lượng bán:**

- **Đã bán:** tổng đã bán cộng dồn từ trước tới nay, số chính xác do ĐMX trả về (trên web họ chỉ hiện làm tròn, ví dụ "25,2k").
- **Bán trong ngày / tuần / tháng:** ĐMX không công bố số bán theo ngày, nên hệ thống lấy tổng đã bán của ngày cuối báo cáo trừ đi tổng đã bán của hôm trước / trước đầu tuần / trước đầu tháng. Đây là **số ước tính**, dùng để so sánh giữa các sản phẩm và các hãng.

**Đối thủ cùng tầm giá:** giá bán chênh trong khoảng ±20% so với sản phẩm Elmich, ưu tiên cùng kích thước rồi đến giá gần nhất.

**Màu sắc:** nền xanh lá nhạt là sản phẩm Elmich. Nền cam nhạt là chỗ cần chú ý, ví dụ sản phẩm Elmich chưa có đối thủ cùng tầm giá.

## 3. Thêm, ngừng theo dõi danh mục

Làm ngay trên web, ở mục **Danh mục theo dõi** (cuối trang). Không cần sửa code, không cần deploy.

- **Thêm:** mở danh mục trên dienmayxanh.com, copy link (ví dụ `https://www.dienmayxanh.com/noi-com-dien`), dán vào ô rồi bấm **Thêm danh mục**. Hệ thống tự kiểm tra link và lấy tên danh mục. Dữ liệu bắt đầu có từ lần lấy kế tiếp.
- **Ngừng theo dõi:** khi không kinh doanh hoặc không cần theo dõi nữa. Hệ thống thôi lấy dữ liệu mới nhưng **vẫn giữ lịch sử**, vẫn xuất Excel được các kỳ cũ. Bấm **Theo dõi lại** lúc nào cũng được.
- **Xoá:** chỉ dùng cho danh mục chưa có dữ liệu (ví dụ thêm nhầm).

## 4. Đổi đối thủ, giờ chạy

| Muốn đổi                                   | Sửa ở đâu                                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Danh sách đối thủ chính                    | `config/tracking.json` → `competitorBrands`                                                     |
| Khoảng giá "cùng tầm giá" (mặc định ±20%) | `config/tracking.json` → `segment.priceTolerancePercent`                                        |
| Giờ tự lấy dữ liệu trên Cloudflare        | `wrangler.jsonc` (mục `crons`) **và** `START_CRONS` trong `src/worker/index.ts`. Giờ ghi theo UTC = giờ VN − 7 |

Sửa xong thì deploy lại (mục 5). Danh mục mới thêm vào mục `categories` trong `config/tracking.json` sẽ tự xuất hiện trên web sau khi deploy; danh mục đã xoá trên web không bị thêm lại. Danh mục luôn được sắp xếp theo tên A→Z (cả sheet Excel lẫn trên web).

## 5. Cập nhật web trên Cloudflare

Mỗi khi sửa code hoặc cấu hình, mở PowerShell trong thư mục dự án và chạy:

```powershell
git pull
npm run cf:migrate     # cập nhật cấu trúc database nếu có thay đổi (không có thì báo "No migrations")
npm run cf:deploy
```

Các lệnh Cloudflare khác:

| Lệnh                     | Việc làm                                                         |
| ------------------------ | ---------------------------------------------------------------- |
| `npm run cf:pull-data`   | Kéo dữ liệu trên Cloudflare về máy (gộp vào `data/market.db`)    |
| `npm run cf:export-data` | Xuất dữ liệu trên máy ra file, chuẩn bị đưa lên Cloudflare       |
| `npm run cf:import-data` | Đưa file vừa xuất lên Cloudflare (chạy lại nhiều lần không trùng) |
| `npx wrangler tail`      | Xem log trực tiếp của web trên Cloudflare                        |
| `npx wrangler login`     | Đăng nhập lại Cloudflare nếu bị hỏi                              |

> **Cloudflare và máy là 2 nơi lưu dữ liệu riêng**, không tự đồng bộ. Hãy coi Cloudflare là nơi lưu chính và dùng link web. Khi cần chạy trên máy với đủ dữ liệu thì chạy `npm run cf:pull-data`.

<details>
<summary>Cài đặt Cloudflare từ đầu (chỉ làm 1 lần, đã làm xong)</summary>

```powershell
npm install
npx wrangler login                       # bấm Allow trên trình duyệt
npx wrangler d1 create elmich-monitor    # dán database_id vào wrangler.jsonc
npm run cf:migrate                       # tạo bảng
npx wrangler secret put AUTH_USER        # tên đăng nhập web
npx wrangler secret put AUTH_PASSWORD    # mật khẩu web
npm run cf:deploy
```

Gói miễn phí của Cloudflare chỉ cho mỗi lần chạy rất ít thời gian xử lý, nên hệ thống lấy dữ liệu theo **từng trang** (50 sản phẩm một lần). Từ 7:25 sáng, mỗi phút lấy 1 trang, với 22 danh mục thường xong trong khoảng 8:10–8:40. File Excel được tạo ngay trên trình duyệt.

</details>

## 6. Chạy trên máy (dành cho người sửa code)

Cần **Node.js 22.13 trở lên**.

```powershell
npm install
copy .env.example .env      # rồi mở .env đặt AUTH_USER / AUTH_PASSWORD
npm run dev                 # mở http://localhost:3000, tự tải lại khi sửa code
```

| Lệnh                              | Việc làm                                   |
| --------------------------------- | ------------------------------------------ |
| `npm run crawl`                   | Lấy dữ liệu 1 lượt ngay                    |
| `npm run export -- --period week` | Xuất Excel tuần này vào thư mục `reports/` |
| `npm test`                        | Chạy kiểm thử                              |
| `npm run typecheck`               | Kiểm tra lỗi TypeScript                    |
| `npm run format`                  | Định dạng code (VS Code tự làm khi lưu)    |

Bản trên máy lưu dữ liệu vào `data/market.db`, tự lấy dữ liệu theo `CRAWL_CRON` trong `.env` (mặc định 7:25 sáng) nếu máy đang bật.

### Code nằm ở đâu

```
config/tracking.json   danh mục, đối thủ, quy tắc so sánh
src/crawler/           gọi API Điện Máy Xanh, lấy dữ liệu theo từng trang
src/db/                lưu dữ liệu (dùng chung cho máy và Cloudflare)
src/report/            phân tích số liệu (analysis.ts, market.ts, sales.ts) và dựng Excel (excel/)
src/api/               API cho web
src/worker/            bản chạy trên Cloudflare
src/client/            tạo file Excel trên trình duyệt
public/                giao diện web (dashboard.js = biểu đồ)
tests/                 kiểm thử
```

| Muốn…                       | Sửa ở đâu                                                                         |
| --------------------------- | --------------------------------------------------------------------------------- |
| Thêm / bớt cột trong Excel  | `src/report/excel/sheets/*.ts` (sheet danh mục: `categorySheets.ts`)              |
| Đổi màu, font Excel         | `src/report/excel/theme.ts`                                                       |
| Đổi cách chọn đối thủ       | `src/report/analysis.ts` (`findCompetitors`)                                      |
| Thêm trường dữ liệu mới     | `crawler/dmx/schema.ts` → `normalize.ts` → thêm migration trong `db/migrations.ts`, chạy `npm run cf:migrations` rồi `npm run cf:migrate` |

**Khi ĐMX đổi API:** lượt lấy dữ liệu sẽ báo lỗi rõ ràng ở mục "Các lần gần đây" trên web, không ghi dữ liệu sai. Mở trang danh mục bằng Chrome → DevTools (F12) → tab **Network** → lọc **Fetch/XHR** → bấm "Xem thêm" để thấy API mới, rồi sửa `src/crawler/dmx/client.ts` và `schema.ts`.

## 7. Lưu ý

- Hệ thống chỉ đọc **dữ liệu công khai**, mỗi ngày một lượt, tốc độ chậm để không làm phiền ĐMX.
- Số "đã bán" là con số ĐMX hiển thị công khai, chỉ nên dùng để xem **xu hướng**, không phải doanh số thật.
- Giá có thể khác nhau theo tỉnh/thành. Hệ thống luôn dùng một khu vực cố định để các kỳ so sánh được với nhau.
