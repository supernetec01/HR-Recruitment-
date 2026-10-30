# Quét mã độc khi nhận CV

Ứng viên và HR được gửi mọi định dạng tệp, tối đa 10 MB/tệp. Website chỉ ghi hồ sơ/tài liệu sau khi bộ quét trả kết quả đạt cho đúng nội dung tệp. Không dùng tên đuôi hoặc việc xuất hiện từ khóa `EmbeddedFile` trong PDF để kết luận mã độc.

## Windows: Microsoft Defender

Mặc định `CV_SCANNER=auto`: trên Windows, ứng dụng ưu tiên Microsoft Defender đang hoạt động và có chữ ký mới. Không cần cài thêm gói npm hoặc upload CV sang website quét virus.

1. Trong Windows Security, bật Microsoft Defender và cập nhật Security intelligence. Nếu công ty dùng antivirus khác hoặc Defender ở chế độ thụ động, dùng phương án ClamAV bên dưới.
2. Trong Terminal của repo, chạy:

   ```powershell
   git pull origin main
   npm ci
   npm run scanner:check
   npm run dev
   ```

3. `scanner:check` phải báo bộ quét sẵn sàng và phiên bản chữ ký. Nếu báo thiếu quyền, kiểm tra chính sách của công ty hoặc chạy Terminal/VS Code với quyền phù hợp; không tắt antivirus để vượt qua lỗi. Website vẫn đọc được CV cũ khi bộ quét lỗi, nhưng không nhận tệp mới chưa được quét.

Ứng dụng gọi `Get-MpComputerStatus` rồi dùng `MpCmdRun.exe` để Custom Scan tệp tạm riêng. Không chạy tệp ứng viên tải lên. Kết quả quét và checksum được lưu cùng tài liệu; không tự gắn nhãn đã quét cho CV cũ. Defender hoạt động theo chính sách và cấu hình bảo vệ của Windows.

## Thay thế bằng ClamAV trên Windows/Linux/macOS

Cần Docker Desktop (Windows/macOS) hoặc Docker Engine + Compose (Linux), đang chạy:

```bash
npm run scanner:up
npm run scanner:check
```

`compose.antivirus.yml` dùng image ClamAV chính thức được pin bằng digest, mở cổng **chỉ trên 127.0.0.1:3310**, giữ chữ ký trong volume riêng và chạy FreshClam cập nhật tự động. Lần đầu khởi động có thể cần vài phút. Cần Internet cho registry Docker và `database.clamav.net` để cập nhật chữ ký; không gửi nội dung CV đến các địa chỉ này.

Ở chế độ auto trên Windows, nếu Defender không hoạt động, ứng dụng thử ClamAV local. Có thể chọn riêng ClamAV trong PowerShell:

```powershell
$env:CV_SCANNER = 'clamav'
npm run scanner:check
npm run dev
```

Nếu dùng Defender riêng: `$env:CV_SCANNER = 'defender'`. Linux mặc định dùng ClamAV. `CLAMAV_HOST`, `CLAMAV_PORT` chỉ dành cho bộ quét do công ty quản lý; không công khai cổng clamd vì giao thức này không có xác thực/TLS. `.env.example` chỉ là tài liệu, không được tự nạp.

Dừng ClamAV bằng `npm run scanner:down`; giữ nguyên volume chữ ký. Không xóa `.data/` khi cập nhật ứng dụng.

## Kết quả và giới hạn

- Phát hiện mối đe dọa: trả 422, không lưu tệp vào hồ sơ.
- Không kết nối được, bộ quét báo lỗi/hết thời gian, chữ ký cũ quá 7 ngày: trả 503, không coi là quét đạt. Có thể chỉnh ngưỡng chữ ký từ 1–30 ngày bằng `CLAMAV_MAX_SIGNATURE_AGE_DAYS`; mặc định 7.
- ClamAV được cấu hình phát hiện tệp mã hóa hoặc vượt giới hạn quét/giải nén; những tệp này bị từ chối thay vì báo an toàn. Có thể cần gửi bản không đặt mật khẩu hoặc xuất thành PDF.
- PDF xem trực tiếp; DOCX xem nội dung văn bản; PNG/JPEG/GIF/WebP và TXT có phần xem phù hợp. Các loại khác được lưu bản gốc sau khi quét đạt và chỉ tải xuống để mở bằng phần mềm tương ứng. HTML/SVG/tệp thực thi không được chạy hoặc render trực tiếp trên website.
- Quét antivirus không bảo đảm phát hiện mọi mối đe dọa mới. Kết quả “đã quét” ghi rõ engine, phiên bản chữ ký, thời điểm và checksum, không phải chứng nhận an toàn tuyệt đối.

## Kiểm thử

Khởi động bộ quét và chạy `npm run scanner:check` trước `npm test` / `npm run test:e2e`. Test dùng engine thực để xác minh PDF có Content Credentials được nhận và chuỗi thử antivirus EICAR vô hại bị chặn. Test riêng mô phỏng mất kết nối, chữ ký cũ và phản hồi không đầy đủ để kiểm tra không lưu khi chưa quét đạt.

File fixture C2PA trong repo là dữ liệu tổng hợp. CV thật do người dùng cung cấp không được đưa vào repository.
