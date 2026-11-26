# SuperNet ATS — bản thiết kế giao diện

Mở **`index.html`** bằng Chrome/Edge để xem và bấm thử. Tệp đã nhúng CSS, JavaScript, icon Lucide và font Inter; mở được ngoại tuyến, không cần chạy Node, Docker hay API.

Trên máy Windows đã clone repo:

```powershell
Set-Location 'D:\SuperNet\HR-Recruitment-'
git pull origin main
Start-Process '.\design\ats-dashboard\index.html'
```

## Phạm vi bản xem trước

- Giao diện sáng, Inter, màu chính `#2563EB`, nền `#F8FAFC`, card bo 12 px, sidebar và thanh tìm kiếm.
- Sáu KPI đúng số liệu đề bài: 14, 86, 12, 28%, 62%, 19%.
- Phễu tuyển dụng 1.000 → 450 → 180 → 25 → 15. Độ dài thanh theo tỷ lệ thật; có tooltip khi hover/focus và chuyển giữa số lượng/tỷ lệ qua từng vòng.
- Bốn lịch phỏng vấn nổi bật 09:00, 10:30, 14:00, 16:00; tổng 12, hoàn tất 7, đang chờ 5.
- Chỉ tiêu quý theo phòng ban: Marketing 8/12, Sales 6/12, IT 4/10, Warehouse 2/10.
- Các màn hình phụ để duyệt phong cách: vị trí, ứng viên, kho ứng viên, pipeline kéo thả, lịch, chờ đánh giá, lịch sử, báo cáo và tùy chọn giao diện.
- Có thể dùng thử: tìm kiếm (`Ctrl K`), tạo vị trí, mở hồ sơ/chi tiết lịch, hoàn tất phỏng vấn, nhập đánh giá, lưu ứng viên, kéo thả giai đoạn, xuất CSV và đổi giao diện Anh/Việt từ avatar hoặc Settings.

Tất cả hồ sơ và hoạt động là **minh họa**, không kết nối dữ liệu tuyển dụng thật. Thay đổi trong bản xem trước chỉ tồn tại trong tab; tải lại trang sẽ khôi phục dữ liệu ban đầu. Các thao tác Save/Create chỉ thay đổi bản thử này.

Các thẻ tỷ lệ 28%/62%/19% dùng số liệu được yêu cầu. Phần mô tả chỉ số minh họa phạm vi 90 ngày; phễu là cohort tháng và chỉ tiêu phòng ban là quý. Công thức nghiệp vụ sẽ cần chốt trước khi nối dữ liệu thật.

## Tài nguyên và chỉnh sửa

- `template.html`: khung HTML.
- `styles.css`: bố cục, màu sắc, responsive.
- `prototype.js`: dữ liệu minh họa và tương tác.
- `assets/`: font Inter 5.3.0 từ `@fontsource-variable/inter`, kèm giấy phép SIL OFL 1.1.
- SVG Lucide có giấy phép kèm trong `assets/LUCIDE-LICENSE.txt`; các giấy phép cũng được nhúng vào tệp HTML độc lập.
- `screenshots/`: ảnh chụp từ trình duyệt của bản thiết kế.

Sau khi sửa nguồn, tạo lại tệp HTML độc lập bằng:

```bash
node design/ats-dashboard/build.mjs
```

Lệnh build dùng React và Lucide đã có trong repo để nhúng SVG; người mở `index.html` không cần cài thư viện. Bản xem trước nằm ngoài ứng dụng đang vận hành và không thay đổi route/API của hệ thống hiện tại.

Đã kiểm tra bằng Chromium: số liệu ban đầu, tooltip/chuyển đổi biểu đồ, tìm kiếm bằng bàn phím, tạo vị trí, lịch và đánh giá, kéo thả pipeline, lưu ứng viên và tải CSV. Bố cục được kiểm tra ở 375, 768, 1024 và 1440 px; không có lỗi JavaScript hoặc yêu cầu tải tài nguyên ngoài trong các luồng này.
