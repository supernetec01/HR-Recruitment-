# Giao diện tuyển dụng — 31/10/2026

Thay các khối slogan và lời dẫn lặp lại bằng giao diện tập trung vào công việc tuyển dụng.

## Thay đổi

- Trang tuyển dụng: bỏ banner thông điệp và ba thẻ giới thiệu ngành hàng; đưa tìm kiếm, bộ lọc và danh sách việc làm lên đầu. Mỗi dòng hiển thị vị trí, bộ phận/ngành hàng, hình thức, địa điểm, mức lương và số người cần tuyển. Mức lương chưa nhập được ghi “Chưa cập nhật”.
- Trang JD: giữ nội dung công việc, yêu cầu, quyền lợi và thông tin vị trí; bỏ phần quảng bá/giới thiệu lặp lại.
- Form ứng tuyển/bổ sung: rút gọn tiêu đề, lời dẫn và thông báo thành công. Giữ hướng dẫn liên hệ, upload, thời hạn liên kết và thông báo xử lý dữ liệu.
- Đăng nhập: một khối biểu mẫu giữa trang, bỏ phần slogan lớn bên cạnh.
- Nội bộ: bỏ thẻ truyền cảm hứng ở sidebar, banner ứng viên và các lời dẫn trang trí. Số liệu dùng số thực, bỏ số 0 đệm và chú thích lặp lại; nền và các thẻ thống kê được làm trung tính hơn.
- Chữ và điều khiển: tăng độ rõ của màu chữ, đơn giản hóa header/modal, căn lại khoảng cách và cách xếp thông tin ở điện thoại.

Luồng API, cơ sở dữ liệu, dữ liệu JD đã lưu và logic phân quyền không được thay đổi trong đợt giao diện này. Nội dung JD vẫn là dữ liệu công ty nhập, không được viết lại tự động. Phần giao diện được ghép trên các cập nhật nghiệp vụ mới của main; xem docs/qa-fixes-2026-10-31.md cho các bản sửa nghiệp vụ riêng.

## Ảnh giao diện

Ảnh dùng dữ liệu kiểm thử trong database tạm; không tạo hoặc sửa ứng viên/JD trong dữ liệu vận hành.

- [Danh sách tuyển dụng desktop](screenshots/careers.png), [điện thoại](screenshots/careers-mobile.png).
- [JD công khai](screenshots/job-description.png).
- [Đăng nhập](screenshots/login.png), [đăng nhập điện thoại](screenshots/login-mobile.png).
- [Dashboard](screenshots/hr-desktop.png), [dashboard điện thoại](screenshots/hr-mobile.png).
- [Tài khoản](screenshots/accounts.png).

## Kiểm tra

Các bài Chromium hiện có được cập nhật selector/nội dung kỳ vọng để phù hợp tiêu đề và bố cục mới; giữ kiểm tra luồng nộp CV, xác minh trùng, liên kết bổ sung, JD, phân quyền, đăng nhập và lịch.

Kết quả kiểm tra được lưu trong `/workspace/test-results/hr-ui-2026-10-31/`: TypeScript, build, bài kiểm thử trình duyệt, ảnh và `visual-review.results.json` cho các chiều rộng 320/375/768/1440 px. Script kiểm tra ảnh và axe chạy với dữ liệu riêng, không được thêm vào luồng vận hành.

Kết quả cuối cùng:

- `npm run check` và `npm run build`: đạt.
- Toàn bộ 16 bài Chromium hiện có: đạt, 0 thất bại.
- 40 lần kiểm tra bố cục trên 10 màn ở 320/375/768/1440 px: không tràn ngang toàn trang, không có lỗi JavaScript trong lượt duyệt.
- Quét axe WCAG A/AA trên danh sách tuyển dụng, JD, form ứng tuyển và đăng nhập: 0 cảnh báo tự động trong các trạng thái đã kiểm tra. Kết quả này không thay thế kiểm thử khả năng truy cập thủ công toàn hệ thống.
- Tìm kiếm không dấu, lọc ngành hàng và xóa bộ lọc được kiểm tra trên dữ liệu giả lập. Các luồng gửi CV, xác minh trùng, đăng nhập/phân quyền và xếp lịch vẫn được kiểm tra qua suite Chromium.

## Kiểm tra sau khi ghép các cập nhật mới trên GitHub

Đã giữ bộ chọn tiếng Việt/Trung, liên kết Shopee, JD mở rộng, trình xem/dịch CV và quản trị khóa API từ main. Bổ sung nhãn tiếng Trung cho phần giao diện được rút gọn.

TypeScript/build và 4 bài Chromium đăng nhập qua proxy đạt. Lượt kiểm tra giao diện tích hợp dùng database tạm, dữ liệu giả lập và bộ quét được tiêm riêng cho fixture để kiểm tra UI; không phải kiểm thử bộ quét mã độc thật. Các bài cần ClamAV/Microsoft Defender thật chưa được chạy lại trong môi trường này vì dịch vụ quét chưa sẵn sàng. Không thay đổi cơ chế quét hoặc logic backend của main trong commit giao diện.

Bản ghép đã kiểm tra thêm 48 trường hợp responsive gồm trang tiếng Trung, 4 màn axe không có cảnh báo tự động, liên kết Shopee còn đủ 3 ngành hàng và nộp hồ sơ qua giao diện với bộ quét fixture. Bằng chứng ở `/workspace/test-results/hr-ui-merged-2026-10-31/`.
