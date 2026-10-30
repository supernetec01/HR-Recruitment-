# Thiết kế luồng tiếp nhận thống nhất

Tài liệu này cụ thể hóa yêu cầu hiện tại của Super Net. Hai tài liệu tham khảo mô tả phạm vi dài hạn rộng hơn; implementation tập trung vào tiếp nhận và bổ sung hồ sơ, không giả lập việc AI dịch CV hay Boss đã phê duyệt.

## Bổ sung vận hành nội bộ

`users` có tên đăng nhập duy nhất không phân biệt hoa/thường, trạng thái hoạt động, vai trò Admin/Sếp/HR/Người phỏng vấn (`interviewer`); mật khẩu băm scrypt. Nâng cấp CHECK của SQLite bằng giao dịch dựng lại bảng, giữ ID, hash, phiên, khóa ngoại và chủ sở hữu hồ sơ; kiểm tra referential integrity rồi bật lại foreign keys. Admin được khởi tạo một lần qua `npm run setup`, không có mật khẩu hardcode. Admin tạo/sửa/khóa/đặt lại mật khẩu user qua giao diện, đổi quyền hoặc mật khẩu sẽ thu hồi phiên cũ. Chỉ Admin thấy bảng chức năng/vai trò và danh sách tài khoản; người khác dùng trang tài khoản cá nhân. Dữ liệu nội bộ ở `.data/internal/`, độc lập với demo `.data/`.

`interview_requests` liên kết lượt ứng tuyển, đúng phiên bản CV của ứng viên, người lựa chọn, người phỏng vấn đề xuất, ghi chú, giai đoạn trước đó và trạng thái chờ/đã lên lịch/đã hủy. Sếp, Người phỏng vấn hoặc Admin tạo yêu cầu bằng API riêng; HR không được tự chuyển giai đoạn sang Hẹn phỏng vấn. CV đang cách ly vẫn có thể được gắn vào yêu cầu, không tự chuyển thành đã kiểm tra và không cấp quyền preview/download; tài liệu cần được kiểm tra trước khi mở. Người đề xuất phải đang hoạt động và có vai trò Người phỏng vấn/Sếp/Admin. Yêu cầu có idempotency và duy nhất một yêu cầu chờ cho mỗi application. Đây là lựa chọn ứng viên cho vòng phỏng vấn, không phải duyệt offer hay tuyển dụng cuối cùng. Người phỏng vấn chỉ được hủy yêu cầu do mình tạo.

HR nhận yêu cầu qua dashboard và danh sách tự cập nhật 30 giây. `interviews.request_id` gắn lịch với yêu cầu; tạo lịch và đánh dấu yêu cầu đã xử lý cùng một giao dịch. Giờ bắt đầu + thời lượng 15–240 phút tạo giờ kết thúc, lưu UTC chuẩn; bảng dashboard theo ngày hiển thị UTC+7. Kiểm tra overlap của người phỏng vấn lẫn ứng viên qua mọi lượt ứng tuyển. Đổi lịch có lý do và audit before/after; hủy lịch mở lại yêu cầu cũ để HR xếp lại. Không được hoàn thành lịch trước giờ bắt đầu hoặc thay giai đoạn thủ công khi còn lịch hoạt động.

API bổ sung: `GET/POST /api/v1/admin/users`, `PATCH /api/v1/admin/users/:id`, `POST /api/v1/me/password`, `GET /api/v1/interview-requests`, `POST /api/v1/applications/:id/interview-requests`, `PATCH /api/v1/interview-requests/:id`, `GET /api/v1/documents/:id/preview`. `POST/PATCH /api/v1/interviews` hỗ trợ thời lượng và đổi lịch. Endpoint PDF cần phiên đăng nhập, trạng thái đã kiểm tra và ghi nhật ký xem; DOCX tải bằng API riêng.

## Mô hình dữ liệu

```mermaid
erDiagram
  CANDIDATES ||--o{ APPLICATIONS : "các lần ứng tuyển"
  JOBS ||--o{ APPLICATIONS : "vị trí"
  CANDIDATES ||--o{ DOCUMENTS : "các phiên bản CV"
  CANDIDATES ||--o{ UPDATE_TOKENS : "liên kết bổ sung"
  CANDIDATES ||--o{ AUDIT_LOGS : "lịch sử"
  APPLICATIONS ||--o{ INTERVIEWS : "phỏng vấn"
  USERS ||--o{ INTERVIEWS : "người phỏng vấn"
  SUBMISSIONS ||--o{ DOCUMENTS : "hồ sơ chờ xác minh"
```

`candidates` giữ thông tin gốc và nguồn đầu tiên. `applications` giữ nguồn/ngày nhận/giai đoạn của từng lần ứng tuyển. `documents` là bản ghi bất biến về nội dung file; upload mới tạo ID, checksum và phiên bản mới, không ghi đè tệp. `submissions` chứa bản tiếp nhận công khai có dấu hiệu trùng, chưa liên kết vào người nào cho đến khi HR xác nhận.

Mã nguồn schema: `server/db.mjs`. Database có khóa ngoại, index liên hệ, index duy nhất cho lượt đang xử lý và các cập nhật nghiệp vụ trong giao dịch `BEGIN IMMEDIATE`.

## JD và cổng tuyển dụng

`jobs` bổ sung `requirements`, `benefits`, `working_hours`, `salary_range`, `business_line`, `application_deadline`, `updated_at`, `revision` bằng migration thêm cột, không thay ID hay xóa nội dung cũ. `business_line` nhận `safestraps`, `jielien`, `baby-tatto` hoặc chuỗi rỗng cho tuyển dụng chung. Trang công khai giới thiệu ba ngành hàng; mỗi vị trí có trang JD riêng `/tuyen-dung/:id`, tách khỏi biểu mẫu `/ung-tuyen/:id`.

Các cột `company_name`, `application_instructions`, `application_email`, `application_email_subject`, `application_zalo` lưu đầy đủ tên công ty/cách ứng tuyển. Biểu mẫu `src/job-editor.tsx` giữ trạng thái khi chuyển Nhập thông tin/Xem trước; mẫu `src/jd-template.ts` chép nội dung tài liệu do Super Net cung cấp, chỉ điền khi người dùng chọn và chỉ ghi DB khi lưu. `JDContent` dùng chung cho xem trước và trang công khai, hiển thị thông tin chung, mô tả, yêu cầu, lương/quyền lợi và liên hệ. Văn bản được React escape, dòng bullet thành danh sách; email/Zalo được kiểm tra trước khi lưu.

`server/jobs.mjs` quản lý API JD. GET nội bộ cần phiên đăng nhập; POST/PATCH cần Admin/HR. PATCH kiểm tra dữ liệu sau khi hợp nhất với bản hiện tại để không xóa các trường bị bỏ qua, không đổi ID liên kết application. Giao diện gửi `expectedRevision`; bản cũ bị trả 409. Các cập nhật và audit người sửa/nội dung trước-sau nằm cùng giao dịch.

GET công khai chỉ trả danh sách trường JD cho phép, không trả user, CV, lượt ứng tuyển hay thông tin ứng viên. Tin phải có `status=open` và không có hạn hoặc hạn từ ngày hiện tại tại UTC+7 trở đi. Danh sách, trang JD trực tiếp và API tiếp nhận ứng tuyển dùng chung điều kiện; tin đã đóng/hết hạn không nhận lượt mới, vẫn giữ application/lịch đã có. Nội dung JD là văn bản do React escape, giữ xuống dòng, không render HTML người dùng nhập.

## Quy tắc nghiệp vụ đã thực thi

- **Thiếu thông tin:** HR có thể lưu nếu có ít nhất tên, thông tin liên hệ hoặc CV. Tình trạng đầy đủ được suy ra từ tên, liên hệ, ít nhất một lượt ứng tuyển, CV và sự đồng ý; không lưu hai trạng thái có thể lệch nhau.
- **Ngày nhận / ngày nhập:** `received_at` do HR nhập, `created_at` do máy chủ tạo. Không lấy ngày nhập làm ngày nhận thực tế trong trường hợp hồ sơ ngoài hệ thống.
- **Chống trùng:** email chuẩn hóa chữ thường, số điện thoại bỏ dấu phân tách và chuẩn hóa `84` sang `0`. Không dùng tên để tự động hợp nhất. Không có email/phone thì chưa thể phát hiện chắc chắn; HR phải bổ sung/xác minh.
- **Xác nhận khác người:** HR phải nhập lý do. Hệ thống cho phép người khác dùng chung email/phone sau xác minh, không ép unique ở bảng candidate.
- **Cùng người:** HR chọn một gợi ý trùng; thêm ứng tuyển hoặc tài liệu nhưng giữ nguyên thông tin cũ. Chi tiết vừa gửi được lưu trong nhật ký. Tài liệu vẫn cách ly sau khi liên kết.
- **Ứng tuyển lại:** cùng vị trí còn lượt đang xử lý thì thêm vào lượt đó; khác vị trí hoặc lượt trước đã kết thúc thì tạo application mới trên cùng candidate.
- **Gửi lặp:** các API tiếp nhận, upload, xác minh và bổ sung yêu cầu `Idempotency-Key`. Cùng key/nội dung trả lại kết quả cũ; key đã dùng với nội dung khác trả 409. Thay đổi DB và lưu kết quả idempotency nằm cùng giao dịch. Mạng chậm không tạo thêm hồ sơ, application hoặc phiên bản file.
- **Thông tin công khai:** phản hồi tiếp nhận không nói ứng viên đã tồn tại hay chưa; không trả ID, email/phone đã có hoặc gợi ý trùng ra cổng ứng tuyển.
- **Link bổ sung:** ngẫu nhiên 256 bit, chỉ lưu hash, tối đa 7 ngày, một lần dùng, có thể thu hồi. Link chỉ cho thêm dữ liệu vào đúng candidate. Thông tin khác với dữ liệu cũ được giữ trong nhật ký chờ HR xem, không âm thầm sửa danh tính. Replay cùng key sau thành công vẫn trả thành công; gửi mới bằng token đã dùng trả 410.
- **Consent và trao đổi lịch:** biểu mẫu công khai cần checkbox đồng ý; HR đánh dấu đã đồng ý phải nhập căn cứ. Khi trạng thái `pending`, HR/Admin vẫn có thể xếp lịch nếu có thông tin liên hệ và gửi `contactConfirmed=true` cùng `contactEvidence` từ 10 ký tự. Lưu `interviews.contact_evidence/contacted_at/contacted_by` và audit riêng; không tự sửa `candidates.consent_status/consent_at`. Khi đổi lịch, ghi nhận cũ được giữ nếu không có nội dung trao đổi mới. `withdrawn` vẫn chặn xếp/đổi lịch, thu hồi link; muốn tiếp tục cần ghi nhận sự đồng ý mới thực tế.
- **PDF:** cho phép BOM UTF-8 và khoảng trắng trước `%PDF-` trong 1.024 byte đầu; không cho prefix HTML hoặc dữ liệu khác. Không cắt bỏ prefix để bảo toàn bytes, checksum và offsets của tệp. Giới hạn 10 MB, chặn nội dung chủ động đã nhận diện và cách ly tài liệu mới vẫn áp dụng.
- **Lịch:** kiểm tra start/end hợp lệ, tương lai, người phỏng vấn tồn tại, thông tin liên hệ và consent; truy vấn overlap trong giao dịch để không tạo hai lịch chồng giờ. Không tạo lịch cho lượt đã kết thúc hoặc đã có quyết định. Một người phỏng vấn mỗi lịch trong phạm vi hiện tại.
- **Phê duyệt:** chưa có workflow Boss phê duyệt nên API chặn chuyển sang offer/hired. Không coi điểm hay việc chuyển pipeline là quyết định tuyển dụng.

## API chính

| Nhóm | API |
| --- | --- |
| Xác thực | `POST /api/v1/login`, `GET /api/v1/me`, `POST /api/v1/logout` |
| Demo | `POST /api/v1/demo-session` — chỉ khi `DEMO_MODE=1` |
| Hồ sơ | `GET/POST /api/v1/candidates`, `GET/PATCH /api/v1/candidates/:id` |
| Tài liệu | `POST /api/v1/candidates/:id/documents`, `POST /api/v1/documents/:id/review`, `GET /api/v1/documents/:id/download` |
| Ứng tuyển | `POST /api/v1/candidates/:id/applications`, `PATCH /api/v1/applications/:id` |
| Xác minh trùng | `GET /api/v1/submissions`, `POST /api/v1/submissions/:id/resolve` |
| Link bổ sung | `POST /api/v1/candidates/:id/update-links`, `DELETE /api/v1/candidates/:id/update-links/:hash` |
| Công khai | `GET /api/v1/public/jobs`, `GET /api/v1/public/jobs/:id`, `POST /api/v1/public/applications` |
| Bổ sung công khai | `GET/POST /api/v1/public/update-links/:token` |
| Vị trí | `GET/POST /api/v1/jobs`, `PATCH /api/v1/jobs/:id` |
| Lịch | `GET/POST /api/v1/interviews`, `PATCH /api/v1/interviews/:id` |

Form upload dùng `multipart/form-data`, một trường file tên `file`, PDF/DOCX tối đa 10 MB. Những API ghi nội bộ cần cookie phiên cùng `X-Requested-With: SuperNet`. API công khai không yêu cầu đăng nhập. Payload kiểm tra bằng Zod; SQL dùng tham số; tên tệp không được dùng làm đường dẫn lưu.

## Chuyển sang kiến trúc dài hạn

Giữ mô hình candidate/application/document khi chuyển sang PostgreSQL và private object storage. Sau đó bổ sung AV worker/quarantine tự động, outbox cho thông báo, đánh giá độc lập theo người phỏng vấn, phê duyệt Boss có lý do và quyền theo resource. Chỉ nối AI OCR/dịch sau khi có chính sách dữ liệu, provider và kiểm thử chất lượng; luôn lưu extraction/translation tách khỏi CV gốc và yêu cầu HR kiểm tra.

Việc xóa theo yêu cầu cá nhân phải xử lý cả file, nội dung nhập, submissions, audit chứa PII, idempotency response, bản dịch và backup theo chính sách hợp lệ. Phiên bản hiện tại chưa có quy trình xóa/retention hoàn chỉnh và chưa tuyên bố tuân thủ pháp luật cho vận hành thật.
