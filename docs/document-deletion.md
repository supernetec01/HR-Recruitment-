# Xóa CV hoặc tài liệu tải nhầm

Admin/HR mở hồ sơ ứng viên → **CV & tài liệu** → **Xóa tài liệu** ở đúng file → kiểm tra tên và phiên bản trong hộp thoại → **Xác nhận xóa**. Nút **Hủy** đóng hộp thoại và giữ nguyên tài liệu. Sếp/Người phỏng vấn tiếp tục được xem/tải, không có quyền xóa.

Sau khi xóa, tài liệu biến mất khỏi hồ sơ, số lượng và tình trạng thiếu CV được tính lại. File khác, thông tin ứng viên và các lượt ứng tuyển được giữ nguyên. Bản dịch đã lưu của file đó cũng được xóa. Lịch sử ghi người thực hiện, thời điểm, tên file và phiên bản. Ứng dụng không có chức năng khôi phục file đã xóa.

Nếu tài liệu đang gắn với yêu cầu phỏng vấn đang chờ hoặc lịch phỏng vấn chưa hoàn tất, hệ thống từ chối xóa và nêu lý do. Cần xử lý quy trình phỏng vấn theo đúng quyền trước. Hủy lịch đưa yêu cầu về trạng thái chờ theo quy tắc sẵn có, vì vậy chỉ hủy lịch chưa đủ để xóa CV của yêu cầu đó. Các yêu cầu đã kết thúc vẫn giữ tên/phiên bản CV trong lịch sử và được đánh dấu **Tài liệu đã xóa**.

Nếu người khác vừa cập nhật hồ sơ, hộp thoại giữ thông báo lỗi và cung cấp **Tải lại danh sách tài liệu**. Nhân sự cần xem lại danh sách và xác nhận lại; hệ thống không tự ghi đè hoặc tự thử xóa bằng phiên bản mới.

## API và lưu trữ

`DELETE /api/v1/candidates/:candidateId/documents/:id`, cookie phiên Admin/HR, header `X-Requested-With: SuperNet`, JSON `{ "expectedRevision": 1 }`.

- Kiểm tra tài liệu thuộc đúng ứng viên và revision khớp trong giao dịch SQLite; xác nhận cũ trả 409. Gửi lại thao tác đã hoàn tất trả thành công, không ghi trùng lịch sử hoặc tăng revision lần nữa.
- Migration thêm `deleted_at`, `deleted_by`, `purged_at` vào `documents`; dữ liệu cũ giữ nguyên. Bản ghi metadata tối thiểu được giữ để bảo toàn khóa ngoại và số phiên bản, không tái sử dụng phiên bản đã xóa.
- Giao dịch đánh dấu xóa, xóa cache bản dịch, tăng revision hồ sơ và ghi audit. Chỉ sau khi commit mới xóa file trên đĩa; lỗi audit không làm mất file. API xem/tải/trích xuất/dịch/ghi nhận kiểm tra và chọn CV phỏng vấn đều loại tài liệu đã xóa.
- Nếu lưu trữ tạm thời không cho dọn file, tài liệu vẫn bị chặn truy cập; bản ghi chưa có `purged_at` được thử dọn lại sau 30 giây và khi khởi động. File đã mất sẵn cũng được xử lý an toàn. Không thay đổi các bản sao lưu ngoài thư mục dữ liệu đang vận hành.
- Tác vụ dịch đang chạy phải kiểm tra lại tài liệu trước khi lưu; không ghi lại cache sau khi tài liệu đã bị xóa.

## Kiểm thử ngày 31/10/2026

TypeScript và build production đạt. 35 bài API liên quan đạt, gồm 9 bài mới về xóa tài liệu, rollback, phân quyền, chống xác nhận cũ, bản dịch đang chạy, bảo vệ CV phỏng vấn và dọn file khi khởi động lại. 4 bài Playwright mới đạt: Admin xóa/hủy/giữ file khác/lịch sử; HR xóa CV cuối và lỗi stale; Boss không có quyền; bố cục và hộp thoại ở 320/375/768/1440 px bằng tiếng Việt và tiếng Trung.

```sh
npm run check
npm run build
node --test --test-concurrency=1 --test-skip-pattern='paused JDs' tests/document-deletion.test.mjs tests/brands.test.mjs tests/jobs.test.mjs tests/origin.test.mjs tests/startup.test.mjs
node node_modules/@playwright/test/cli.js test tests/browser-internal/document-deletion.spec.ts --project=internal
```

Các bài mới dùng PDF mẫu tổng hợp trong database tạm. Bộ quét tiêm vào fixture chỉ chấp nhận đúng PDF này; không thay đổi antivirus của sản phẩm. Lượt chạy trên không kiểm thử antivirus thật hoặc toàn bộ luồng tải CV; bài JD gửi CV bị loại khỏi lệnh hồi quy vì môi trường chưa có scanner sẵn sàng. Ảnh chụp nằm ở `test-results/hr-document-delete-2026-10-31` trong workspace.
