# Nhận xét và chấm điểm sau phỏng vấn

Sau khi buổi phỏng vấn kết thúc, HR/Admin vào **Lịch phỏng vấn** và đánh dấu **Hoàn thành**. Người được phân công phỏng vấn đăng nhập bằng tài khoản của mình, vào **Lịch phỏng vấn → Đã hoàn thành → Đánh giá**, hoặc mở **Hồ sơ ứng viên → Đánh giá**.

Phiếu gồm:

- **Điểm phỏng vấn:** 0–10, tối đa một chữ số thập phân; nhập `8,5` hoặc `8.5` đều được.
- **Kết quả đề xuất:** Đạt, Cần phỏng vấn thêm, Không đạt; người phỏng vấn tự chọn, không suy ra tự động từ điểm.
- **Nhận xét phỏng vấn:** 10–5.000 ký tự, giữ nguyên xuống dòng.

Mỗi buổi có một phiếu gắn với người được phân công. Chính người này có thể sửa phiếu đã lưu. HR/Admin/Sếp và nhân sự khác được xem theo quyền truy cập hồ sơ hiện có, không sửa thay tác giả. HR/Admin cũng có thể đánh giá khi chính họ được phân công làm người phỏng vấn cho buổi đó.

Điểm, kết quả, nhận xét, người đánh giá và thời điểm cập nhật hiển thị trong hồ sơ. Danh sách buổi đã hoàn thành hiển thị điểm/kết quả và nút xem hoặc chỉnh sửa. Chưa có đánh giá thì hiển thị trạng thái chờ, không tự gán điểm 0. Mỗi vòng phỏng vấn giữ phiếu riêng; không cộng hoặc lấy trung bình các vòng.

Lưu đánh giá giữ nguyên giai đoạn ứng tuyển và quyết định tuyển dụng hiện có. Lịch sử hồ sơ ghi thao tác thêm/sửa cùng nội dung trước/sau. Nếu đang mở bản cũ khi có cập nhật ở cửa sổ khác, biểu mẫu báo lỗi và giữ bản nháp; đóng/mở lại để xem dữ liệu mới. Gửi lại cùng yêu cầu khi mất phản hồi không tạo trùng phiếu hoặc lịch sử.

Buổi đang lên lịch, đã hủy hoặc chưa tới giờ không nhận đánh giá. Ứng viên chỉ được chuyển giai đoạn sang “Đã phỏng vấn” nhưng chưa có bản ghi buổi phỏng vấn hoàn thành sẽ thấy hướng dẫn trong tab Đánh giá; hệ thống không tự tạo buổi phỏng vấn hoặc phiếu đánh giá cho dữ liệu cũ.

## Dữ liệu và API

Bảng SQLite `interview_evaluations` khóa theo `interview_id`, gồm `reviewer_id`, `score`, `result`, `comments`, `revision`, `created_at`, `updated_at`. Migration chỉ thêm bảng, giữ dữ liệu phỏng vấn và ứng viên cũ. Phiếu được lưu cùng audit và thông tin chống gửi trùng trong một giao dịch.

`GET /api/v1/interviews/:id/evaluation` yêu cầu đăng nhập, trả `{ evaluation, canEvaluate }`; `evaluation` có thể là `null`. API danh sách phỏng vấn và chi tiết ứng viên cũng kèm phiếu.

`PUT /api/v1/interviews/:id/evaluation` yêu cầu phiên của người phỏng vấn được phân công, header `X-Requested-With: SuperNet`, `Idempotency-Key` và JSON:

```json
{
  "score": 8.5,
  "result": "pass",
  "comments": "Có kinh nghiệm phù hợp và trình bày rõ cách triển khai công việc.",
  "expectedRevision": 0
}
```

`result` nhận `pass`, `follow_up`, `fail`. `expectedRevision=0` khi tạo, khi sửa dùng revision đã đọc. Lệch revision trả 409, không đúng người phỏng vấn trả 403, không tìm thấy buổi trả 404. Người đánh giá lấy từ phiên đăng nhập; client không chọn hoặc giả mạo tác giả.

## Kiểm thử ngày 31/10/2026

TypeScript và build production đạt; 43 bài API liên quan đạt, gồm 8 bài mới. Năm bài trình duyệt mới đạt và bốn bài xóa tài liệu được kiểm tra lại sau khi thêm tab Đánh giá. Kiểm tra điểm biên 0/10, số lẻ, dữ liệu lỗi, nhận xét, vai trò, trạng thái buổi, cập nhật đồng thời, gửi lặp, rollback khi audit lỗi và mở lại database.

Giao diện được kiểm tra ở 320/375/768/1440 px bằng tiếng Việt/Trung, không tràn ngang; nút lưu luôn trong vùng nhìn thấy của hộp thoại. Ảnh chụp ở `test-results/hr-evaluations-verified-2026-10-31` trong workspace.

```sh
npm run check
npm run build
node --test --test-concurrency=1 --test-skip-pattern='paused JDs' tests/interview-evaluations.test.mjs tests/document-deletion.test.mjs tests/brands.test.mjs tests/jobs.test.mjs tests/origin.test.mjs tests/startup.test.mjs
node node_modules/@playwright/test/cli.js test tests/browser-internal/evaluations.spec.ts tests/browser-internal/document-deletion.spec.ts --project=internal
```

Các bài đánh giá dùng dữ liệu tổng hợp trong database tạm, không tải CV, không gửi email và không gọi AI. Lệnh hồi quy loại bài JD cần tải CV vì môi trường chưa có bộ quét antivirus sẵn sàng; không thay đổi cơ chế quét của sản phẩm.
