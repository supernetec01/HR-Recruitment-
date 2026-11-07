# Ưu tiên hồ sơ mới và báo cáo theo thời gian

## Quản lý ứng viên

- Vào **Quản lý ứng viên** hoặc quay lại từ hồ sơ sẽ mở nhóm **Mới tiếp nhận**. Khi chưa có hồ sơ mới, có nút **Xem tất cả ứng viên** để chuyển sang các hồ sơ đã xử lý.
- Hồ sơ mới là hồ sơ có ít nhất một lượt ứng tuyển ở giai đoạn **Mới tiếp nhận**, hoặc chưa có vị trí ứng tuyển. Việc xem CV hay sửa thông tin liên hệ không tự chuyển giai đoạn.
- Trong **Tất cả ứng viên**, sắp xếp mặc định **Ưu tiên chưa xử lý** đặt hồ sơ mới trước, hồ sơ đã chuyển giai đoạn sau. Trong mỗi nhóm, ngày nhận gần nhất đứng trước. Có thể chọn **Ngày nhận mới nhất** hoặc **Ngày nhận cũ nhất** để chỉ sắp theo ngày.
- Với người ứng tuyển lại, ngày nhận trên danh sách và thứ tự sử dụng ngày nhận gần nhất của hồ sơ/các lượt ứng tuyển. Ngày nhận gốc trong database được giữ nguyên.
- Các bộ lọc, phân trang và xuất CSV áp dụng trên danh sách đã lọc và sắp xếp. Nhóm **Tất cả ứng viên** có URL riêng `/?page=candidates&tab=all`, giữ đúng nhóm khi tải lại trang.

## Báo cáo tuyển dụng

Mặc định chọn **7 ngày qua**, gồm hôm nay và 6 ngày trước. Có thể chọn **30 ngày qua**, **Tháng này**, **Toàn bộ thời gian** hoặc nhập **Từ ngày / Đến ngày**. Khoảng ngày tính trọn ngày theo UTC+7, gồm cả ngày đầu và ngày cuối. Khoảng không hợp lệ được báo lỗi và không hiển thị số liệu của kỳ cũ.

| Chỉ số | Cách tính |
| --- | --- |
| Hồ sơ mới ghi nhận | Hồ sơ có **ngày nhận** trong kỳ, kể cả hiện đã được xử lý. Một người tính một hồ sơ; hồ sơ nghi trùng chưa xác minh chưa được cộng vào hồ sơ chính thức. |
| Ứng viên được hẹn phỏng vấn | Ứng viên có lịch hẹn **được tạo trong kỳ**, không tính lịch đã hủy. Gồm cả lịch hiện đã hoàn thành, kể cả ngày phỏng vấn nằm ngoài kỳ. Yêu cầu phỏng vấn chờ HR chưa có lịch chưa được tính. |
| Ứng viên đã phỏng vấn | Ứng viên có buổi phỏng vấn ở trạng thái **Hoàn thành**, với **ngày diễn ra** trong kỳ. Bao gồm ứng viên được nhận hồ sơ/đặt lịch từ trước kỳ. |
| Đạt / Không đạt / Cần phỏng vấn thêm / Chưa có đánh giá | Từ đánh giá hiện tại của buổi phỏng vấn đã hoàn thành gần nhất của mỗi ứng viên trong kỳ. Mỗi người chỉ thuộc một nhóm. Hồ sơ bị loại ở bước sàng lọc không tự được tính là phỏng vấn không đạt. |

Các số đếm ứng viên không cộng trùng nếu một người có nhiều lịch/vòng phỏng vấn trong kỳ. Tổng bốn nhóm kết quả bằng số **Ứng viên đã phỏng vấn**. Kết quả chưa đánh giá không được tự suy ra từ điểm số hoặc giai đoạn tuyển dụng. Khi người phỏng vấn thêm/sửa đánh giá, báo cáo dùng kết quả cập nhật; đây không phải bản chụp lịch sử kết quả tại cuối kỳ.

Ví dụ: trong 7 ngày có 7 hồ sơ được nhận, lịch hẹn được tạo cho 5 ứng viên, 3 ứng viên thực sự phỏng vấn và được đánh giá 2 không đạt / 1 đạt. Báo cáo hiển thị **7 / 5 / 3**, kết quả **1 đạt / 2 không đạt**. Các nhóm này có thể gồm những người khác nhau vì từng hoạt động dùng mốc thời gian riêng.

Biểu đồ nguồn dùng hồ sơ nhận trong kỳ; biểu đồ vị trí và phân bố giai đoạn dùng các lượt ứng tuyển nhận trong kỳ. Giai đoạn là trạng thái **hiện tại** của nhóm lượt ứng tuyển đó. Số lượt ứng tuyển có thể khác số hồ sơ vì một người có nhiều lượt ứng tuyển, hoặc chưa có vị trí.

API chỉ đọc: `GET /api/v1/reports/recruitment?from=2026-11-01&to=2026-11-07`, yêu cầu đăng nhập nhân sự. Không truyền cả hai ngày để xem toàn bộ thời gian; truyền thiếu/sai ngày trả HTTP 400. Không cần thay đổi cấu trúc database hoặc khởi tạo lại dữ liệu.

## Cập nhật website hiện có

1. Dừng website và sao lưu toàn bộ thư mục `.data/` trên máy đang chạy website.
2. Cập nhật mã nguồn, giữ nguyên `.data/` và các tệp cấu hình môi trường của máy chủ.
3. Chạy `npm ci`, `npm run check` và `npm run build` trong thư mục dự án.
4. Khởi động lại website bằng cách đang sử dụng, ví dụ `npm start`, với các biến môi trường hiện có. Không cần chạy lại setup hoặc tạo lại tài khoản.

## Kiểm tra

- `npm run check`
- `npm run build`
- `node --test tests/recruitment-reports.test.mjs`
- `npx playwright test tests/browser-internal/recruitment-reports.spec.ts --project=internal`

Kiểm thử dùng SQLite và tài khoản riêng, gồm tình huống 7 → 5 → 3, ranh giới ngày UTC+7, hồ sơ cũ phỏng vấn trong kỳ, nhiều vòng phỏng vấn, chưa đánh giá, khoảng trống, phân quyền, thứ tự hồ sơ, chuyển hồ sơ ra khỏi nhóm mới, báo cáo lỗi/thử lại, phản hồi API đến muộn và giao diện Việt–Trung ở 320–1440 px. Bộ kiểm thử đầy đủ của dự án cần dịch vụ quét CV sẵn sàng (`npm run scanner:check`).
