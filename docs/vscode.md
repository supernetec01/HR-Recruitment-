# Sử dụng Super Net Recruitment Hub trên VS Code

Hướng dẫn chạy trên máy cá nhân Windows, macOS hoặc Linux. Đây là bản phát triển có dữ liệu minh họa, không cần cài PostgreSQL, Redis hay dịch vụ AI.

## 1. Chuẩn bị

- Cài [Git](https://git-scm.com/downloads), [Node.js 24 LTS](https://nodejs.org/) hoặc mới hơn, và [VS Code](https://code.visualstudio.com/).
- Node.js có sẵn npm. Nếu vừa cài Node/Git, hãy đóng rồi mở lại VS Code để Terminal nhận PATH mới.
- Mở Terminal và kiểm tra:

```bash
git --version
node --version
npm --version
```

`node --version` phải là `v24.x.x` trở lên vì backend dùng SQLite tích hợp trong Node. Nếu đang dùng Node 18/20/22, cần đổi sang Node 24 trước khi chạy.

## 2. Lấy mã nguồn và mở VS Code

Trong Terminal, chuyển đến thư mục bạn muốn lưu dự án, rồi chạy:

```bash
git clone https://github.com/supernetec01/HR-Recruitment-.git
cd HR-Recruitment-
code .
```

Nếu repository riêng tư, đăng nhập tài khoản GitHub có quyền truy cập qua luồng đăng nhập Git/Git Credential Manager trên máy bạn. Không đặt token vào URL clone hoặc tệp trong dự án.

Nếu lệnh `code` chưa được nhận diện, mở VS Code → **File → Open Folder…**, chọn thư mục `HR-Recruitment-`. Nếu tải ZIP từ GitHub, cần giải nén trước và mở đúng thư mục chứa `package.json`.

Trong macOS có thể bật lệnh `code`: mở Command Palette và chọn **Shell Command: Install 'code' command in PATH**. Trên Windows, mục **Add to PATH** nằm trong trình cài đặt VS Code.

## 3. Cài dependencies và chạy

Trong VS Code chọn **Terminal → New Terminal**. Đảm bảo Terminal đang ở thư mục chứa `package.json`, rồi chạy:

```bash
npm ci
npm run dev
```

Giữ Terminal này chạy khi sử dụng ứng dụng. Không cần tạo `.env`; `.env.example` chỉ là tài liệu và không được tự động nạp.

| Dùng trên máy của bạn | Địa chỉ nhập vào trình duyệt |
| --- | --- |
| Không gian HR | `http://localhost:5173` |
| Cổng ứng tuyển | `http://localhost:5173/tuyen-dung` |

Đây là địa chỉ của máy cá nhân khi bạn chạy dự án, không phải liên kết preview hay website đã được triển khai trên Internet. API chạy nội bộ ở cổng 3000; trình duyệt dùng cổng 5173 để Vite chuyển tiếp `/api`.

Chế độ demo tự mở tài khoản HR và tạo 12 hồ sơ, 5 vị trí, 4 thành viên cùng các CV mẫu ở lần chạy đầu tiên. Không có mật khẩu demo cần nhập. Dữ liệu này lưu bền vững trong `.data/`, nên số lượng có thể thay đổi sau khi bạn thử thêm hồ sơ.

Nếu Windows PowerShell báo không được chạy `npm.ps1`, chuyển Terminal Profile sang **Command Prompt**, hoặc dùng `npm.cmd ci` và `npm.cmd run dev`. Không cần đổi chính sách bảo mật PowerShell trên toàn máy.

## 4. Thử các chức năng chính

### HR tạo hồ sơ từ nguồn bên ngoài

1. Vào **Quản lý ứng viên → Thêm ứng viên** hoặc **Upload CV**.
2. Nhập tên/số điện thoại/email đã có, chọn nguồn Facebook/Zalo/Email…, ngày nhận thực tế và vị trí nếu đã biết.
3. Có thể để trống thông tin chưa có. Chọn **Lưu hồ sơ** để lưu trạng thái **Cần bổ sung**.
4. Nếu email/số điện thoại có thể trùng, xác nhận cùng người để liên kết, hoặc chọn người khác và ghi lý do. Hệ thống giữ nguyên CV và thông tin gốc.

### Ứng viên tự ứng tuyển

1. Mở cổng tuyển dụng, chọn vị trí và điền biểu mẫu.
2. Đính kèm PDF/DOCX tối đa 10 MB và xác nhận đồng ý xử lý dữ liệu.
3. Hồ sơ mới được tiếp nhận; hồ sơ nghi trùng vào **Quản lý ứng viên → Chờ xác minh** để HR kiểm tra.

### Bổ sung vào hồ sơ hiện có

1. Mở hồ sơ → **Mời bổ sung hồ sơ** → chọn thời hạn → **Tạo liên kết**.
2. Sao chép liên kết và mở trong cửa sổ riêng tư trên cùng máy để thử như ứng viên không đăng nhập.
3. Gửi thêm CV/portfolio/thông tin. Liên kết chỉ dùng một lần; CV cũ vẫn còn trong **CV & tài liệu**.
4. Xem **Lịch sử** để biết ai cập nhật, khi nào và nội dung đã nhận.

Liên kết có hostname `localhost` chỉ hoạt động trên máy đang chạy ứng dụng; không gửi cho ứng viên thật trên máy khác. Khi triển khai thật, cần domain/HTTPS và cấu hình ứng dụng tương ứng.

### Kiểm tra vai trò Boss và Admin

Vào **Thành viên & phân quyền → Vai trò trải nghiệm**. Chức năng đổi vai trò này chỉ có ở demo. Boss được xem dữ liệu nhưng không được sửa hồ sơ. Chưa có quy trình phê duyệt kết quả tuyển dụng.

## 5. Chạy qua menu và debug

Repository có sẵn cấu hình trong `.vscode/`:

- **Terminal → Run Task… → Super Net: Cài dependencies**: chạy `npm ci`.
- **Super Net: Chạy demo**: chạy toàn bộ ứng dụng, tương đương `npm run dev`.
- **Super Net: Kiểm tra TypeScript**, **Super Net: Kiểm thử API**, **Super Net: Build**: chạy các kiểm tra tương ứng.
- **Ctrl+Shift+B** trên Windows/Linux hoặc **Cmd+Shift+B** trên macOS: chạy build.

Để debug backend, dừng `npm run dev` trước để tránh trùng cổng. Mở **Run and Debug**, chọn **Super Net: Debug toàn bộ ứng dụng**, nhấn **F5**. VS Code sẽ chạy riêng API và Vite; mở ứng dụng trên trình duyệt như bước 3. Đặt breakpoint trong `server/app.mjs`, thực hiện thao tác trên website để dừng tại API tương ứng. Nút Stop sẽ dừng cả hai phiên debug.

Không cần extension trả phí. TypeScript/JavaScript và Node debugger có sẵn trong VS Code. Có thể cài extension Playwright chính thức nếu muốn xem các test trình duyệt trong Test Explorer.

## 6. Kiểm tra trước khi sửa hoặc gửi mã nguồn

Mở một Terminal khác trong cùng thư mục:

```bash
npm run check
npm test
npm run build
```

Để chạy kiểm thử trình duyệt trên máy chưa có Chromium:

```bash
npx playwright install chromium
npm run test:e2e
```

Cấu hình tự dùng `/usr/bin/chromium` nếu có (môi trường Linux đám mây); các máy khác dùng Chromium do Playwright cài. Có thể đặt `CHROMIUM_PATH` nếu muốn chỉ định file thực thi riêng. Test dùng cổng 3100 và dữ liệu tạm riêng, không sửa `.data/` đang dùng.

Các kiểm thử đã chạy trong môi trường phát triển: 19 kiểm thử API, 5 kịch bản Chromium, TypeScript và build. Hướng dẫn Windows/macOS dùng lệnh và cấu hình hỗ trợ đa nền tảng; chưa kiểm chứng trên máy Windows/macOS thật.

## 7. Sửa mã nguồn, cập nhật và dừng

| Muốn thay đổi | Tệp/thư mục |
| --- | --- |
| Màn hình HR, dashboard, danh sách | `src/App.tsx` |
| Chi tiết hồ sơ, CV, lịch sử | `src/detail.tsx` |
| Biểu mẫu nội bộ | `src/forms.tsx` |
| Cổng tuyển dụng và biểu mẫu công khai | `src/public.tsx` |
| Màu sắc, bố cục, điện thoại | `src/styles.css` |
| API, phân quyền, chống trùng | `server/app.mjs` |
| Schema SQLite và dữ liệu demo | `server/db.mjs` |

Vite tự cập nhật frontend khi lưu tệp; Node watch tự khởi động lại API khi sửa backend. Nhấn **Ctrl+C** ở Terminal đang chạy để dừng. Với debug, dùng nút Stop của VS Code.

Lần sau, mở lại cùng thư mục và chạy `npm run dev`. Nếu chỉ khởi động lại thì không cần `npm ci` mỗi lần. Để lấy thay đổi từ GitHub, dừng ứng dụng, lưu/commit công việc đang sửa trước khi pull, rồi:

```bash
git pull --ff-only
npm ci
npm run dev
```

Không xóa `.data/` khi cập nhật vì đó là hồ sơ và CV bạn đã lưu. Git chỉ đồng bộ mã nguồn, không đồng bộ dữ liệu ứng viên. `.env`, `.data/`, `node_modules/`, `dist/` và kết quả test đã được bỏ qua bởi `.gitignore`.

## 8. Lỗi thường gặp

| Hiện tượng | Cách xử lý |
| --- | --- |
| Không tìm thấy `node:sqlite` | Đổi sang Node.js 24+, mở lại VS Code, chạy `npm ci`. |
| `npm` không được nhận diện | Cài Node.js, mở lại VS Code, kiểm tra `node --version` và `npm --version`. |
| Không tìm thấy `package.json` | Terminal đang sai thư mục; chuyển vào `HR-Recruitment-` chứa file này. |
| Cổng 3000/5173 đang được dùng | Dừng phiên `npm run dev` hoặc debug trước đó; không chạy hai cách cùng lúc. |
| `npm ci` lỗi kết nối | Kiểm tra Internet/proxy công ty, giữ TLS verification; không xóa lockfile hay tắt xác minh chứng chỉ để né lỗi. |
| `npm run test:e2e` thiếu browser | Chạy `npx playwright install chromium`, rồi thử lại. |
| Tài liệu bị chặn tải | File mới đang cách ly. Chỉ HR ghi nhận đã kiểm tra an toàn theo quy trình bên ngoài mới mở quyền tải. Đây chưa phải quét virus tự động. |
| Liên kết bổ sung hết hiệu lực | HR tạo link mới; link có hạn, có thể bị thu hồi và chỉ dùng một lần. |

Chi tiết giới hạn của bản phát triển và cấu hình ngoài demo: xem [README](../README.md) và [thiết kế nghiệp vụ](design.md). Chưa triển khai AI dịch CV, email tự động, quy trình phê duyệt Boss hay các thành phần production được liệt kê trong README.
