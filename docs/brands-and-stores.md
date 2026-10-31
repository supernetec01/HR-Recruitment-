# Quản lý thương hiệu và cửa hàng

Đăng nhập bằng tài khoản **Admin**, chọn **Thương hiệu & cửa hàng** ở thanh bên. Mỗi thương hiệu gồm tên, ngành hàng, mô tả ngắn, logo và tối đa 10 liên kết bán hàng. Có thể thêm nhiều gian hàng thuộc cùng một kênh bằng các tên phân biệt, chẳng hạn “Shopee · Phụ kiện” và “Shopee · Chính hãng”.

1. Chọn **Thêm thương hiệu**, điền thông tin và các đường dẫn HTTPS tới gian hàng.
2. Tải logo PNG, JPEG hoặc WebP, tối đa 2 MB. Logo giữ tỷ lệ gốc; chưa có logo thì hiển thị chữ viết tắt. Nút **Gỡ logo** có hiệu lực khi lưu biểu mẫu.
3. Chọn **Hiển thị trên trang tuyển dụng** và đặt thứ tự. Số nhỏ hơn xuất hiện trước; khi bằng nhau, sắp xếp theo tên.
4. Lưu và mở **Xem trang tuyển dụng** để xem thẻ giới thiệu bên dưới danh sách việc làm. Mỗi kênh mở trong tab mới.
5. Dùng **Chỉnh sửa** để thay mô tả, đường dẫn, logo, trạng thái hoặc thứ tự. Bỏ chọn hiển thị để ẩn tạm thời. **Xóa** cần xác nhận và gỡ thương hiệu cùng các kênh khỏi khu vực giới thiệu.

HR, Boss và người phỏng vấn không có quyền quản lý mục này. Thương hiệu mới tự xuất hiện trong mục ngành hàng của form tạo JD. Các JD đã gắn với thương hiệu bị xóa vẫn giữ tên và tiếp tục hoạt động; không thể gắn mới thương hiệu đã xóa. Ẩn thương hiệu chỉ ẩn khu vực giới thiệu, không đóng các JD của thương hiệu đó.

Nội dung tiếng Trung là tùy chọn; nếu để trống, trang tiếng Trung dùng nội dung tiếng Việt. Tên riêng thương hiệu được giữ nguyên. Không tự động gọi dịch vụ AI khi lưu hoặc mở phần giới thiệu.

## Dữ liệu và nâng cấp

Thông tin lưu trong bảng `company_brands` của SQLite hiện tại, bao gồm logo đã chuẩn hóa thành WebP tối đa 512 × 512 px. Sao lưu dữ liệu theo quy trình SQLite của ứng dụng cũng giữ được logo; không phụ thuộc URL ảnh bên ngoài. SVG, ảnh lỗi và ảnh vượt giới hạn 16 triệu điểm ảnh bị từ chối. Logo công khai chỉ được phục vụ khi thương hiệu đang hiển thị.

Lần đầu nâng cấp, hệ thống chuyển ba thương hiệu **Safestraps, JieLien, Baby tatto** và các liên kết Shopee hiện có vào database. Mô tả ban đầu chỉ dựa trên ngành hàng đã có. Chưa có tài sản logo gốc nên hệ thống dùng chữ viết tắt; Admin có thể thay bằng logo chính thức. Những lần khởi động sau không ghi đè nội dung đã sửa hoặc tạo lại thương hiệu đã xóa.

Lưu thương hiệu mới dùng `Idempotency-Key` chống gửi trùng. Sửa/xóa kiểm tra `expectedRevision`, trả 409 khi dữ liệu đã được người khác thay đổi. Mọi thay đổi và nhật ký quản trị được lưu trong cùng một giao dịch; lỗi lưu nhật ký sẽ khôi phục dữ liệu. Sau khi Admin lưu, giao diện cập nhật danh sách; trang tuyển dụng đã mở cập nhật khi quay lại tab/cửa sổ hoặc tối đa khoảng 30 giây khi tab đang hiển thị.

## API

| API | Quyền |
| --- | --- |
| `GET /api/v1/public/brands?language=vi` | Công khai, chỉ thương hiệu đang hiển thị |
| `GET /api/v1/public/brands/:id/logo?v=hash` | Công khai, chỉ logo của thương hiệu đang hiển thị |
| `GET /api/v1/brands?language=vi` | Nhân sự đăng nhập, dữ liệu chọn ngành hàng JD |
| `GET/POST /api/v1/admin/brands` | Admin |
| `PATCH/DELETE /api/v1/admin/brands/:id` | Admin |
| `GET /api/v1/admin/brands/:id/logo` | Admin, gồm logo thương hiệu đang ẩn |

POST/PATCH nhận JSON hoặc multipart gồm `payload` JSON và một tệp `logo` tùy chọn. PATCH gửi toàn bộ dữ liệu biểu mẫu cùng `expectedRevision`; DELETE gửi JSON `{ "expectedRevision": 1 }`. POST cần `Idempotency-Key`. Các API ghi giữ cơ chế cookie và kiểm tra nguồn yêu cầu hiện có.

Kiểm thử riêng tính năng (không tải CV, không cần dịch vụ quét CV):

```sh
npm ci
npm run check
npm run build
node --test tests/brands.test.mjs
node node_modules/@playwright/test/cli.js test tests/browser-internal/brands.spec.ts --project=internal
```

Kiểm thử toàn bộ hệ thống vẫn cần dịch vụ antivirus thật theo hướng dẫn sẵn có của dự án.
