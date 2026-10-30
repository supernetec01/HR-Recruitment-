# Super Net Recruitment Hub

Phiên bản phát triển chạy được cho quy trình **một hồ sơ cá nhân, nhiều lượt ứng tuyển và nhiều lần bổ sung**. Giao diện tiếng Việt, tối ưu cho HR trên máy tính và dùng được trên điện thoại. Dữ liệu lưu ở máy chủ, không dùng localStorage để giả lập cơ sở dữ liệu.

Ảnh giao diện đã chạy trên Chromium: [HR trên máy tính](docs/screenshots/hr-desktop.png), [HR trên điện thoại](docs/screenshots/hr-mobile.png), [cổng ứng tuyển](docs/screenshots/careers.png). Ảnh chỉ chứa dữ liệu minh họa.

**Mới bắt đầu?** Xem [hướng dẫn VS Code từng bước](docs/vscode.md): tải mã nguồn từ GitHub, cài Node.js, chạy demo, thử ba luồng hồ sơ, debug và xử lý lỗi trên Windows/macOS/Linux.

## Chạy nhanh

Yêu cầu Node.js **24 trở lên**, npm và hệ thống tập tin có quyền ghi.

```bash
cd HR-Recruitment-
npm ci
npm run dev
```

Lệnh `dev` khởi động Vite ở cổng 5173 và API ở cổng 3000. Proxy Vite chuyển `/api` tới API. Chế độ demo được bật rõ ràng trong lệnh này và tạo 12 ứng viên, 5 vị trí, 4 nhân sự cùng các CV PDF minh họa. Không nhập CV thật vào demo. Không cần token GitHub, API AI, dịch vụ email hoặc tài khoản cơ sở dữ liệu để chạy bản phát triển.

Đường dẫn ứng dụng:

| Đường dẫn | Chức năng |
| --- | --- |
| `/` | Không gian HR; mặc định là quản lý ứng viên |
| `/?page=overview` | Dashboard từ dữ liệu trong hệ thống |
| `/?page=pipeline` | Pipeline theo từng lượt ứng tuyển |
| `/?page=jobs` | Quản lý vị trí tuyển dụng |
| `/?page=interviews` | Lịch nội bộ và kiểm tra trùng giờ |
| `/?page=reports` | Nguồn tiếp nhận, vị trí và giai đoạn |
| `/?page=settings` | Thành viên, ma trận quyền và đổi vai trò trong demo |
| `/tuyen-dung` | Cổng ứng tuyển công khai |
| `/ung-tuyen/:jobId` | Nộp hồ sơ cho một vị trí |
| `/bo-sung/:token` | Bổ sung vào đúng hồ sơ; liên kết có hạn và dùng một lần |

Các địa chỉ loopback chỉ dùng để kiểm tra bên trong môi trường. Tài liệu này không tạo liên kết preview hay xuất bản ứng dụng.

## Những luồng đã triển khai

1. **HR tiếp nhận hồ sơ** từ Facebook, Zalo, email, TopCV, giới thiệu, giấy hoặc nguồn khác. Có hai điểm vào: Thêm ứng viên và Upload CV. Có thể lưu chỉ với một thông tin hoặc tệp CV; phần còn thiếu được đánh dấu để bổ sung sau.
2. **Ứng viên tự nộp**: chọn vị trí đang tuyển, điền ít nhất một thông tin liên hệ, gửi CV và xác nhận thông báo xử lý dữ liệu. Không cần tài khoản.
3. **Kiểm tra trùng** bằng email viết thường và số điện thoại đã chuẩn hóa (`+84` về `0`). HR xác nhận liên kết hoặc xác nhận là người khác kèm lý do. Hồ sơ công khai nghi trùng được giữ trong hàng chờ; API không tiết lộ hồ sơ đã có cho người nộp.
4. **Giữ hồ sơ gốc**: liên kết không ghi đè tên, thông tin liên hệ, nguồn đầu tiên, sự đồng ý hoặc CV cũ. Thông tin vừa nhận được lưu trong nhật ký để HR đối chiếu. Mỗi tệp mới là một phiên bản riêng.
5. **Nhiều lượt ứng tuyển**: mỗi vị trí có một lượt đang xử lý cho cùng ứng viên. Gửi bổ sung cho cùng lượt đang xử lý không tạo thêm lượt. Nếu lượt trước đã kết thúc (`hired`/`rejected`), ứng tuyển lại tạo lượt mới và giữ nguyên hồ sơ cá nhân.
6. **Liên kết bổ sung**: HR chọn hạn 24 giờ, 3 ngày hoặc 7 ngày; chỉ lưu mã băm của token. Ứng viên có thể thêm CV, portfolio, thông tin thiếu và lời nhắn. Link không cho đọc dữ liệu gốc hay tự ghi đè thông tin đã có. Có thể thu hồi; rút lại sự đồng ý sẽ thu hồi các link đang hoạt động.
7. **Nhật ký**: ghi người thực hiện, thời điểm, nội dung trước/sau khi chỉnh sửa, nguồn, ngày nhận thực tế, ngày nhập hệ thống, sự đồng ý, liên kết, chuyển giai đoạn, xem và tải tài liệu.
8. **Quản lý tập trung**: tìm kiếm có/không dấu, lọc nguồn/vị trí/HR/giai đoạn, phân trang, phân công nhiều hồ sơ, xuất CSV (chống công thức bảng tính), chi tiết ứng viên và báo cáo từ dữ liệu thật.
9. **Lịch phỏng vấn nội bộ**: tạo lịch với một người phỏng vấn, kiểm tra trùng khoảng thời gian trong giao dịch, chặn thiếu liên hệ/sự đồng ý, ghi hoàn thành/hủy. Thời gian hiển thị theo UTC+7.

## Kiểm tra

```bash
npm run check
npm test
npm run build
npm run test:e2e
```

- `check`: TypeScript frontend.
- `test`: kiểm thử tích hợp API bằng Node test runner, SQLite thật và cổng loopback tạm thời. Mỗi lần chạy có thư mục dữ liệu riêng rồi dọn sạch.
- `test:e2e`: build rồi kiểm thử bằng Playwright/Chromium, dùng máy chủ riêng ở cổng 3100 và thư mục SQLite tạm riêng. Bao phủ HR nhập thiếu, phát hiện trùng, xác minh hồ sơ website, CV nhiều phiên bản, liên kết bổ sung không đăng nhập, lọc/phân công/phân quyền và màn hình 390px.
- Chromium trong môi trường này ở `/usr/bin/chromium` và được tự nhận diện nếu có. Trên máy khác, chạy `npx playwright install chromium`; cấu hình sẽ dùng Chromium do Playwright cài. `CHROMIUM_PATH` cho phép chỉ định trình duyệt riêng. Không tắt kiểm tra TLS khi cài dependencies/trình duyệt.

Nếu sandbox chặn mở socket loopback hoặc truy cập npm/Git, chạy qua quyền mạng được nền tảng hỗ trợ; không đổi proxy hay vô hiệu hóa xác minh chứng chỉ. Trong máy hiện tại, GitHub và npm hoạt động qua proxy khi có quyền mạng.

## Dữ liệu & kiến trúc

- Frontend: React 19, TypeScript, Vite, Lucide; CSS responsive; font tiếng Việt được đóng gói cục bộ.
- Backend: Express 5, Zod; REST `/api/v1`.
- Database phát triển: SQLite tích hợp Node (`node:sqlite`), khóa ngoại, WAL, giao dịch và chỉ mục chống hai lượt đang xử lý cho cùng vị trí/ứng viên.
- Dữ liệu mặc định: `.data/recruitment.sqlite`; tài liệu riêng trong `.data/documents`. Thư mục không được phục vụ dưới dạng static và được bỏ qua bởi Git.
- `DATA_DIR` thay đổi nơi lưu. Thư mục dữ liệu phải được giữ cùng ứng dụng qua các lần khởi động. Không ghi đè hoặc xóa nó khi cài lại dependencies.
- Các tệp tải lên được kiểm tra đuôi/chữ ký cơ bản, giới hạn 10 MB, lưu tên ngẫu nhiên và **cách ly mặc định**. Chỉ có thể tải sau khi HR ghi nhận căn cứ kiểm tra an toàn thủ công. Đây không phải bộ quét malware; chưa được dùng thay quy trình quét virus trong vận hành thật.
- `candidate`, `application`, `document`, `submission`, `interview`, `audit_log`, `update_token` là các đối tượng riêng. Thiết kế và giới hạn chi tiết ở [docs/design.md](docs/design.md).

## Xác thực và quyền

Phiên bản này hỗ trợ đăng nhập email/mật khẩu và phiên HttpOnly 8 giờ. Mật khẩu băm scrypt, token phiên và link bổ sung băm SHA-256. Cookie SameSite, kiểm tra Origin và header riêng cho các thao tác nội bộ, rate limit ở đăng nhập/cổng công khai. Mọi API nội bộ yêu cầu phiên; quyền ghi được kiểm tra ở backend.

| Vai trò | Quyền hiện có |
| --- | --- |
| HR | Xem và cập nhật toàn bộ hồ sơ trong không gian, CV, xác minh trùng, vị trí và lịch |
| Boss | Chỉ đọc hồ sơ, CV đã kiểm tra, lịch và báo cáo |
| Admin | Quyền ghi vận hành như HR; tạo tài khoản qua lệnh phía máy chủ |

Phê duyệt quyết định của Boss **chưa triển khai**. Backend chặn tự chuyển sang `offered` hoặc `hired`; không có nút giả để duyệt. Các trạng thái offer/hired trong demo là dữ liệu minh họa. HR không được sửa các lượt đã có quyết định trong phiên bản này. Chưa có phân quyền chi tiết theo phòng ban/từng hồ sơ.

## Khởi động ngoài demo

```bash
npm run build
DATA_DIR=/duong-dan-rieng/du-lieu-noi-bo npm run create-user
DATA_DIR=/duong-dan-rieng/du-lieu-noi-bo DEMO_MODE=0 npm start
```

Trước lệnh `create-user`, cấp qua biến môi trường bảo mật: `USER_NAME`, `USER_EMAIL`, `USER_PASSWORD` (tối thiểu 12 ký tự), tùy chọn `USER_ROLE=admin|hr|boss`. Script không in mật khẩu. Không đặt mật khẩu vào lệnh đã lưu trong repository hoặc gửi trong chat. `.env.example` chỉ là tài liệu; ứng dụng không tự đọc `.env`.

`npm start` dùng cổng `PORT` (mặc định 3000) và bind `HOST` (mặc định 127.0.0.1). Dùng reverse proxy HTTPS đã cấu hình đúng, `NODE_ENV=production`, `APP_ORIGIN` là origin HTTPS chính xác và `DEMO_MODE=0`. `NODE_ENV=production` bật cookie Secure; không bật nó nếu đang kiểm tra bằng HTTP nội bộ. Entry point từ chối demo khi `NODE_ENV=production`; API ngoài demo cũng không chấp nhận phiên tài khoản demo. Tách `DATA_DIR` demo khỏi dữ liệu thật.

## Phạm vi cần hoàn thiện trước vận hành thực

Đây là bản phát triển cho các luồng tiếp nhận, chưa phải bản triển khai production. Chưa có PostgreSQL, S3 private storage, quét virus tự động, worker/outbox, email/nhắc lịch, đánh giá nhiều người, phê duyệt của Boss, offer, AI OCR/dịch Việt–Trung, SSO/khôi phục mật khẩu, phân quyền theo hồ sơ, chính sách lưu trữ/xóa dữ liệu hay backup/restore vận hành. Thông báo xử lý dữ liệu trong biểu mẫu được ghi rõ là bản phát triển và cần được Super Net hoàn thiện trước khi dùng dữ liệu thật.

Không gửi dữ liệu ứng viên sang dịch vụ AI hay dịch thuật ở phiên bản này. Không có API key nào được yêu cầu hoặc lưu trong mã nguồn.
