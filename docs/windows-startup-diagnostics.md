# Chẩn đoán website không tự chạy sau khi khởi động Windows

Chạy trên **máy Windows đang chứa website và Cloudflare Tunnel**. Mở PowerShell trong thư mục repo:

```powershell
git pull origin main
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File .\scripts\diagnose-windows-startup.ps1
```

Lệnh đọc cấu hình, không sửa Task Scheduler, DNS, dịch vụ hoặc dữ liệu tuyển dụng; chỉ ghi báo cáo vào `.data\diagnostics\startup-<thời điểm>.json` và in lên màn hình. Không đưa báo cáo vào Git. Có thể sao chép nội dung báo cáo để phân tích; command line/Arguments đầy đủ, token tunnel, khóa API và nội dung database không được in. Báo cáo vẫn chứa đường dẫn cục bộ, tên tài khoản và tên tác vụ phục vụ chẩn đoán.

Nếu không tìm thấy tác vụ phù hợp, chạy lại với đúng tên trong Task Scheduler:

```powershell
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File .\scripts\diagnose-windows-startup.ps1 -TaskName "TEN TAC VU WEBSITE"
```

Nếu `CollectionFailures` báo không đọc được tác vụ/process, chạy lại PowerShell với quyền Administrator để đọc đầy đủ. Script không tự nâng quyền và không xuất toàn bộ command line. Với tác vụ dùng inline/encoded command, báo cáo chỉ đánh dấu cách gọi; cần xem riêng phần Actions và che thông tin bí mật trước khi chia sẻ.

## Đọc kết quả theo thứ tự

1. **`Listeners` và `LocalHealth`**: cổng 3000 phải có listener và `/api/v1/health` trả HTTP 200, `status=ok`. Chỉ một cửa sổ PowerShell đang mở hoặc task ở trạng thái Running chưa chứng minh website đã sẵn sàng.
2. **`Tasks`**: xem đúng tác vụ website, khác với tác vụ cloudflared. `LastResult` cho biết lần chạy gần nhất; `LastRunTime` phải phù hợp sau reboot/logon. `0x00000000` là action đã kết thúc thành công, không tự chứng minh Node còn chạy. `0x00041301` chỉ cho biết tác vụ đang chạy.
3. **`Actions.Program`, `StartIn`, `Launch.ScriptFile`**: kiểm tra đường dẫn có thật. `StartIn` thường nên là thư mục repo hoặc script phải tự `Set-Location` vào đúng repo. Bỏ trống Start in chưa chắc sai nếu script đã đặt working directory. Không sửa đường dẫn dữ liệu sang thư mục mới chỉ để làm startup chạy.
4. **Tài khoản và `LogonType`**: tác vụ chạy dưới SYSTEM hoặc người khác có PATH, quyền thư mục và cấu hình khác phiên mở thủ công. Với Node cài riêng theo user, nên dùng đường dẫn đầy đủ đến executable thay vì dựa vào PATH của tài khoản khác.
5. **`Triggers` và Settings**: phân biệt At startup với At log on; kiểm tra Enabled, điều kiện mạng/pin, giới hạn thời gian, restart và thời gian trì hoãn. `ExecutionTimeLimit=PT72H` có thể dừng dịch vụ dài hạn sau ba ngày, nhưng chỉ coi là nguyên nhân khi lịch sử task chứng minh điều đó.
6. **`DNS`**: local health tốt nhưng NXDOMAIN là vấn đề phân giải tên riêng. So sánh DNS hệ thống và hai resolver công khai; lỗi timeout không đồng nghĩa NXDOMAIN.

## Dấu hiệu trong ảnh hiện tại

- `Registered tunnel connection`: tunnel đã kết nối đến Cloudflare ở thời điểm ghi log; chưa chứng minh origin cổng 3000 khỏe hoặc bản ghi DNS đúng.
- Tiêu đề **Select ...cloudflared.exe**: console đang trong chế độ chọn văn bản. Nhấn **Esc** để thoát. QuickEdit có thể chặn tiến trình khi ghi console; với tunnel chạy dài hạn nên dùng service/tác vụ phù hợp và log ra file. Chưa có căn cứ quy đây là nguyên nhân duy nhất.
- PowerShell trống: cần kiểm tra task/process và mã lỗi. Có thể là shell được mở nhưng script chưa chạy/chưa tới Node, không tự kết luận từ ảnh.

Trong repo trước thay đổi này chỉ có `npm start`/`npm run dev`, không có định nghĩa tác vụ Task Scheduler hay bộ cài tự chạy Windows. Cấu hình đã tạo trên máy công ty nằm ngoài source code. Cần báo cáo thực tế để sửa đúng tác vụ, tránh tạo thêm tác vụ trùng hoặc đổi dữ liệu/tài khoản đang dùng.

## Sửa trường hợp HR-Website đã kết thúc và không tự chạy lại

Trong báo cáo đã kiểm tra, `HR-Website` có Start in và file `start-hr.ps1` tồn tại, nhưng tác vụ đã kết thúc với `0xC000013A`; không có Node/listener 3000. Mã này chỉ ra tiến trình bị kết thúc theo cơ chế console/control-C/session/task stop, chưa xác định được tác nhân. Cấu hình có RestartCount=0 nên nó không tự phục hồi. Giới hạn PT72H là một nguy cơ dừng sau ba ngày; nó không giải thích lần dừng chỉ ít phút sau reboot trong báo cáo này.

File `start-hr.ps1` trên Windows chạy Node với `-NoNewWindow -Wait`, chuyển stdout/stderr sang `logs`, và trả exit 1 khi Node thoát để Scheduler có thể chạy lại. Vì vậy console trống là bình thường khi log được chuyển sang file. Không cần tạo lại dữ liệu hoặc thay thư mục DATA_DIR.

Sau khi đã đối chiếu đúng cấu hình này, mở PowerShell có quyền cập nhật tác vụ (Run as administrator nếu cần), trong thư mục repo:

```powershell
git pull origin main
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File .\scripts\repair-windows-startup.ps1
```

Script chỉ cập nhật **tác vụ hiện có HR-Website**, kiểm tra nó trỏ đến `start-hr.ps1` của chính checkout, rồi lưu XML gốc trong `.data\diagnostics\task-backups`. XML backup có thể chứa tham số riêng của tác vụ; giữ ở máy chủ, không đưa lên Git/chat. Script không tạo hoặc ghi đè `start-hr.ps1`, không đổi user/LogonType, không đổi dữ liệu/biến môi trường của ứng dụng và không sửa tác vụ tunnel/DNS.

Thay đổi áp dụng:

- Trigger chuyển từ At startup + Interactive sang At log on của **cùng tài khoản**, trễ 30 giây, phù hợp với tunnel hiện tại cũng chạy khi đăng nhập. Đây là tự chạy sau khi người dùng đăng nhập Windows; không phải dịch vụ chạy trước màn hình đăng nhập.
- Bỏ giới hạn 72 giờ; thử khởi động lại sau 1 phút, tối đa 999 lần; bật StartWhenAvailable; bỏ điều kiện dừng/không chạy khi dùng pin; IgnoreNew tránh bản chạy trùng.
- Thêm WindowStyle Hidden vào action để giảm rủi ro đóng nhầm/chọn văn bản trong console, giữ nguyên các arguments còn lại và working directory.
- Nếu website đã khỏe, không tạo process mới. Nếu port đang bị chương trình khác chiếm, không dừng process đó. Nếu task đang chạy thì chỉ chờ health. Khi chưa chạy, khởi động chính task hiện có rồi kiểm tra health tối đa khoảng một phút.

Nếu báo chưa sẵn sàng, đọc log `.err.log`/`.launch-error.log` mới nhất trong `logs`, hoặc chạy lại công cụ chẩn đoán. `exit 2` nghĩa là settings đã cập nhật nhưng health chưa đạt; không coi là đã sửa xong. Giữ XML backup để có thể khôi phục qua Task Scheduler nếu cần.

DNS mã 9003 từ cả hệ thống/1.1.1.1/8.8.8.8 là lỗi riêng: phải kiểm tra zone và hostname/CNAME của tunnel trong Cloudflare. Script sửa startup không làm bản ghi DNS tự xuất hiện.
