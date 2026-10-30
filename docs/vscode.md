# VS Code và sử dụng nội bộ Super Net

## Cài đặt lần đầu

Cài [Git](https://git-scm.com/downloads), [Node.js 24 LTS hoặc mới hơn](https://nodejs.org/) và [VS Code](https://code.visualstudio.com/). Mở Terminal:

```bash
git clone https://github.com/supernetec01/HR-Recruitment-.git
cd HR-Recruitment-
code .
```

Nếu không có lệnh `code`, mở VS Code → File → Open Folder và chọn thư mục chứa `package.json`. Repository riêng tư cần đăng nhập GitHub có quyền truy cập; không nhúng token vào URL. Sau khi cài Node/Git, mở lại VS Code để nhận PATH mới.

Trong VS Code → Terminal → New Terminal:

```bash
node --version
npm ci
npm run dev
```

Node phải từ v24. Khi khởi động lần đầu trong Terminal, ứng dụng hỏi tên đăng nhập mặc định **admin** và mật khẩu quản trị công ty đã chọn (từ 12 ký tự). Mật khẩu không hiện khi gõ và không ghi vào source. Khi đã có Admin thì không hỏi lại và không đổi mật khẩu. Nếu cần khởi tạo riêng trước khi chạy, dùng `npm run setup`.

Nhập `http://localhost:5173` vào trình duyệt trên máy này để đăng nhập. Đây là địa chỉ chạy trên máy bạn, không phải website đã triển khai. Nội bộ không tự đăng nhập hoặc cho tự đổi vai trò. `.env.example` là tài liệu và không tự nạp.

## Admin tạo người dùng

Vào **Thành viên & phân quyền → Tạo tài khoản**:

- Họ và tên, tên đăng nhập (3–50 ký tự: chữ không dấu/số/dấu chấm/gạch dưới/gạch ngang).
- Email không bắt buộc. Nếu có thì cũng dùng email để đăng nhập.
- Vai trò: **Quản trị viên**, **Sếp**, **HR**.
- Mật khẩu từ 12 ký tự; gửi riêng cho đúng nhân sự.

Admin sửa tên/email/quyền, đặt mật khẩu mới, khóa/mở tài khoản từ danh sách. Khóa, đổi quyền hoặc mật khẩu thu hồi phiên đăng nhập cũ. Không thể tự khóa/hạ quyền Admin đang dùng.

Tạo ít nhất một Sếp và một HR. Để thử hai vai trò, dùng trình duyệt hoặc cửa sổ riêng tư độc lập; các tab thông thường dùng chung cookie. Mỗi nhân sự đổi mật khẩu cá nhân tại trang này.

## Admin/HR tạo và chỉnh sửa JD

1. Đăng nhập bằng tài khoản **Admin hoặc HR**, mở **Vị trí tuyển dụng → Tạo JD tuyển dụng**.
2. Nhập tên vị trí, bộ phận, số lượng, hình thức và địa điểm. Chọn ngành hàng **Safestraps / JieLien / Baby tatto**, hoặc **Chung · Super Net**. Bổ sung mức lương và thời gian làm việc nếu có.
3. Điền **Mô tả công việc**, **Yêu cầu ứng viên**, **Quyền lợi**; mỗi ý một dòng. Hạn nhận hồ sơ có thể để trống.
4. Chọn **Đang tuyển → Lưu & đăng JD** để ứng viên xem, hoặc **Tạm dừng → Lưu JD** khi nội dung chưa sẵn sàng.
5. Mỗi vị trí có nút **Chỉnh sửa JD**, **Xem JD** và chia sẻ liên kết. Có thể tạm dừng mà không xóa vị trí hay hồ sơ đã nhận. Tin quá hạn tự ẩn theo ngày UTC+7; muốn tuyển lại thì sửa/xóa hạn và mở lại. Nếu người khác sửa trước khi bạn lưu, tải lại vị trí để lấy bản mới.

Sếp chỉ được xem, không được tạo/chỉnh sửa JD. Mọi thay đổi lưu vào database, có nhật ký người sửa và nội dung trước/sau.

Trang công khai nằm tại `/tuyen-dung`: giới thiệu phụ kiện xe **Safestraps**, thiết bị âm thanh **JieLien**, Mẹ và Bé **Baby tatto**, rồi danh sách vị trí đang tuyển. Chọn vị trí → đọc JD → **Ứng tuyển ngay**; ứng viên không cần tài khoản. Mỗi JD có đường dẫn riêng `/tuyen-dung/:id` để gửi cho ứng viên. Tìm kiếm và bộ lọc giúp chọn đúng ngành hàng.

Với máy chủ hiện tại, mở `http://192.168.1.5:5173/tuyen-dung`. Địa chỉ IP này dùng trong mạng nội bộ; ứng viên ngoài công ty cần domain/địa chỉ công khai được triển khai và truy cập được. Nếu trình duyệt HTTP không cho sao chép tự động, chọn nội dung ô liên kết rồi Ctrl+C.

## HR nhận hồ sơ và Sếp chọn CV

1. Admin/HR đăng JD tại **Vị trí tuyển dụng → Tạo JD tuyển dụng**. Không gian mới không có dữ liệu giả.
2. HR dùng **Quản lý ứng viên → Thêm ứng viên / Upload CV**. Nhập những gì đã có, chọn nguồn, ngày nhận thực tế và vị trí; có thể lưu thiếu thông tin.
3. CV mới cách ly. HR kiểm tra an toàn bằng quy trình bên ngoài rồi vào **CV & tài liệu → Ghi nhận kiểm tra** để ghi căn cứ. Chưa có quét virus tự động. Sếp sau đó xem PDF trực tiếp hoặc tải DOCX.
4. Sếp mở hồ sơ, đọc CV trong **CV & tài liệu**. Về tab **Tổng quan** của hồ sơ → **Hẹn phỏng vấn**, chọn vị trí, phiên bản CV và ghi chú gửi HR.
5. Yêu cầu được lưu cùng người chọn, thời điểm, CV và hiển thị tại dashboard/**Yêu cầu phỏng vấn**. Đây chưa phải giờ hẹn đã xác nhận hoặc quyết định tuyển dụng.

Ứng viên tự gửi qua `/tuyen-dung`. Hồ sơ nghi trùng vào Chờ xác minh để HR xác nhận; không tự ghi đè hồ sơ/CV cũ. Link bổ sung do HR tạo có hạn và dùng một lần, thêm đúng hồ sơ. Link có hostname localhost chỉ dùng trên máy đang chạy ứng dụng; khi dùng chung cần mở qua hostname/IP/domain máy chủ.

## HR xếp lịch và dashboard

1. HR đọc yêu cầu và liên hệ ứng viên thống nhất thời gian.
2. Chọn **Liên hệ & xếp lịch** → ngày, giờ bắt đầu, **thời lượng** (ví dụ 45/90 phút), người phỏng vấn, hình thức, địa điểm/link họp.
3. Hệ thống tính giờ kết thúc và chặn trùng cả ứng viên và người phỏng vấn; các buổi trong tương lai, cùng ngày, 15–240 phút.
4. **Tổng quan** và **Lịch phỏng vấn** có bảng theo ngày/khung giờ, số phút, ứng viên/vị trí/người phỏng vấn. Chọn ngày hoặc Ngày trước/Ngày sau/Hôm nay. Tất cả theo UTC+7.
5. **Đổi lịch** cần lý do; hủy lịch đưa yêu cầu về chờ HR; chỉ hoàn thành sau giờ bắt đầu. Xem lịch sử trong hồ sơ.

Yêu cầu/lịch tự cập nhật mỗi 30 giây hoặc khi quay lại tab; dashboard có nút cập nhật. Đây là thông báo trong website, chưa gửi email tự động.

## Tác vụ và debug VS Code

Terminal → Run Task: **Super Net: Cài dependencies**, **Chạy nội bộ**, **Kiểm tra TypeScript**, **Kiểm thử API**, **Build**. Ctrl+Shift+B (macOS Cmd+Shift+B) chạy build.

Để debug, dừng `npm run dev`, mở Run and Debug → **Super Net: Debug toàn bộ ứng dụng** → F5. API nội bộ và Vite chạy riêng. Đặt breakpoint ở `server/app.mjs` hoặc `server/internal.mjs`, thao tác trên website để xem request. Stop dừng cả hai phiên. Không cần extension trả phí.

## Kiểm tra, cập nhật và dữ liệu

```bash
npm run check
npm test
npx playwright install chromium
npm run test:e2e
```

Linux có `/usr/bin/chromium` được tự nhận; nơi khác dùng Chromium của Playwright hoặc đặt `CHROMIUM_PATH`. Test dùng tài khoản/dữ liệu riêng, không thay database đang dùng. Các cổng test là 3100, 3110 và 3120 (proxy Vite).

Khi cập nhật, dừng dịch vụ, lưu/commit công việc đang sửa rồi:

```bash
git pull --ff-only
npm ci
npm run dev
```

Không cần setup lại. Các trường JD mới được thêm tự động khi khởi động, giữ nguyên vị trí, tài khoản và hồ sơ cũ. Không xóa `.data/`: dữ liệu nội bộ nằm trong `.data/internal/`, gồm SQLite và documents, không đi theo GitHub. Muốn backup, dừng dịch vụ và sao lưu toàn bộ thư mục này. Chưa có backup tự động. Chạy `npm run demo` nếu chỉ muốn trải nghiệm dữ liệu giả riêng, không chạy cùng lúc với dev.

## Chia sẻ cho các máy trong công ty

Build rồi phục vụ frontend và API chung một cổng:

```bash
npm run build
```

Linux/macOS:

```bash
HOST=0.0.0.0 npm start
```

Windows PowerShell:

```powershell
$env:HOST="0.0.0.0"
npm start
```

Các máy khác dùng hostname/IP máy chủ và cổng 3000, không dùng localhost. Giới hạn truy cập trong mạng công ty hoặc reverse proxy. Nếu dùng HTTPS: đặt `NODE_ENV=production`, `DEMO_MODE=0`, `APP_ORIGIN` đúng origin HTTPS. Cookie Secure của production yêu cầu HTTPS; không bật cờ production khi thử HTTP trực tiếp. Máy chủ cần giữ dịch vụ chạy và cấu hình tự khởi động lại. Push GitHub không phải triển khai website.

## Tệp và lỗi thường gặp

| Nội dung | Tệp |
| --- | --- |
| HR, pipeline, đăng nhập | `src/App.tsx` |
| Dashboard, bảng lịch, yêu cầu, tài khoản | `src/internal.tsx` |
| Bảng màu Super Net | `src/internal.css` |
| Hồ sơ, xem CV | `src/detail.tsx` |
| Biểu mẫu, thời lượng | `src/forms.tsx` |
| Quản trị JD, nội dung công việc | `src/jobs.tsx`, `src/forms.tsx` |
| Tuyển dụng công khai, trang JD | `src/public.tsx`, `src/job-page.tsx`, `src/careers.css` |
| API hồ sơ/xác thực | `server/app.mjs` |
| API JD, quyền sửa, hạn nhận hồ sơ | `server/jobs.mjs` |
| API tài khoản/yêu cầu/lịch | `server/internal.mjs` |
| Mật khẩu, khởi tạo Admin | `server/accounts.mjs` |
| Schema/migrations | `server/db.mjs` |

| Lỗi | Xử lý |
| --- | --- |
| Không có node:sqlite | Dùng Node 24+, mở lại VS Code và npm ci. |
| PowerShell chặn npm.ps1 | Dùng Terminal Profile Command Prompt hoặc npm.cmd; không cần đổi execution policy toàn máy. |
| Không có package.json | Mở đúng thư mục HR-Recruitment-. |
| Chưa có Admin | Chạy setup một lần, đúng DATA_DIR. |
| Đổi máy không còn tài khoản | Khôi phục database riêng hoặc setup mới; dữ liệu không đồng bộ qua Git. |
| Cổng bị chiếm | Dừng phiên dev/demo/debug/test cũ trước khi chạy lại. |
| Đăng nhập HTTP không giữ phiên | Không bật NODE_ENV=production khi thử HTTP trực tiếp. |
| Không xem được CV | HR kiểm tra an toàn; PDF xem trực tiếp, DOCX tải xuống. |
| JD không hiện công khai | Kiểm tra trạng thái Đang tuyển, hạn nhận hồ sơ và bộ lọc ngành hàng. |
| Không thấy nút tạo/sửa JD | Đăng nhập bằng Admin/HR; Sếp chỉ được xem. |
| Không đặt được lịch | Kiểm tra liên hệ/consent, thời gian tương lai, cùng ngày, thời lượng và xung đột. |

AI, email, phê duyệt offer, quét virus tự động và các giới hạn còn lại: xem [README](../README.md). Hướng dẫn Windows/macOS chưa được kiểm chứng trên máy Windows/macOS thật.

## Sửa lỗi đăng nhập tại địa chỉ LAN

Nếu đang dùng địa chỉ `http://192.168.1.5:5173`, cập nhật source rồi dừng tiến trình cũ bằng Ctrl+C. Chạy lại `npm run dev` trên máy `192.168.1.5`; khi máy mới chưa có Admin, hoàn tất các câu hỏi khởi tạo trong Terminal, sau đó đăng nhập. Trang sẽ tạm hiện hướng dẫn thay vì biểu mẫu đăng nhập trong khi chưa có Admin.

```bash
git pull --ff-only
npm ci
npm run dev
```

Vite phải được khởi động lại sau cập nhật để nạp cấu hình proxy mới. Không đổi IP thành localhost khi truy cập từ một máy khác. Vite chuyển tiếp địa chỉ LAN/cổng sang API một cách tự động; không cần mở cổng API 3000 cho các máy khác nếu đang dùng Vite ở 5173.

Sau reverse proxy HTTPS, đặt `APP_ORIGIN` đúng origin, giữ `X-Forwarded-Host`/`X-Forwarded-Proto` từ proxy và đặt `TRUST_PROXY` chỉ cho proxy thực. Đọc cấu hình trong README. Lỗi nguồn không hợp lệ vẫn được chặn; không bật CORS cho mọi website hay tắt kiểm tra nguồn.

Chữ được tăng 20% ở desktop lẫn điện thoại. Nếu vẫn thấy bản cũ sau khi khởi động lại, tải lại trang bằng Ctrl+F5 (macOS Cmd+Shift+R).
