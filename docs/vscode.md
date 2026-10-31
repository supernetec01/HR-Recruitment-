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
npm run scanner:check
npm run dev
```

Node phải từ v24. Khi khởi động lần đầu trong Terminal, ứng dụng hỏi tên đăng nhập mặc định **admin** và mật khẩu quản trị công ty đã chọn (từ 12 ký tự). Mật khẩu không hiện khi gõ và không ghi vào source. Khi đã có Admin thì không hỏi lại và không đổi mật khẩu. Nếu cần khởi tạo riêng trước khi chạy, dùng `npm run setup`.

Nhập `http://localhost:5173` vào trình duyệt trên máy này để đăng nhập. Đây là địa chỉ chạy trên máy bạn, không phải website đã triển khai. Nội bộ không tự đăng nhập hoặc cho tự đổi vai trò. `.env.example` là tài liệu và không tự nạp.

## Admin tạo người dùng

Vào **Thành viên & phân quyền → Tạo tài khoản**:

- Họ và tên, tên đăng nhập (3–50 ký tự: chữ không dấu/số/dấu chấm/gạch dưới/gạch ngang).
- Email không bắt buộc. Nếu có thì cũng dùng email để đăng nhập.
- Vai trò: **Quản trị viên**, **Sếp**, **Người phỏng vấn**, **HR**.
- Mật khẩu từ 12 ký tự; gửi riêng cho đúng nhân sự.

Admin sửa tên/email/quyền, đặt mật khẩu mới, khóa/mở tài khoản từ danh sách. Khóa, đổi quyền hoặc mật khẩu thu hồi phiên đăng nhập cũ. Không thể tự khóa/hạ quyền Admin đang dùng.

Tạo tài khoản HR và Sếp/Người phỏng vấn theo nhu cầu. Để thử các vai trò, dùng trình duyệt hoặc cửa sổ riêng tư độc lập; các tab thông thường dùng chung cookie. Chỉ Admin thấy danh sách thành viên và bảng quyền. Nhân sự khác mở **Tài khoản → Tài khoản cá nhân** để đổi mật khẩu hoặc đăng xuất.

## Admin/HR tạo và chỉnh sửa JD

1. Đăng nhập bằng tài khoản **Admin hoặc HR**, mở **Vị trí tuyển dụng → Tạo JD tuyển dụng**.
2. Nhập tên công ty, tên vị trí, bộ phận, số lượng, hình thức và địa chỉ đầy đủ. Chọn ngành hàng **Safestraps / JieLien / Baby tatto**, hoặc **Chung · Super Net**. Bổ sung mức lương và thời gian làm việc nếu có.
3. Điền **Mô tả công việc**, **Yêu cầu ứng viên**, **Quyền lợi**; mỗi ý một dòng. Hạn nhận hồ sơ có thể để trống.
4. Trong **Cách thức ứng tuyển**, nhập hướng dẫn, email nhận CV, tiêu đề email và số Zalo. Chọn **Xem trước JD** để đọc toàn bộ nội dung. **Điền mẫu Content Marketing** lấy nội dung từ JD Super Net cung cấp; sửa các mục theo đợt tuyển trước khi lưu. Sau đó chọn **Đang tuyển → Lưu & đăng JD** để ứng viên xem, hoặc **Tạm dừng → Lưu JD** khi nội dung chưa sẵn sàng.
5. Mỗi vị trí có nút **Chỉnh sửa JD**, **Xem JD** và chia sẻ liên kết. Có thể tạm dừng mà không xóa vị trí hay hồ sơ đã nhận. Tin quá hạn tự ẩn theo ngày UTC+7; muốn tuyển lại thì sửa/xóa hạn và mở lại. Nếu người khác sửa trước khi bạn lưu, tải lại vị trí để lấy bản mới.

Sếp/Người phỏng vấn chỉ được xem, không được tạo/chỉnh sửa JD. Mọi thay đổi lưu vào database, có nhật ký người sửa và nội dung trước/sau.

Ảnh minh họa: [Biểu mẫu JD](screenshots/jd-editor.png), [JD chi tiết theo tài liệu Super Net](screenshots/job-description.png).

Trang công khai nằm tại `/tuyen-dung`: giới thiệu phụ kiện xe **Safestraps**, thiết bị âm thanh **JieLien**, Mẹ và Bé **Baby tatto**, rồi danh sách vị trí đang tuyển. Chọn vị trí → đọc JD → **Ứng tuyển ngay**; ứng viên không cần tài khoản. Mỗi JD có đường dẫn riêng `/tuyen-dung/:id` để gửi cho ứng viên. Tìm kiếm và bộ lọc giúp chọn đúng ngành hàng.

Với máy chủ hiện tại, mở `http://192.168.1.5:5173/tuyen-dung`. Địa chỉ IP này dùng trong mạng nội bộ; ứng viên ngoài công ty cần domain/địa chỉ công khai được triển khai và truy cập được. Nếu trình duyệt HTTP không cho sao chép tự động, chọn nội dung ô liên kết rồi Ctrl+C.

## HR nhận hồ sơ và chọn ứng viên phỏng vấn

1. Admin/HR đăng JD tại **Vị trí tuyển dụng → Tạo JD tuyển dụng**. Không gian mới không có dữ liệu giả.
2. HR dùng **Quản lý ứng viên → Thêm ứng viên / Upload CV**. Nhập những gì đã có, chọn nguồn, ngày nhận thực tế và vị trí; có thể lưu thiếu thông tin.
3. Mở **CV & tài liệu → Xem CV** để đọc ngay: PDF hỗ trợ chuyển trang/phóng to, DOCX xem nội dung văn bản. Không cần ghi nhận kiểm tra trước khi xem trong website. Có thể tải bản gốc ngay sau khi tiếp nhận; ghi nhận kiểm tra thủ công không chặn quyền đọc/tải. Tệp mới được quét mã độc trước khi lưu; xem [cấu hình bộ quét](antivirus.md).
4. Sếp/Người phỏng vấn mở **Tổng quan** của hồ sơ → **Hẹn phỏng vấn**, chọn vị trí, phiên bản CV, **Người phỏng vấn đề xuất** và ghi chú gửi HR. Có thể gửi yêu cầu khi CV chưa được đánh dấu kiểm tra; thao tác này giữ nguyên tệp/trạng thái kiểm tra. Danh sách CV không bị bỏ trống chỉ vì chưa kiểm tra.
5. Yêu cầu được lưu cùng người chọn, thời điểm, CV và hiển thị tại dashboard/**Yêu cầu phỏng vấn**. Đây chưa phải giờ hẹn đã xác nhận hoặc quyết định tuyển dụng.

Ứng viên tự gửi qua `/tuyen-dung`. Hồ sơ nghi trùng vào Chờ xác minh để HR xác nhận; không tự ghi đè hồ sơ/CV cũ. Link bổ sung do HR tạo có hạn và dùng một lần, thêm đúng hồ sơ. Link có hostname localhost chỉ dùng trên máy đang chạy ứng dụng; khi dùng chung cần mở qua hostname/IP/domain máy chủ.

## HR xếp lịch và dashboard

1. HR đọc yêu cầu và liên hệ ứng viên thống nhất thời gian.
2. Chọn **Liên hệ & xếp lịch** → ngày, giờ bắt đầu, **thời lượng** (ví dụ 45/90 phút), người phỏng vấn, hình thức, địa điểm/link họp. Người được đề xuất được chọn sẵn; có thể đổi sang người khác trong danh sách.
3. Hệ thống tính giờ kết thúc và chặn trùng cả ứng viên và người phỏng vấn; các buổi trong tương lai, cùng ngày, 15–240 phút.
4. **Tổng quan** và **Lịch phỏng vấn** có bảng theo ngày/khung giờ, số phút, ứng viên/vị trí/người phỏng vấn. Chọn ngày hoặc Ngày trước/Ngày sau/Hôm nay. Tất cả theo UTC+7.
5. **Đổi lịch** cần lý do; hủy lịch đưa yêu cầu về chờ HR; chỉ hoàn thành sau giờ bắt đầu. Xem lịch sử trong hồ sơ.

Yêu cầu/lịch tự cập nhật mỗi 30 giây hoặc khi quay lại tab; dashboard có nút cập nhật. Đây là thông báo trong website, chưa gửi email tự động.

Với hồ sơ **chưa xác nhận dữ liệu**, HR đã liên hệ có thể điền **Nội dung đã trao đổi** (ngày/kênh liên hệ và lịch thống nhất), đánh dấu **Đã liên hệ ứng viên và thống nhất việc hẹn phỏng vấn**, rồi lưu lịch. Thông tin trao đổi lưu cùng người ghi nhận/thời điểm, còn trạng thái đồng ý vẫn giữ nguyên. Đây là ghi nhận lịch làm việc. Nếu ứng viên đã **rút lại sự đồng ý**, cần có sự đồng ý mới và ghi căn cứ trong hồ sơ trước khi tiếp tục. Không đánh dấu đã đồng ý thay ứng viên chỉ để vượt bước đặt lịch.

Ảnh quy trình dùng tài khoản/ứng viên kiểm thử: [Yêu cầu phỏng vấn](screenshots/interview-request.png), [Ghi nhận trao đổi và đặt lịch](screenshots/contact-scheduling.png).

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
npm run scanner:check
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
| Quản trị JD, xem trước, mẫu Content Marketing | `src/job-editor.tsx`, `src/jobs.tsx`, `src/jd-template.ts` |
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
| Không xem được CV | Cập nhật và khởi động lại; dùng Xem CV để mở trình xem PDF/DOCX. Không cần plugin PDF hoặc bước kiểm tra thủ công trước khi xem. |
| CV PDF hợp lệ bị từ chối vì dòng trống đầu file | Đã hỗ trợ khoảng trắng/BOM trước header PDF; giữ nguyên tệp, chọn lại và tải lên sau khi cập nhật. |
| Danh sách CV trong Hẹn phỏng vấn bị trống | Cập nhật bản mới; CV chờ kiểm tra cũng được chọn gửi yêu cầu. Hồ sơ chưa có CV cần bổ sung file. |
| JD không hiện công khai | Kiểm tra trạng thái Đang tuyển, hạn nhận hồ sơ và bộ lọc ngành hàng. |
| Không thấy nút tạo/sửa JD | Đăng nhập bằng Admin/HR; Sếp chỉ được xem. |
| Không đặt được lịch | Kiểm tra email/điện thoại, ghi nhận trao đổi nếu chưa xác nhận dữ liệu, thời gian tương lai, cùng ngày, thời lượng và xung đột. |

API dịch cần cấu hình khóa OpenAI; email, phê duyệt offer và các giới hạn còn lại: xem [README](../README.md). Hướng dẫn Windows/macOS chưa được kiểm chứng trên máy Windows/macOS thật.

## Tiếng Trung và dịch CV/JD

Chọn **简体中文** ở bộ chọn ngôn ngữ trên trang đăng nhập/thanh công cụ/trang tuyển dụng. Giao diện và font Trung có sẵn; dữ liệu nhập vẫn lưu giá trị gốc. Chọn lại **Tiếng Việt** để trở về.

Để bật dịch nội dung, Admin vào **Thành viên & phân quyền → Dịch thuật Việt–Trung**, nhập khóa mới, để lịch nhắc **30 ngày**, bấm **Lưu cấu hình API → Kiểm tra kết nối API**. Khóa mới dùng ngay, không cần sửa mã hoặc khởi động lại. Sau khi lưu, ô khóa trống; đây là cách giữ kín khóa đã lưu. Bỏ trống để giữ khóa cũ nếu chỉ thay model/lịch nhắc.

Có thể thay khóa bất cứ lúc nào; lịch nhắc không tự làm khóa hết hạn. Sau khi `git pull` trên một máy chủ khác, vào Admin nhập khóa cho máy đó vì GitHub không mang theo khóa API. Dùng khóa mới nếu khóa cũ đã được chia sẻ vào chat. Chi tiết nguồn env dự phòng, model, kết nối và giới hạn: [README](../README.md#bật-api-dịch-cvjd-bằng-openai).

- Hồ sơ → CV & tài liệu → **Dịch CV 中文 → Dịch CV**. Bản dịch hiển thị riêng, có thể chuyển lại tab CV gốc.
- Vị trí tuyển dụng → **Dịch JD 中文 → Dịch & lưu bản tiếng Trung** (Admin/HR). Ứng viên chọn 简体中文 ở `/tuyen-dung` để đọc bản đã dịch.
- Sau khi sửa JD gốc, cần tạo bản dịch của phiên bản mới. API dịch chưa bật thì CV gốc và giao diện song ngữ vẫn dùng được.

## Sửa lỗi đăng nhập tại địa chỉ LAN

Nếu đang dùng địa chỉ `http://192.168.1.5:5173`, cập nhật source rồi dừng tiến trình cũ bằng Ctrl+C. Chạy lại `npm run dev` trên máy `192.168.1.5`; khi máy mới chưa có Admin, hoàn tất các câu hỏi khởi tạo trong Terminal, sau đó đăng nhập. Trang sẽ tạm hiện hướng dẫn thay vì biểu mẫu đăng nhập trong khi chưa có Admin.

```bash
git pull --ff-only
npm ci
npm run scanner:check
npm run dev
```

Vite phải được khởi động lại sau cập nhật để nạp cấu hình proxy mới. Không đổi IP thành localhost khi truy cập từ một máy khác. Vite chuyển tiếp địa chỉ LAN/cổng sang API một cách tự động; không cần mở cổng API 3000 cho các máy khác nếu đang dùng Vite ở 5173.

Sau reverse proxy HTTPS, đặt `APP_ORIGIN` đúng origin, giữ `X-Forwarded-Host`/`X-Forwarded-Proto` từ proxy và đặt `TRUST_PROXY` chỉ cho proxy thực. Đọc cấu hình trong README. Lỗi nguồn không hợp lệ vẫn được chặn; không bật CORS cho mọi website hay tắt kiểm tra nguồn.

Chữ được tăng 20% ở desktop lẫn điện thoại. Nếu vẫn thấy bản cũ sau khi khởi động lại, tải lại trang bằng Ctrl+F5 (macOS Cmd+Shift+R).

## Khi nhiều HR cùng xử lý hồ sơ

Nếu báo hồ sơ đã được người khác cập nhật, thay đổi của bạn chưa được ghi; nội dung đang nhập vẫn giữ ở biểu mẫu. Dùng **Xem hồ sơ mới trong tab khác để đối chiếu**, kiểm tra thông tin mới rồi bổ sung những phần cần giữ vào phiên bản mới. Đóng tab/biểu mẫu vẫn có thể làm mất nội dung chưa lưu; chưa có lưu nháp tự động.

Cập nhật cả frontend và API cùng phiên bản. Ứng dụng tự nâng cấp database để bảo vệ phiên bản hồ sơ, không cần xóa dữ liệu hay chạy setup lại. Xem [bản sửa QA và thay đổi API](qa-fixes-2026-10-31.md).
