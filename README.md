# Super Net Recruitment Hub

Website tuyển dụng nội bộ: **Admin cấp tài khoản → HR tiếp nhận CV → Sếp chọn Hẹn phỏng vấn → HR liên hệ, chọn ngày/giờ/thời lượng → lịch hiển thị trên dashboard**.

Bảng màu Super Net: navy `#034969`, xanh dương `#149cd0`, xanh lá `#93c947`. Một hồ sơ ứng viên gốc, nhiều lượt ứng tuyển và nhiều phiên bản CV.

## Cài đặt trong VS Code

Cài Git, **Node.js 24+** và VS Code. Trong Terminal:

```bash
git clone https://github.com/supernetec01/HR-Recruitment-.git
cd HR-Recruitment-
npm ci
npm run setup
npm run dev
```

`setup` chỉ chạy ở lần cài đầu tiên: tên đăng nhập mặc định `admin`, nhập mật khẩu quản trị do công ty chỉ định. Mật khẩu không hiển thị khi gõ, không có mật khẩu mặc định trong source, chỉ lưu băm scrypt trong SQLite. Nếu đã có Admin, setup từ chối ghi đè; quản lý mật khẩu bằng giao diện.

`dev` chạy API cổng 3000 và Vite cổng 5173. Nhập `http://localhost:5173` trong trình duyệt **máy đang chạy dự án** và đăng nhập. Đây là địa chỉ chạy tại máy bạn, không phải website đã triển khai. Không cần `.env`; `.env.example` chỉ là tài liệu và không tự nạp.

Xem [hướng dẫn VS Code và sử dụng](docs/vscode.md), [thiết kế dữ liệu](docs/design.md). Ảnh giao diện dùng dữ liệu kiểm thử: [Dashboard](docs/screenshots/hr-desktop.png), [Điện thoại](docs/screenshots/hr-mobile.png).

## Phân quyền

| Chức năng | Admin | Sếp | HR |
| --- | --- | --- | --- |
| Tạo user, đổi quyền, khóa/mở, đặt lại mật khẩu | Có | — | — |
| Xem hồ sơ, CV đã kiểm tra, dashboard/báo cáo | Có | Có | Có |
| Tiếp nhận/sửa hồ sơ, upload CV, xác minh trùng | Có | — | Có |
| Chọn CV và yêu cầu Hẹn phỏng vấn | Có | Có | — |
| Nhận yêu cầu, liên hệ, tạo/đổi/hủy lịch | Có | — | Có |
| Quản lý vị trí tuyển dụng | Có | — | Có |
| Đổi mật khẩu cá nhân | Có | Có | Có |

Backend kiểm tra quyền trên từng API. Khóa tài khoản, đổi quyền hoặc đặt lại mật khẩu thu hồi các phiên đăng nhập. Không thể tự khóa/hạ quyền Admin đang dùng hoặc làm mất quản trị viên cuối cùng.

## Quy trình sử dụng

1. **Admin:** Thành viên & phân quyền → Tạo tài khoản. Điền họ tên, tên đăng nhập, vai trò, mật khẩu từ 12 ký tự; email không bắt buộc. Tạo tài khoản Sếp và HR. Mở vị trí tuyển dụng trong trang Vị trí tuyển dụng.
2. **HR:** Thêm ứng viên / Upload CV từ Facebook, email, Zalo… Có thể lưu thiếu thông tin; giữ nguồn và ngày nhận thực tế. PDF/DOCX tối đa 10 MB, được cách ly. HR kiểm tra an toàn qua quy trình bên ngoài rồi ghi căn cứ tại CV & tài liệu → Ghi nhận kiểm tra. Chưa có quét virus tự động.
3. **Sếp:** Mở hồ sơ → CV & tài liệu → Xem CV (PDF; DOCX tải xuống). Tại Tổng quan của hồ sơ, chọn Hẹn phỏng vấn, đúng vị trí và phiên bản CV, ghi chú gửi HR. Đây là yêu cầu xếp lịch, chưa phải giờ hẹn hoặc quyết định tuyển dụng.
4. **HR:** Nhận yêu cầu trên dashboard/Yêu cầu phỏng vấn. Liên hệ ứng viên rồi chọn Liên hệ & xếp lịch: ngày, giờ bắt đầu, thời lượng 15–240 phút, người phỏng vấn và địa điểm. Giờ kết thúc tự tính; kiểm tra trùng cả ứng viên lẫn người phỏng vấn.
5. **Dashboard:** Bảng theo ngày, khung giờ, số phút, ứng viên, vị trí và người phỏng vấn, theo UTC+7. Đổi lịch cần lý do; hủy lịch đưa yêu cầu về chờ HR; hoàn thành chỉ sau giờ bắt đầu. Nhật ký giữ người và nội dung thay đổi. Tự cập nhật mỗi 30 giây hoặc khi trở lại tab; có nút cập nhật thủ công.

Cổng `/tuyen-dung` cho ứng viên tự gửi; nghi trùng được đưa vào Chờ xác minh để HR quyết định, không tự ghi đè danh tính/CV. HR có thể tạo link bổ sung có hạn, dùng một lần để thêm đúng hồ sơ. Những luồng tiếp nhận trước đây được giữ nguyên.

## Dữ liệu và vận hành

- Nội bộ mặc định: `.data/internal/recruitment.sqlite` và `.data/internal/documents/`. Không tạo user/ứng viên giả; Admin được tạo bằng setup, các dữ liệu khác qua giao diện.
- Dữ liệu được giữ sau khi khởi động lại. **Không xóa `.data/` để cập nhật.** GitHub chỉ lưu source, không lưu tài khoản/mật khẩu/CV. Khi clone máy khác cần setup mới hoặc khôi phục database đã sao lưu.
- Sao lưu nhất quán: dừng dịch vụ rồi sao lưu toàn bộ `.data/internal/` vào vùng riêng được bảo vệ; khôi phục cả SQLite và documents cùng nhau. Chưa có backup tự động.
- `DATA_DIR` chọn thư mục dữ liệu riêng. Đổi thư mục không tự chuyển tài khoản từ nơi cũ.

Máy chủ công ty:

```bash
npm ci
npm run setup
npm run build
npm start
```

Bỏ qua setup nếu đã có Admin. `start` phục vụ frontend đã build và API chung cổng 3000, bind 127.0.0.1 mặc định. Cho máy khác trong công ty truy cập: đặt `HOST=0.0.0.0`, giới hạn truy cập trong mạng công ty/reverse proxy và dùng IP/hostname máy chủ thay cho localhost.

Trên Linux/macOS: `HOST=0.0.0.0 npm start`. PowerShell: đặt `$env:HOST="0.0.0.0"`, rồi `npm start`. Khi dùng HTTPS, đặt `NODE_ENV=production`, `DEMO_MODE=0`, `APP_ORIGIN` đúng origin HTTPS. Production bật cookie Secure nên không dùng cờ này trong lúc thử bằng HTTP trực tiếp. Cần quản lý khởi động lại dịch vụ trên máy chủ. Phiên này chưa triển khai lên domain hay máy chủ công ty.

## Demo riêng và kiểm thử

`npm run demo` mới bật dữ liệu minh họa và nút đổi vai trò, lưu trong `.data/`, tách khỏi `.data/internal/`. Không dùng CV thật trong demo. Không chạy demo/dev cùng lúc vì dùng chung cổng. API ngoài demo không nhận phiên demo hoặc cho đổi vai trò tự do.

```bash
npm run check
npm test
npm run test:e2e
```

TypeScript kiểm tra frontend, cấu hình và test trình duyệt. Test API dùng SQLite/cổng tạm thật. Playwright build rồi chạy hai máy chủ riêng: demo ở 3100, nội bộ ở 3110; mật khẩu test sinh ngẫu nhiên và dữ liệu tách khỏi môi trường vận hành. Dùng `/usr/bin/chromium` nếu có, máy khác chạy `npx playwright install chromium`; `CHROMIUM_PATH` cho phép ghi đè.

## Phạm vi còn lại

Phân quyền nội bộ và quy trình hẹn phỏng vấn đã triển khai. AI đọc/dịch CV, email/SMS tự động, đồng bộ lịch ngoài, phê duyệt offer/tuyển dụng cuối cùng, PostgreSQL/S3, quét virus tự động, SSO, quyền theo phòng ban/từng hồ sơ, chính sách xóa dữ liệu và backup tự động chưa tích hợp. Hệ thống không tự quyết định tuyển dụng hay gửi CV sang AI. Hướng dẫn Windows/macOS hỗ trợ cấu hình đa nền tảng nhưng chưa được kiểm chứng trên máy Windows/macOS thật.
