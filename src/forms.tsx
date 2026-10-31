import { t } from './locale';
import { useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, Copy, FilePlus2, GitMerge, Info, Link2, LoaderCircle, Plus, ShieldCheck, UserPlus, Clock3 } from 'lucide-react';
import { api, ApiError, date, dayKey, duration, errorMessage, json, key, SOURCES, time } from './api';
import { Alert, Avatar, Field, FileInput, Modal } from './ui';
import type { Candidate, Interview, InterviewRequest, Job, Match, Submission, User } from './types';
import { jobExpired } from './jobs';

function DuplicateChoice({ matches, target, setTarget, resolution, setResolution, reason, setReason }: {
  matches: Match[]; target: string; setTarget: (v: string) => void; resolution: string; setResolution: (v: string) => void; reason: string; setReason: (v: string) => void;
}) {
  return <div className="duplicate-box"><div className="inline-heading"><GitMerge size={20}/><div><strong>{t("Có thể ứng viên đã có hồ sơ")}</strong><p>{t("Xác nhận trước khi lưu. Hệ thống sẽ không tự động hợp nhất.")}</p></div></div>
    {matches.map((match, index) => <label className={`match-card ${target === match.id && resolution === 'link' ? 'selected' : ''}`} key={match.id}>
      <input type="radio" name="match" checked={target === match.id && resolution === 'link'} onChange={() => { setTarget(match.id); setResolution('link'); }}/><Avatar name={match.full_name} index={index}/><div><strong>{match.full_name || t("Chưa có tên")}</strong><span>{match.email || match.phone} · {match.source}</span></div>
    </label>)}
    <label className="checkbox-line"><input type="radio" name="match" checked={resolution === 'separate'} onChange={() => setResolution('separate')}/><span>{t("Đây là người khác, tạo hồ sơ riêng")}</span></label>
    {resolution === 'separate' && <Field label={t("Lý do xác nhận")} required><textarea required minLength={5} value={reason} onChange={e => setReason(e.target.value)} placeholder={t("Ví dụ: Đã gọi xác minh, đây là số điện thoại dùng chung…")}/></Field>}
    <p className="helper"><ShieldCheck size={15}/>{t("Liên kết sẽ thêm tài liệu và lượt ứng tuyển; giữ nguyên thông tin cùng CV đã có.")}</p>
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
  return <Modal title={uploadFirst ? t("Tiếp nhận CV mới") : t("Thêm ứng viên")} subtitle={t("Nhập thông tin ứng viên và đính kèm CV nếu có.")} onClose={() => !busy && onClose()} wide>
    <form onSubmit={submit} onChange={() => { requestKey.current = key(); if (matches.length) { setMatches([]); setResolution(''); } }}>
      <div className="modal-body">
        <div className="info-note"><Info size={18}/><span>{t("Hồ sơ chưa đủ thông tin vẫn được lưu và đánh dấu ")}<strong>{t("Cần bổ sung")}</strong>.</span></div>
        {uploadFirst && <FileInput file={file} onChange={value => { setFile(value); requestKey.current = key(); }}/>}
        <h3 className="form-section-title"><UserPlus size={17}/>{t("Thông tin ứng viên ")}<span>{t("Không bắt buộc đầy đủ ngay")}</span></h3>
        <div className="form-grid">
          <Field label={t("Họ và tên")}><input name="fullName" placeholder={t("Nguyễn Văn A")} maxLength={120}/></Field>
          <Field label={t("Số điện thoại")}><input name="phone" type="tel" placeholder={t("09xx xxx xxx")} maxLength={30}/></Field>
          <Field label={t("Email")}><input name="email" type="email" placeholder={t("ungvien@email.com")} maxLength={254}/></Field>
          <Field label={t("Khu vực sinh sống")}><input name="location" placeholder={t("TP. Hồ Chí Minh")} maxLength={200}/></Field>
          <Field label={t("Vị trí ứng tuyển")}><select name="jobId"><option value="">{t("Chọn sau")}</option>{jobs.filter(j => j.status === 'open' && !jobExpired(j)).map(j => <option key={j.id} value={j.id}>{t(j.title)}</option>)}</select></Field>
          <Field label={t("Nguồn hồ sơ")} required><select name="source" defaultValue={uploadFirst ? 'Email' : 'Facebook'}>{SOURCES.filter(s => s !== 'Website').map(s => <option key={s} value={s}>{t(s)}</option>)}</select></Field>
          <Field label={t("Ngày nhận hồ sơ")} hint={t("Ngày công ty thực tế nhận CV")} required><input type="date" name="receivedAt" defaultValue={new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())} required/></Field>
          <Field label={t("Người phụ trách")}><select name="ownerId" defaultValue={user.id}>{users.filter(u => ['hr','admin'].includes(u.role)).map(u => <option key={u.id} value={u.id}>{t(u.name)}</option>)}<option value="">{t("Chưa phân công")}</option></select></Field>
        </div>
        {!uploadFirst && <><h3 className="form-section-title"><FilePlus2 size={17}/>{t("CV & tài liệu")}</h3><FileInput file={file} onChange={value => { setFile(value); requestKey.current = key(); }}/></>}
        <div className="form-grid">
          <Field label={t("Portfolio")} className="full"><input name="portfolio" type="url" placeholder={t("https://behance.net/…")} maxLength={1000}/></Field>
          <Field label={t("Ghi chú nội bộ")} className="full"><textarea name="notes" placeholder={t("Thông tin đã trao đổi, kinh nghiệm nổi bật hoặc việc cần theo dõi…")} maxLength={5000}/></Field>
          <Field label={t("Đồng ý xử lý dữ liệu")} className="full"><select name="consentStatus" value={consent} onChange={e => setConsent(e.target.value)}><option value="pending">{t("Chưa xác nhận — cần bổ sung")}</option><option value="granted">{t("Đã được ứng viên đồng ý")}</option></select></Field>
          {consent === 'granted' && <Field label={t("Căn cứ xác nhận sự đồng ý")} className="full" required><input name="consentEvidence" placeholder={t("Ví dụ: Ứng viên xác nhận qua email ngày…")} required maxLength={1000}/></Field>}
        </div>
        {matches.length > 0 && <div onChange={e => e.stopPropagation()}><DuplicateChoice matches={matches} target={target} setTarget={setTarget} resolution={resolution} setResolution={setResolution} reason={reason} setReason={setReason}/></div>}
        {error && <Alert>{t(error)}</Alert>}
      </div>
      <footer className="modal-foot"><span><ShieldCheck size={15}/>{t("Thông tin được lưu trong hệ thống nội bộ")}</span><div><button type="button" className="button secondary" onClick={onClose} disabled={busy}>{t("Hủy")}</button><button className="button primary" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin"/> : <Plus size={17}/>} {resolution === 'link' && matches.length ? t("Xác nhận & liên kết") : t("Lưu hồ sơ")}</button></div></footer>
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
  return <Modal title={t("Xác minh hồ sơ trùng")} subtitle={t("Hồ sơ gửi từ website được giữ riêng đến khi HR xác nhận.")} onClose={() => !busy && onClose()}>
    <form onSubmit={submit}><div className="modal-body"><div className="received-summary"><span className="eyebrow">{t("HỒ SƠ VỪA NHẬN · ")}{date(submission.created_at)}</span><h3>{submission.payload.fullName}</h3><p>{submission.payload.email} · {submission.payload.phone}</p>{submission.documents.map(d => <p key={d.original_name}><FilePlus2 size={15}/> {d.original_name}</p>)}</div>
      <DuplicateChoice matches={submission.matches} target={target} setTarget={setTarget} resolution={resolution} setResolution={setResolution} reason={reason} setReason={setReason}/>
      {resolution === 'link' && <Field label={t("Ghi nhận kết quả xác minh")} required><textarea required minLength={5} value={reason} onChange={e => setReason(e.target.value)} placeholder={t("HR đã kiểm tra thông tin và xác nhận…")}/></Field>}{error && <Alert>{t(error)}</Alert>}
    </div><footer className="modal-foot"><span>{t("CV cũ luôn được giữ nguyên")}</span><button className="button primary" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin"/> : <GitMerge size={17}/>}{t("Xác nhận xử lý")}</button></footer></form>
  </Modal>;
}

export function UpdateLinkForm({ candidate, onClose, onCreated }: { candidate: Candidate; onClose: () => void; onCreated: () => void }) {
  const [hours, setHours] = useState('72'), [link, setLink] = useState(''), [expires, setExpires] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false);
  async function create(event: FormEvent) { event.preventDefault(); setBusy(true); try { const result = await api<{ path: string; expiresAt: string }>(`/candidates/${candidate.id}/update-links`, { method: 'POST', body: json({ hours: Number(hours) }) }); setLink(new URL(result.path, window.location.origin).toString()); setExpires(result.expiresAt); onCreated(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); } }
  return <Modal title={t("Mời ứng viên bổ sung hồ sơ")} subtitle={t("Không cần tài khoản. Thông tin được gắn đúng hồ sơ hiện có.")} onClose={onClose}>
    <form onSubmit={create}><div className="modal-body"><div className="profile-mini"><Avatar name={candidate.full_name}/><div><strong>{candidate.full_name || t("Chưa có tên")}</strong><p>{candidate.email || candidate.phone || t("Chưa có thông tin liên hệ")}</p></div></div>
      {!link ? <><Field label={t("Liên kết có hiệu lực")}><select value={hours} onChange={e => setHours(e.target.value)}><option value="24">{t("24 giờ")}</option><option value="72">{t("3 ngày")}</option><option value="168">{t("7 ngày")}</option></select></Field><div className="info-note"><ShieldCheck size={19}/><span>{t("Liên kết chỉ dùng một lần. Bạn có thể thu hồi bất kỳ lúc nào trong hồ sơ ứng viên. Hãy gửi riêng cho đúng người.")}</span></div></> : <><Alert success>{t("Đã tạo liên kết. Có hiệu lực đến ")}{date(expires, true)}.</Alert><Field label={t("Liên kết dành riêng cho ứng viên")}><input value={link} readOnly onFocus={e => e.target.select()}/></Field><button type="button" className="button primary full-width" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setError('Trình duyệt chưa cho phép sao chép. Hãy chọn và sao chép liên kết ở ô bên trên.'); } }}>{copied ? <Check size={17}/> : <Copy size={17}/>} {copied ? t("Đã sao chép liên kết") : t("Sao chép liên kết")}</button><p className="helper">{t("Liên kết chỉ hiển thị khi vừa tạo. Hệ thống chỉ lưu mã băm của liên kết.")}</p></>}{error && <Alert>{t(error)}</Alert>}
    </div><footer className="modal-foot"><span><Link2 size={15}/>{t("Thêm tài liệu, giữ nguyên CV cũ")}</span>{!link && <button className="button primary" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin"/> : <Link2 size={17}/>}{t("Tạo liên kết")}</button>}{link && <button type="button" className="button secondary" onClick={onClose}>{t("Hoàn tất")}</button>}</footer></form>
  </Modal>;
}

export { JobForm } from './job-editor';

export function InterviewForm({ candidates, users, initialId, request, existing, onClose, onSaved }: { candidates: Candidate[]; users: User[]; initialId?: string; request?: InterviewRequest; existing?: Interview; onClose: () => void; onSaved: () => void }) {
  const initialCandidate = existing?.candidate_id || request?.candidate_id || initialId || '';
  const [candidateId, setCandidateId] = useState(initialCandidate);
  const [applicationId, setApplicationId] = useState(existing?.application_id || request?.application_id || candidates.find(c => c.id === initialCandidate)?.applications.find(a => !['hired','offered','rejected'].includes(a.stage))?.id || '');
  const [day, setDay] = useState(existing ? dayKey(existing.starts_at) : dayKey());
  const [startTime, setStartTime] = useState(existing ? time(existing.starts_at) : '09:00');
  const [minutes, setMinutes] = useState(existing ? duration(existing) : 45);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const selected = candidates.find(c => c.id === candidateId);
  const end = day && startTime ? new Date(+new Date(`${day}T${startTime}:00+07:00`) + minutes * 60000) : null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; const data = Object.fromEntries(new FormData(event.currentTarget)); setBusy(true); setError('');
    try { await api(existing ? `/interviews/${existing.id}` : '/interviews', { method: existing ? 'PATCH' : 'POST', body: json({ ...data, contactConfirmed: data.contactConfirmed === 'true', applicationId, requestId: request?.id || existing?.request_id || '', startsAt: new Date(`${day}T${startTime}:00+07:00`).toISOString(), durationMinutes: minutes }) }); onSaved(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return <Modal title={existing ? t("Đổi lịch phỏng vấn") : t("Đặt lịch phỏng vấn")} subtitle={t("Chọn ngày, giờ, thời lượng và người tham gia phỏng vấn.")} onClose={() => !busy && onClose()}><form onSubmit={submit}><div className="modal-body form-grid">
    {request && <div className="info-note full"><ShieldCheck size={18}/><span>{t("Yêu cầu từ ")}{request.requested_by_name}{t(" · CV phiên bản ")}{request.document_version}. {request.notes}</span></div>}
    <Field label={t("Ứng viên")} className="full" required><select value={candidateId} disabled={!!request || !!existing} onChange={e => { setCandidateId(e.target.value); setApplicationId(candidates.find(c => c.id === e.target.value)?.applications.find(a => !['hired','offered','rejected'].includes(a.stage))?.id || ''); }} required><option value="">{t("Chọn ứng viên")}</option>{candidates.map(c => <option value={c.id} key={c.id}>{c.full_name || t("Chưa có tên")}</option>)}</select></Field>
    <Field label={t("Lượt ứng tuyển")} className="full" required><select value={applicationId} onChange={e => setApplicationId(e.target.value)} disabled={!!request || !!existing} required><option value="">{t("Chọn vị trí")}</option>{selected?.applications.filter(a => !['hired','offered','rejected'].includes(a.stage)).map(a => <option key={a.id} value={a.id}>{t(a.job_title)}</option>)}</select></Field>
    <Field label={t("Ngày phỏng vấn")} required><input type="date" value={day} min={dayKey()} onChange={e => setDay(e.target.value)} required/></Field>
    <Field label={t("Giờ bắt đầu (UTC+7)")} required><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required/></Field>
    <Field label={t("Thời lượng phỏng vấn")} required><select value={minutes} onChange={e => setMinutes(Number(e.target.value))}>{[15,30,45,60,90,120,150,180,240].map(n => <option key={n} value={n}>{t(n)}{t(" phút")}</option>)}</select></Field>
    <div className="end-time-preview"><Clock3 size={19}/><span>{t("Giờ kết thúc dự kiến")}<strong>{end && !Number.isNaN(+end) ? time(end.toISOString()) : '—'}</strong></span></div>
    <Field label={t("Người phỏng vấn")} required><select name="interviewerId" defaultValue={existing?.interviewer_id || request?.preferred_interviewer_id || request?.requested_by || ''} required><option value="">{t("Chọn người phỏng vấn")}</option>{['interviewer','boss','admin','hr'].map(role => <optgroup key={role} label={role === 'interviewer' ? t("Người phỏng vấn") : role === 'hr' ? t("Nhân sự") : t("Quản lý")}>{users.filter(member => member.role === role && member.active !== false).map(member => <option key={member.id} value={member.id}>{t(member.name)}</option>)}</optgroup>)}</select></Field>
    <Field label={t("Hình thức")}><select name="mode" defaultValue={existing?.mode || 'Online'}><option value="Online">{t("Online")}</option><option value="Trực tiếp">{t("Trực tiếp")}</option><option value="Điện thoại">{t("Điện thoại")}</option></select></Field>
    <Field label={t("Địa điểm / Liên kết họp")} className="full" required><input name="location" required minLength={2} maxLength={1000} defaultValue={existing?.location} placeholder={t("Phòng họp hoặc liên kết Google Meet…")}/></Field>
    {selected?.consent_status === 'pending' && <section className="contact-confirmation full" key={candidateId}><h3>{t("Ghi nhận trao đổi với ứng viên")}</h3><Field label={t("Nội dung đã trao đổi")} required><textarea name="contactEvidence" required minLength={10} maxLength={1000} defaultValue={existing?.contact_evidence || ''} placeholder={t("Ngày, kênh liên hệ và lịch đã thống nhất với ứng viên…")}/></Field><label className="checkbox-line"><input type="checkbox" name="contactConfirmed" value="true" required defaultChecked={!!existing?.contact_evidence}/><span>{t("Đã liên hệ ứng viên và thống nhất việc hẹn phỏng vấn.")}</span></label><p className="helper">{t("Ghi nhận này chỉ lưu việc trao đổi lịch, không thay đổi trạng thái đồng ý xử lý dữ liệu.")}</p></section>}
    {selected?.consent_status === 'withdrawn' && <div className="full"><Alert>{t("Ứng viên đã rút lại sự đồng ý xử lý dữ liệu. Cần ghi nhận sự đồng ý mới trước khi tiếp tục.")}</Alert></div>}
    {existing && <Field label={t("Lý do đổi lịch")} className="full" required><textarea name="reason" minLength={5} maxLength={1000} required placeholder={t("Ứng viên đề nghị đổi giờ, điều chỉnh người phỏng vấn…")}/></Field>}
    <div className="info-note full"><Info size={18}/><span>{t("Giờ kết thúc được tính theo thời lượng. Lịch trùng của ứng viên hoặc người phỏng vấn sẽ được báo để chọn giờ khác.")}</span></div>{error && <div className="full"><Alert>{t(error)}</Alert></div>}
  </div><footer className="modal-foot"><span>{t("Giờ Việt Nam · UTC+7")}</span><button className="button primary" disabled={busy || selected?.consent_status === 'withdrawn'}>{busy ? <LoaderCircle size={17} className="spin"/> : <ArrowRight size={17}/>}{t("Lưu lịch phỏng vấn")}</button></footer></form></Modal>;
}
