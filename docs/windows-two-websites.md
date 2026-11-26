# Chạy đồng thời HR và Jielien trên Windows

Cấu hình đã đối chiếu từ máy chủ và file bảo trì Jielien:

| Website | Ứng dụng trên máy Windows | Origin của tunnel |
| --- | --- | --- |
| `hr.jielien.com.vn` | Task `HR-Website`, repo `D:\SuperNet\HR-Recruitment-` | `http://127.0.0.1:3000` |
| `jielien.com.vn` | Container Docker hiện có `jielien-local-app-1`, project `D:\SuperNet\Jielien` | `http://127.0.0.1:3001` |

Cả hai bản ghi DNS hiện trỏ đến tunnel `supernet-hr`. Một tunnel hỗ trợ cả hai hostname; mỗi hostname cần route đến đúng cổng. Task `Jielien-Cloudflare-Tunnel` chạy connector của tunnel.

## Cài tự chạy cùng nhau

Đăng nhập Windows bằng tài khoản đang dùng HR và Docker Desktop (máy hiện tại là `fh0`). Mở PowerShell với quyền cập nhật Task Scheduler, thường là **Run as administrator**:

```powershell
Set-Location 'D:\SuperNet\HR-Recruitment-'
git pull origin main
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File .\scripts\start-windows-websites.ps1 -InstallStartup
```

Lệnh tạo/cập nhật task **`SuperNet-Websites`**, dùng cùng tài khoản interactive với `HR-Website`, chạy 30 giây sau đăng nhập Windows. Task này chạy một lần để bật các thành phần và kiểm tra hai origin. Khi lỗi startup, Scheduler thử lại sau một phút, tối đa 999 lần. Đây là tự chạy **sau đăng nhập**, phù hợp với Docker Desktop; không phải dịch vụ chạy trước màn hình đăng nhập.

Script thực hiện:

1. Khởi động các task `HR-Website` và `Jielien-Cloudflare-Tunnel` nếu chưa Running.
2. Tự tìm Docker Desktop từ tiến trình đang chạy, vị trí Docker CLI, thư mục cài theo máy/tài khoản, registry và shortcut Start Menu/Desktop. Nếu Docker engine chưa sẵn sàng, mở đúng executable đã tìm thấy và chờ tối đa khoảng bốn phút (mỗi lệnh Docker có timeout riêng).
3. Xác minh container Jielien hiện có, ghi lại restart policy trước thay đổi, rồi đặt `unless-stopped`. Chính sách Docker tự khởi động lại container khi ứng dụng lỗi trong lúc engine hoạt động.
4. Khởi động container đó nếu đang dừng và kiểm tra nó có publish cổng 3001.
5. Kiểm tra HR trả `status=ok, demo=false` tại cổng 3000 và Jielien trả HTTP 200 tại cổng 3001. Chỉ in PASS khi cả hai cùng đạt.

Script giữ container/volume/dữ liệu hiện có, không chạy build, không tạo lại container, không chạy backup hay task `Jielien-Daily-Backup-Restart`. Task bảo trì hằng ngày giữ vai trò backup và restart riêng của nó. Script không thay DNS, ingress, cấu hình HR hoặc biến môi trường của hai ứng dụng.

Nếu container không tồn tại trong Docker context của tài khoản này, script dừng và báo lỗi; cần kiểm tra đúng context/đăng nhập Docker Desktop. Không tạo container trống để thay thế. Nếu cổng publish không đúng, sửa cấu hình triển khai hiện có sau khi kiểm tra dữ liệu và volume.

Log nằm trong `.data\diagnostics\websites-startup`. Script ghi thời điểm, kết quả và restart policy cũ, không in Docker inspect đầy đủ, token, biến môi trường hoặc raw task arguments. Khi cập nhật task do script quản lý, XML gốc được sao lưu trong cùng thư mục; giữ backup ở máy chủ vì XML có thể chứa tham số riêng. Script từ chối ghi đè task cùng tên nếu không trỏ tới script này/cùng tài khoản.

Nếu bản cũ báo không tìm thấy executable ở đường dẫn mặc định, cập nhật repo rồi chạy lại chính lệnh `-InstallStartup` ở trên. Bản mới tìm cả cài đặt theo tài khoản và ổ đĩa khác. Nếu vẫn chưa tìm thấy, mở Docker Desktop thủ công bằng Start Menu rồi chạy lại; script sẽ lấy đường dẫn từ tiến trình đang chạy. Cũng có thể dùng tham số `-DockerDesktopPath` với đường dẫn thật đến file `.exe`; script sẽ lưu đường dẫn đã xác minh vào task. Dữ liệu, Docker context và container phải là của cùng tài khoản Windows đang chạy task.

Kiểm tra riêng chức năng tìm executable, không cần Docker hoặc sửa tác vụ: `powershell.exe -NoProfile -File .\tests\windows-websites-discovery.ps1` (hoặc dùng `pwsh`). Kiểm tra này dùng các file tạm và mô phỏng nguồn thông tin Windows, không chạy các executable giả lập.

## Ghép hostname vào đúng ứng dụng

Trong Cloudflare, mở tunnel **`supernet-hr`** đang được dùng, tìm **Published application routes / Public Hostnames**, đối chiếu:

| Hostname | Service |
| --- | --- |
| `hr.jielien.com.vn` | `http://127.0.0.1:3000` |
| `jielien.com.vn` | `http://127.0.0.1:3001` |

Hai bản ghi DNS cần tiếp tục trỏ vào chính tunnel này, chế độ Proxied. Chỉ có hai bản ghi DNS chưa đủ để đảm bảo mỗi hostname mở đúng ứng dụng; phải kiểm tra cả route service.

Nếu tunnel được quản lý bằng `config.yml` tại máy chủ, chỉnh phần ingress của **file đang được connector sử dụng** thay vì tạo connector/config mới. Phần ghép hostname tương ứng là:

```yaml
ingress:
  - hostname: hr.jielien.com.vn
    service: http://127.0.0.1:3000
  - hostname: jielien.com.vn
    service: http://127.0.0.1:3001
  - service: http_status:404
```

Đây chỉ là phần ingress minh họa, không phải toàn bộ file config. Giữ các route khác nếu đang sử dụng, `tunnel`, credentials và các thiết lập hiện có; đặt catch-all cuối danh sách. Thay config cục bộ cần khởi động lại connector tương ứng để nạp lại. Tunnel quản lý từ xa lấy cấu hình từ Cloudflare.

## Chạy lại và kiểm tra

Những lần chạy thủ công sau chỉ cần:

```powershell
Set-Location 'D:\SuperNet\HR-Recruitment-'
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File .\scripts\start-windows-websites.ps1
```

Kết quả cần có:

```text
PASS: HR port 3000 is healthy and Jielien port 3001 returned HTTP 200.
```

Sau đó mở cả hai website và xác nhận nội dung đúng từng ứng dụng. PASS trên chỉ xác minh các origin trên máy Windows; DNS, TLS và route public cần được kiểm tra qua URL HTTPS thực tế. Nếu tên miền vừa mở khóa, đối chiếu DNS công khai trước khi quy lỗi cho origin.

Ở lần reboot tiếp theo, đăng nhập lại cùng tài khoản Windows, chờ Docker Desktop và startup hoàn tất, kiểm tra lại cả hai URL. Task `SuperNet-Websites` có thể trở về **Ready**, LastTaskResult=0 sau khi hoàn tất; container tiếp tục chạy trong Docker, HR và tunnel tiếp tục được các task riêng quản lý. Trạng thái Ready của task điều phối không có nghĩa container đã dừng.

Để bỏ cơ chế điều phối, có thể Disable task `SuperNet-Websites` trong Task Scheduler. Các task HR/tunnel và container vẫn độc lập; việc Disable không tự dừng chúng hoặc xóa dữ liệu. Restart policy trước thay đổi được ghi trong log để quản trị viên có thể khôi phục khi cần.
