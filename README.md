# Super Net Recruitment Hub

Website tuyển dụng Super Net: **Admin/HR đăng JD → ứng viên xem tuyển dụng và gửi CV → HR tiếp nhận hồ sơ → Sếp/Người phỏng vấn chọn ứng viên → HR xếp lịch → dashboard hiển thị ngày/giờ/thời lượng**.

Bảng màu Super Net: navy `#034969`, xanh dương `#149cd0`, xanh lá `#93c947`. Một hồ sơ ứng viên gốc, nhiều lượt ứng tuyển và nhiều phiên bản CV.

## Cài đặt trong VS Code

Cài Git, **Node.js 24+** và VS Code. Trong Terminal:

```bash
git clone https://github.com/supernetec01/HR-Recruitment-.git
cd HR-Recruitment-
npm ci
npm run dev
```

`npm run dev` sẽ hướng dẫn khởi tạo Admin ngay trong Terminal nếu máy mới chưa có tài khoản. Tên mặc định là `admin`, nhập mật khẩu quản trị công ty đã chọn; không hiển thị khi gõ. Có thể chủ động chạy `npm run setup` trước. Nếu đã có Admin, khởi động/setup giữ nguyên tài khoản và mật khẩu. Không có mật khẩu mặc định hardcode trong source; chỉ lưu băm scrypt trong SQLite.

`dev` chạy API cổng 3000 và Vite cổng 5173. Nhập `http://localhost:5173` trong trình duyệt **máy đang chạy dự án** và đăng nhập. Đây là địa chỉ chạy tại máy bạn, không phải website đã triển khai. Không cần `.env`; `.env.example` chỉ là tài liệu và không tự nạp.

Xem [hướng dẫn VS Code và sử dụng](docs/vscode.md), [thiết kế dữ liệu](docs/design.md). Ảnh giao diện dùng dữ liệu kiểm thử: [Trang tuyển dụng](docs/screenshots/careers.png), [JD công khai](docs/screenshots/job-description.png), [Dashboard](docs/screenshots/hr-desktop.png), [Điện thoại](docs/screenshots/hr-mobile.png).

## Phân quyền

| Chức năng | Admin | Sếp | Người phỏng vấn | HR |
| --- | --- | --- | --- | --- |
| Tạo user, đổi quyền, khóa/mở, đặt lại mật khẩu | Có | — | — | — |
| Xem hồ sơ, xem/tải CV, dashboard/báo cáo | Có | Có | Có | Có |
| Tiếp nhận/sửa hồ sơ, upload CV, xác minh trùng | Có | — | — | Có |
| Chọn CV, yêu cầu Hẹn phỏng vấn, đề xuất người phỏng vấn | Có | Có | Có | — |
| Nhận yêu cầu, liên hệ, tạo/đổi/hủy lịch | Có | — | — | Có |
| Tạo/sửa JD, mở/tạm dừng tuyển dụng | Có | — | — | Có |
| Đổi mật khẩu cá nhân | Có | Có | Có | Có |

Backend kiểm tra quyền trên từng API. Khóa tài khoản, đổi quyền hoặc đặt lại mật khẩu thu hồi các phiên đăng nhập. Không thể tự khóa/hạ quyền Admin đang dùng hoặc làm mất quản trị viên cuối cùng.

Chỉ Admin thấy **Thành viên & phân quyền**, danh sách tài khoản và bảng chức năng theo vai trò. Nhân sự khác thấy **Tài khoản → Tài khoản cá nhân** để đổi mật khẩu/đăng xuất; các trang làm việc hiển thị thao tác phù hợp và không có bảng giải thích vai trò.

## Quy trình sử dụng

1. **Admin:** Thành viên & phân quyền → Tạo tài khoản. Điền họ tên, tên đăng nhập, vai trò, mật khẩu từ 12 ký tự; email không bắt buộc. Có thể cấp vai trò Người phỏng vấn, Sếp hoặc HR. Admin/HR vào Vị trí tuyển dụng → Tạo JD tuyển dụng để đăng tin.
2. **HR:** Thêm ứng viên / Upload CV từ Facebook, email, Zalo… Có thể lưu thiếu thông tin; giữ nguồn và ngày nhận thực tế. PDF/DOCX tối đa 10 MB, lưu bản gốc theo phiên bản. Nhân sự đã đăng nhập có thể **Xem CV** hoặc **Tải xuống** ngay sau khi tiếp nhận, kể cả CV cũ chưa ghi nhận kiểm tra. PDF xem trực tiếp; DOCX hiển thị nội dung văn bản trong trình duyệt, tải bản gốc để giữ đầy đủ bố cục/hình ảnh. Ghi nhận kiểm tra là tùy chọn, không chặn quyền đọc/tải và không có nghĩa là đã quét virus tự động.
3. **Sếp/Người phỏng vấn:** Mở hồ sơ → Hẹn phỏng vấn, chọn vị trí, phiên bản CV, Người phỏng vấn đề xuất và ghi chú. CV mới nhận cũng được gắn vào yêu cầu; có thể xem/tải trong mục CV & tài liệu mà không cần đánh dấu kiểm tra trước. Đây là lựa chọn ứng viên cho vòng phỏng vấn, chưa phải quyết định tuyển dụng cuối cùng.
4. **HR:** Nhận yêu cầu trên dashboard/Yêu cầu phỏng vấn. Liên hệ ứng viên rồi chọn Liên hệ & xếp lịch: ngày, giờ bắt đầu, thời lượng 15–240 phút, người phỏng vấn và địa điểm. Người được đề xuất được chọn sẵn, HR có thể điều chỉnh. Nếu hồ sơ chưa xác nhận dữ liệu, nhập Nội dung đã trao đổi và đánh dấu Đã liên hệ ứng viên và thống nhất việc hẹn phỏng vấn. Việc này lưu riêng, không tự đổi consent sang đã đồng ý. Hồ sơ đã rút lại sự đồng ý cần ghi nhận sự đồng ý mới trước khi xếp lịch. Giờ kết thúc tự tính; kiểm tra trùng cả ứng viên lẫn người phỏng vấn.
5. **Dashboard:** Bảng theo ngày, khung giờ, số phút, ứng viên, vị trí và người phỏng vấn, theo UTC+7. Đổi lịch cần lý do; hủy lịch đưa yêu cầu về chờ HR; hoàn thành chỉ sau giờ bắt đầu. Nhật ký giữ người và nội dung thay đổi. Tự cập nhật mỗi 30 giây hoặc khi trở lại tab; có nút cập nhật thủ công.

Cổng `/tuyen-dung` cho ứng viên tự gửi; nghi trùng được đưa vào Chờ xác minh để HR quyết định, không tự ghi đè danh tính/CV. HR có thể tạo link bổ sung có hạn, dùng một lần để thêm đúng hồ sơ. Những luồng tiếp nhận trước đây được giữ nguyên.

## Đăng JD và trang tuyển dụng công khai

Trang `/tuyen-dung` giới thiệu ba ngành hàng: **phụ kiện xe Safestraps**, **thiết bị âm thanh JieLien**, **Mẹ và Bé Baby tatto**; phía dưới là vị trí đang tuyển, tìm kiếm và lọc ngành hàng.

Admin/HR vào **Vị trí tuyển dụng → Tạo JD tuyển dụng**. Biểu mẫu chia thành Thông tin chung, Nội dung công việc, Cách thức ứng tuyển và Đăng tuyển; nhập tên công ty, vị trí, bộ phận, ngành hàng, số lượng, hình thức, địa chỉ đầy đủ, mức lương, giờ làm, mô tả, yêu cầu, quyền lợi, hướng dẫn ứng tuyển, email nhận CV, tiêu đề email, Zalo và hạn nhận hồ sơ. Dùng **Xem trước JD** để kiểm tra trước khi lưu. Nội dung xuống dòng được giữ nguyên; các dòng bắt đầu bằng “-”/“•” hiển thị dạng danh sách.

**Điền mẫu Content Marketing** điền nội dung từ JD Super Net đã cung cấp, gồm địa chỉ Himlam, giờ 09:00–18:00 từ Thứ 2 đến Thứ 7, lương 10–15 triệu, nhiệm vụ, yêu cầu, bảo hiểm/quyền lợi và thông tin email/Zalo. Nội dung chỉ nằm trong biểu mẫu cho đến khi người dùng lưu. Có thể sửa mọi mục trước khi đăng; không tự thêm tin vào database đang vận hành. Chọn **Đang tuyển → Lưu & đăng JD** để công khai; chọn **Tạm dừng → Lưu JD** để lưu khi chưa muốn hiển thị.

Mỗi vị trí có **Chỉnh sửa JD**, **Xem JD**, chia sẻ liên kết và tạm dừng/mở lại. Ứng viên xem đầy đủ thông tin, nhiệm vụ, yêu cầu, lương/quyền lợi và cách ứng tuyển ở `/tuyen-dung/:id` rồi chọn **Ứng tuyển ngay**, không cần tài khoản. Email/Zalo hiển thị thành liên kết; tiêu đề email được gợi ý khi mở ứng dụng email. Sếp/Người phỏng vấn được xem nhưng không được tạo/sửa/tạm dừng JD; quyền được kiểm tra cả ở API.

Chỉ tin đang tuyển và còn hạn được công khai; ngày hết hạn tính đến hết ngày theo UTC+7. Tin quá hạn/tạm dừng bị ẩn cả ở danh sách và đường dẫn trực tiếp, ngừng nhận lượt ứng tuyển mới. Hồ sơ/lịch phỏng vấn đã có vẫn được giữ. Để tuyển lại tin hết hạn, chỉnh hạn nhận hồ sơ hoặc để trống rồi mở lại. Chỉnh sửa có kiểm tra phiên bản để tránh ghi đè cập nhật của người khác, đồng thời lưu người sửa, thời điểm và nội dung thay đổi.

Database cũ tự bổ sung các trường JD khi khởi động; giữ ID vị trí, mô tả cũ và các lượt ứng tuyển. Không cần tạo lại vị trí hay chạy setup lại. Link dùng IP `192.168.1.5` chỉ truy cập được trong mạng tương ứng; để ứng viên ngoài công ty truy cập, cần triển khai qua domain/địa chỉ công khai phù hợp.

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

TypeScript kiểm tra frontend, cấu hình và test trình duyệt. Test API dùng SQLite/cổng tạm thật, gồm phân quyền JD, cập nhật từng phần, hạn nhận hồ sơ và nâng cấp database cũ. Playwright kiểm tra đăng JD → xem công khai → nộp CV, chỉnh sửa/tạm dừng, phân quyền, điện thoại và các luồng tiếp nhận/lịch. Demo ở 3100, nội bộ ở 3110, proxy Vite kiểm thử ở 3120; mật khẩu test sinh ngẫu nhiên và dữ liệu tách khỏi môi trường vận hành. Dùng `/usr/bin/chromium` nếu có, máy khác chạy `npx playwright install chromium`; `CHROMIUM_PATH` cho phép ghi đè.

## Phạm vi còn lại

Phân quyền nội bộ và quy trình hẹn phỏng vấn đã triển khai. AI đọc/dịch CV, email/SMS tự động, đồng bộ lịch ngoài, phê duyệt offer/tuyển dụng cuối cùng, PostgreSQL/S3, quét virus tự động, SSO, quyền theo phòng ban/từng hồ sơ, chính sách xóa dữ liệu và backup tự động chưa tích hợp. Hệ thống không tự quyết định tuyển dụng hay gửi CV sang AI. Hướng dẫn Windows/macOS hỗ trợ cấu hình đa nền tảng nhưng chưa được kiểm chứng trên máy Windows/macOS thật.

## Đăng nhập qua mạng LAN và proxy

Với máy chủ ở `192.168.1.5`, mở địa chỉ `http://192.168.1.5:5173` trong khi chạy `npm run dev`. Vite tự chuyển tiếp hostname/cổng frontend và giao thức sang API, không cần hardcode địa chỉ IP này trong source. IP khác trong cùng cách triển khai cũng được xử lý tương tự. Các header do phía gọi tự gán sẽ bị Vite ghi đè.

Backend chỉ tin header chuyển tiếp từ proxy tin cậy (mặc định loopback, dành cho Vite/Nginx cùng máy). Reverse proxy ở máy/container khác cần đặt `TRUST_PROXY` đúng IP/CIDR proxy và `APP_ORIGIN` đúng origin website, ví dụ origin gồm giao thức, hostname và cổng, không có đường dẫn. Không dùng wildcard hoặc tin mọi proxy.

Nginx cùng máy nên giữ `Host $http_host`, `X-Forwarded-Host $http_host`, `X-Forwarded-Proto $scheme`. HTTPS production vẫn dùng cookie Secure; `npm run dev` dùng môi trường development cho HTTP nội bộ. Kiểm tra nguồn trái phép và phân quyền không bị tắt để khắc phục lỗi đăng nhập.

Nếu trang báo chưa có Admin, đó là database của máy đang chạy chưa được khởi tạo, không phải lỗi mật khẩu. Chạy lại `npm run dev` trong Terminal tương tác hoặc `npm run setup`; trang sẽ tự nhận biết sau khi Admin sẵn sàng. Cỡ chữ toàn giao diện đã tăng 20% (biến CSS `--text-scale: 1.2`), không phóng to toàn bộ trang bằng zoom.
