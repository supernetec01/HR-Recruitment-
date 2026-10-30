import { useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, Copy, FilePlus2, GitMerge, Info, Link2, LoaderCircle, Plus, ShieldCheck, UserPlus } from 'lucide-react';
import { api, ApiError, date, errorMessage, json, key, SOURCES } from './api';
import { Alert, Avatar, Field, FileInput, Modal } from './ui';
import type { Candidate, Job, Match, Submission, User } from './types';

function DuplicateChoice({ matches, target, setTarget, resolution, setResolution, reason, setReason }: {
  matches: Match[]; target: string; setTarget: (v: string) => void; resolution: string; setResolution: (v: string) => void; reason: string; setReason: (v: string) => void;
}) {
  return <div className="duplicate-box"><div className="inline-heading"><GitMerge size={20}/><div><strong>Có thể ứng viên đã có hồ sơ</strong><p>Xác nhận trước khi lưu. Hệ thống sẽ không tự động hợp nhất.</p></div></div>
    {matches.map((match, index) => <label className={`match-card ${target === match.id && resolution === 'link' ? 'selected' : ''}`} key={match.id}>
      <input type="radio" name="match" checked={target === match.id && resolution === 'link'} onChange={() => { setTarget(match.id); setResolution('link'); }}/><Avatar name={match.full_name} index={index}/><div><strong>{match.full_name || 'Chưa có tên'}</strong><span>{match.email || match.phone} · {match.source}</span></div>
    </label>)}
    <label className="checkbox-line"><input type="radio" name="match" checked={resolution === 'separate'} onChange={() => setResolution('separate')}/><span>Đây là người khác, tạo hồ sơ riêng</span></label>
    {resolution === 'separate' && <Field label="Lý do xác nhận" required><textarea required minLength={5} value={reason} onChange={e => setReason(e.target.value)} placeholder="Ví dụ: Đã gọi xác minh, đây là số điện thoại dùng chung…"/></Field>}
    <p className="helper"><ShieldCheck size={15}/>Liên kết sẽ thêm tài liệu và lượt ứng tuyển; giữ nguyên thông tin cùng CV đã có.</p>
  </div>;
}

export function CandidateForm({ jobs, users, user, uploadFirst, onClose, onSaved }: { jobs: Job[]; users: User[]; user: User; uploadFirst: boolean; onClose: () => void; onSaved: (candidate: Candidate) => void }) {
  const [file, setFile] = useState<File | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [matches, setMatches] = useState<Match[]>([]), [target, setTarget] = useState(''), [resolution, setResolution] = useState(''), [reason, setReason] = useState('');
  const [consent, setConsent] = useState('pending');
  const requestKey = useRef(key());
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const data = new FormData(event.currentTarget); data.delete('file'); data.delete('match');
    if (file) data.append('file', file);
    if (matches.length) { if (!resolution) { setError('Hãy chọn cách xử lý hồ sơ nghi trùng.'); return; } data.set('resolution', resolution); data.set('targetId', target); data.set('reason', reason); }
    setBusy(true); setError('');
    try { const result = await api<{ candidate: Candidate }>('/candidates', { method: 'POST', body: data, headers: { 'Idempotency-Key': requestKey.current } }); onSaved(result.candidate); }
    catch (err) { if (err instanceof ApiError && err.code === 'POSSIBLE_DUPLICATE' && err.matches) { setMatches(err.matches); setTarget(err.matches[0].id); setResolution('link'); } else setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <Modal title={uploadFirst ? 'Tiếp nhận CV mới' : 'Thêm ứng viên'} subtitle="Bắt đầu với những gì bạn có. Thông tin còn thiếu có thể bổ sung sau." onClose={() => !busy && onClose()} wide>
    <form onSubmit={submit} onChange={() => { requestKey.current = key(); if (matches.length) { setMatches([]); setResolution(''); } }}>
      <div className="modal-body">
        <div className="info-note"><Info size={18}/><span>Hồ sơ chưa đủ thông tin vẫn được lưu và đánh dấu <strong>Cần bổ sung</strong>.</span></div>
        {uploadFirst && <FileInput file={file} onChange={value => { setFile(value); requestKey.current = key(); }}/>}
        <h3 className="form-section-title"><UserPlus size={17}/>Thông tin ứng viên <span>Không bắt buộc đầy đủ ngay</span></h3>
        <div className="form-grid">
          <Field label="Họ và tên"><input name="fullName" placeholder="Nguyễn Văn A" maxLength={120}/></Field>
          <Field label="Số điện thoại"><input name="phone" type="tel" placeholder="09xx xxx xxx" maxLength={30}/></Field>
          <Field label="Email"><input name="email" type="email" placeholder="ungvien@email.com" maxLength={254}/></Field>
          <Field label="Khu vực sinh sống"><input name="location" placeholder="TP. Hồ Chí Minh" maxLength={200}/></Field>
          <Field label="Vị trí ứng tuyển"><select name="jobId"><option value="">Chọn sau</option>{jobs.filter(j => j.status === 'open').map(j => <option key={j.id} value={j.id}>{j.title}</option>)}</select></Field>
          <Field label="Nguồn hồ sơ" required><select name="source" defaultValue={uploadFirst ? 'Email' : 'Facebook'}>{SOURCES.filter(s => s !== 'Website').map(s => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Ngày nhận hồ sơ" hint="Ngày công ty thực tế nhận CV" required><input type="date" name="receivedAt" defaultValue={new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())} required/></Field>
          <Field label="Người phụ trách"><select name="ownerId" defaultValue={user.id}>{users.filter(u => ['hr','admin'].includes(u.role)).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}<option value="">Chưa phân công</option></select></Field>
        </div>
        {!uploadFirst && <><h3 className="form-section-title"><FilePlus2 size={17}/>CV & tài liệu</h3><FileInput file={file} onChange={value => { setFile(value); requestKey.current = key(); }}/></>}
        <div className="form-grid">
          <Field label="Portfolio" className="full"><input name="portfolio" type="url" placeholder="https://behance.net/…" maxLength={1000}/></Field>
          <Field label="Ghi chú nội bộ" className="full"><textarea name="notes" placeholder="Thông tin đã trao đổi, kinh nghiệm nổi bật hoặc việc cần theo dõi…" maxLength={5000}/></Field>
          <Field label="Đồng ý xử lý dữ liệu" className="full"><select name="consentStatus" value={consent} onChange={e => setConsent(e.target.value)}><option value="pending">Chưa xác nhận — cần bổ sung</option><option value="granted">Đã được ứng viên đồng ý</option></select></Field>
          {consent === 'granted' && <Field label="Căn cứ xác nhận sự đồng ý" className="full" required><input name="consentEvidence" placeholder="Ví dụ: Ứng viên xác nhận qua email ngày…" required maxLength={1000}/></Field>}
        </div>
        {matches.length > 0 && <div onChange={e => e.stopPropagation()}><DuplicateChoice matches={matches} target={target} setTarget={setTarget} resolution={resolution} setResolution={setResolution} reason={reason} setReason={setReason}/></div>}
        {error && <Alert>{error}</Alert>}
      </div>
      <footer className="modal-foot"><span><ShieldCheck size={15}/>Thông tin được lưu trong hệ thống nội bộ</span><div><button type="button" className="button secondary" onClick={onClose} disabled={busy}>Hủy</button><button className="button primary" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin"/> : <Plus size={17}/>} {resolution === 'link' && matches.length ? 'Xác nhận & liên kết' : 'Lưu hồ sơ'}</button></div></footer>
    </form>
  </Modal>;
}

export function ResolveForm({ submission, onClose, onSaved }: { submission: Submission; onClose: () => void; onSaved: (candidate: Candidate) => void }) {
  const [resolution, setResolution] = useState('link'), [target, setTarget] = useState(submission.matches[0]?.id || ''), [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''); const requestKey = useRef(key());
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await api<{ candidate: Candidate }>(`/submissions/${submission.id}/resolve`, { method: 'POST', body: json({ resolution, targetId: target, reason }), headers: { 'Idempotency-Key': requestKey.current } }); onSaved(result.candidate); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return <Modal title="Xác minh hồ sơ trùng" subtitle="Hồ sơ gửi từ website được giữ riêng đến khi HR xác nhận." onClose={() => !busy && onClose()}>
    <form onSubmit={submit}><div className="modal-body"><div className="received-summary"><span className="eyebrow">HỒ SƠ VỪA NHẬN · {date(submission.created_at)}</span><h3>{submission.payload.fullName}</h3><p>{submission.payload.email} · {submission.payload.phone}</p>{submission.documents.map(d => <p key={d.original_name}><FilePlus2 size={15}/> {d.original_name}</p>)}</div>
      <DuplicateChoice matches={submission.matches} target={target} setTarget={setTarget} resolution={resolution} setResolution={setResolution} reason={reason} setReason={setReason}/>
      {resolution === 'link' && <Field label="Ghi nhận kết quả xác minh" required><textarea required minLength={5} value={reason} onChange={e => setReason(e.target.value)} placeholder="HR đã kiểm tra thông tin và xác nhận…"/></Field>}{error && <Alert>{error}</Alert>}
    </div><footer className="modal-foot"><span>CV cũ luôn được giữ nguyên</span><button className="button primary" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin"/> : <GitMerge size={17}/>}Xác nhận xử lý</button></footer></form>
  </Modal>;
}

export function UpdateLinkForm({ candidate, onClose, onCreated }: { candidate: Candidate; onClose: () => void; onCreated: () => void }) {
  const [hours, setHours] = useState('72'), [link, setLink] = useState(''), [expires, setExpires] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false);
  async function create(event: FormEvent) { event.preventDefault(); setBusy(true); try { const result = await api<{ path: string; expiresAt: string }>(`/candidates/${candidate.id}/update-links`, { method: 'POST', body: json({ hours: Number(hours) }) }); setLink(new URL(result.path, window.location.origin).toString()); setExpires(result.expiresAt); onCreated(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); } }
  return <Modal title="Mời ứng viên bổ sung hồ sơ" subtitle="Không cần tài khoản. Thông tin được gắn đúng hồ sơ hiện có." onClose={onClose}>
    <form onSubmit={create}><div className="modal-body"><div className="profile-mini"><Avatar name={candidate.full_name}/><div><strong>{candidate.full_name || 'Chưa có tên'}</strong><p>{candidate.email || candidate.phone || 'Chưa có thông tin liên hệ'}</p></div></div>
      {!link ? <><Field label="Liên kết có hiệu lực"><select value={hours} onChange={e => setHours(e.target.value)}><option value="24">24 giờ</option><option value="72">3 ngày</option><option value="168">7 ngày</option></select></Field><div className="info-note"><ShieldCheck size={19}/><span>Liên kết chỉ dùng một lần. Bạn có thể thu hồi bất kỳ lúc nào trong hồ sơ ứng viên. Hãy gửi riêng cho đúng người.</span></div></> : <><Alert success>Đã tạo liên kết. Có hiệu lực đến {date(expires, true)}.</Alert><Field label="Liên kết dành riêng cho ứng viên"><input value={link} readOnly onFocus={e => e.target.select()}/></Field><button type="button" className="button primary full-width" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setError('Trình duyệt chưa cho phép sao chép. Hãy chọn và sao chép liên kết ở ô bên trên.'); } }}>{copied ? <Check size={17}/> : <Copy size={17}/>} {copied ? 'Đã sao chép liên kết' : 'Sao chép liên kết'}</button><p className="helper">Liên kết chỉ hiển thị khi vừa tạo. Hệ thống chỉ lưu mã băm của liên kết.</p></>}{error && <Alert>{error}</Alert>}
    </div><footer className="modal-foot"><span><Link2 size={15}/>Thêm tài liệu, giữ nguyên CV cũ</span>{!link && <button className="button primary" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin"/> : <Link2 size={17}/>}Tạo liên kết</button>}{link && <button type="button" className="button secondary" onClick={onClose}>Hoàn tất</button>}</footer></form>
  </Modal>;
}

export function JobForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); setBusy(true); try { await api('/jobs', { method: 'POST', body: json(data) }); onSaved(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); } }
  return <Modal title="Mở vị trí tuyển dụng" subtitle="Vị trí được hiển thị ngay trên cổng ứng tuyển." onClose={onClose}><form onSubmit={submit}><div className="modal-body form-grid"><Field label="Tên vị trí" className="full" required><input name="title" required minLength={2} maxLength={120} placeholder="Content Marketing"/></Field><Field label="Bộ phận" required><input name="department" required maxLength={120} placeholder="Marketing"/></Field><Field label="Số lượng cần tuyển" required><input name="openings" type="number" min={1} max={1000} defaultValue={1} required/></Field><Field label="Địa điểm" className="full" required><input name="location" required defaultValue="TP. Hồ Chí Minh" maxLength={200}/></Field><Field label="Mô tả & yêu cầu công việc" className="full" required><textarea name="description" required minLength={20} maxLength={10000} rows={6} placeholder="Công việc, yêu cầu, quyền lợi và cách làm việc của đội ngũ…"/></Field>{error && <div className="full"><Alert>{error}</Alert></div>}</div><footer className="modal-foot"><span>Hiển thị công khai trên cổng tuyển dụng</span><button className="button primary" disabled={busy}><Plus size={17}/>{busy ? 'Đang lưu…' : 'Đăng tuyển'}</button></footer></form></Modal>;
}

export function InterviewForm({ candidates, users, initialId, onClose, onSaved }: { candidates: Candidate[]; users: User[]; initialId?: string; onClose: () => void; onSaved: () => void }) {
  const [candidateId, setCandidateId] = useState(initialId || ''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const selected = candidates.find(c => c.id === candidateId);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); setBusy(true); setError('');
    try { await api('/interviews', { method: 'POST', body: json({ ...data, startsAt: new Date(`${data.startsAt}:00+07:00`).toISOString(), endsAt: new Date(`${data.endsAt}:00+07:00`).toISOString() }) }); onSaved(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return <Modal title="Đặt lịch phỏng vấn" subtitle="Hệ thống kiểm tra lịch trùng của người phỏng vấn trước khi lưu." onClose={onClose}><form onSubmit={submit}><div className="modal-body form-grid"><Field label="Ứng viên" className="full" required><select value={candidateId} onChange={e => setCandidateId(e.target.value)} required><option value="">Chọn ứng viên</option>{candidates.map(c => <option value={c.id} key={c.id}>{c.full_name || 'Chưa có tên'}</option>)}</select></Field><Field label="Lượt ứng tuyển" className="full" required><select name="applicationId" required key={candidateId}><option value="">Chọn vị trí</option>{selected?.applications.map(a => <option key={a.id} value={a.id}>{a.job_title}</option>)}</select></Field><Field label="Bắt đầu (UTC+7)" required><input name="startsAt" type="datetime-local" required/></Field><Field label="Kết thúc (UTC+7)" required><input name="endsAt" type="datetime-local" required/></Field><Field label="Người phỏng vấn" required><select name="interviewerId" required><option value="">Chọn người phỏng vấn</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field><Field label="Hình thức"><select name="mode"><option>Online</option><option>Trực tiếp</option><option>Điện thoại</option></select></Field><Field label="Địa điểm / Liên kết họp" className="full" required><input name="location" required minLength={2} maxLength={1000} placeholder="Phòng họp hoặc liên kết Google Meet…"/></Field><div className="info-note full"><Info size={18}/><span>Lịch được lưu nội bộ. Phiên bản này chưa gửi email hay đồng bộ lịch bên ngoài.</span></div>{error && <div className="full"><Alert>{error}</Alert></div>}</div><footer className="modal-foot"><span>Giờ Việt Nam · UTC+7</span><button className="button primary" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin"/> : <ArrowRight size={17}/>}Lưu lịch phỏng vấn</button></footer></form></Modal>;
}
