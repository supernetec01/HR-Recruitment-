import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Baby, BriefcaseBusiness, CarFront, Check, Clock3, Copy, ExternalLink, Headphones, MapPin, Pencil, Plus, Search } from 'lucide-react';
import { api, date, dayKey, errorMessage, json } from './api';
import { Alert, Empty, Field, Modal } from './ui';
import type { Job } from './types';

export const JOB_BRANDS = [
  { id: 'safestraps', name: 'Safestraps', category: 'Phụ kiện xe', Icon: CarFront },
  { id: 'jielien', name: 'JieLien', category: 'Thiết bị âm thanh', Icon: Headphones },
  { id: 'baby-tatto', name: 'Baby tatto', category: 'Mẹ và Bé', Icon: Baby },
] as const;
export const EMPLOYMENT_TYPES = ['Toàn thời gian','Bán thời gian','Thực tập','Cộng tác viên','Hợp đồng'];
export const jobPath = (id: string) => `/tuyen-dung/${encodeURIComponent(id)}`;
export const brandName = (id?: string) => JOB_BRANDS.find(brand => brand.id === id)?.name || 'Super Net';
export const jobExpired = (job: Job) => !!job.application_deadline && job.application_deadline < dayKey();

export function JDContent({ job }: { job: Job }) {
  return <div className="jd-content">{[
    ['Mô tả công việc', job.description], ['Yêu cầu ứng viên', job.requirements], ['Quyền lợi', job.benefits],
  ].filter(([,text]) => text?.trim()).map(([heading,text]) => <section key={heading}><h2>{heading}</h2><p>{text}</p></section>)}</div>;
}

export function ShareJobLink({ job, onClose }: { job: Job; onClose: () => void }) {
  const [copied, setCopied] = useState(false), [error, setError] = useState('');
  const link = new URL(jobPath(job.id), window.location.origin).toString();
  return <Modal title="Chia sẻ JD tuyển dụng" subtitle={job.title} onClose={onClose}><div className="modal-body"><Field label="Liên kết JD dành cho ứng viên"><input value={link} readOnly onFocus={event => event.target.select()}/></Field><button className="button primary" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setError(''); } catch { setError('Trình duyệt chưa cho phép sao chép. Chọn nội dung trong ô bên trên rồi nhấn Ctrl+C.'); } }}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? 'Đã sao chép' : 'Sao chép liên kết'}</button>{error && <Alert>{error}</Alert>}<p className="helper">Ứng viên không cần tài khoản để xem JD. Khi chia sẻ ra ngoài công ty, dùng địa chỉ website mà ứng viên có thể truy cập.</p><Link to={jobPath(job.id)} target="_blank" className="text-button">Mở trang JD<ExternalLink size={15}/></Link></div></Modal>;
}

export function JobsManager({ jobs, editable, onAdd, onEdit, onRefresh, notify }: { jobs: Job[]; editable: boolean; onAdd: () => void; onEdit: (job: Job) => void; onRefresh: () => void; notify: (message: string) => void }) {
  const [search, setSearch] = useState(''), [status, setStatus] = useState('all'), [share, setShare] = useState<Job | null>(null), [busy, setBusy] = useState<string | null>(null);
  const filtered = jobs.filter(job => `${job.title} ${job.department} ${brandName(job.business_line)}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')) && (status === 'all' || (status === 'expired' ? jobExpired(job) : job.status === status && !jobExpired(job))));
  async function toggle(job: Job) {
    setBusy(job.id);
    try { await api(`/jobs/${job.id}`, { method: 'PATCH', body: json({ status: job.status === 'open' ? 'closed' : 'open', expectedRevision: job.revision }) }); onRefresh(); notify(job.status === 'open' ? 'Đã tạm dừng tin tuyển dụng.' : 'Đã mở tin tuyển dụng.'); }
    catch (error) { notify(errorMessage(error)); onRefresh(); } finally { setBusy(null); }
  }
  return <>
    <div className="page-heading"><div><span className="eyebrow page-eyebrow">QUẢN LÝ VỊ TRÍ & NỘI DUNG TUYỂN DỤNG</span><h1>Vị trí tuyển dụng & JD</h1><p>Tạo JD, chỉnh sửa nội dung và chia sẻ vị trí đang tuyển với ứng viên.</p></div>{editable && <button className="button primary" onClick={onAdd}><Plus size={17}/>Tạo JD tuyển dụng</button>}</div>
    <div className="jobs-toolbar"><label className="search-input"><Search size={18}/><input aria-label="Tìm vị trí nội bộ" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm tên vị trí, bộ phận, ngành hàng…"/></label><select aria-label="Lọc trạng thái JD" value={status} onChange={event => setStatus(event.target.value)}><option value="all">Tất cả trạng thái</option><option value="open">Đang tuyển</option><option value="closed">Tạm dừng</option><option value="expired">Hết hạn</option></select><Link to="/tuyen-dung" className="text-button" target="_blank">Trang tuyển dụng công khai<ExternalLink size={16}/></Link></div>
    <div className="jobs-grid">{filtered.map((job,index) => {
      const visible = job.status === 'open' && !jobExpired(job);
      return <article className="panel job-card" key={job.id}><div className="job-card-top"><span className={`job-symbol job-symbol-${index % 4}`}><BriefcaseBusiness size={23}/></span><span className={`stage ${jobExpired(job) ? 'amber' : visible ? 'green' : 'gray'}`}><span/>{jobExpired(job) ? 'Hết hạn' : visible ? 'Đang tuyển' : 'Tạm dừng'}</span></div>
        <span className="eyebrow">{job.department} · {brandName(job.business_line)}</span><h2>{job.title}</h2><p className="job-location"><MapPin size={13}/>{job.location} · {job.employment_type}</p><p className="job-description">{job.description}</p>
        <div className="job-card-stats"><span><BriefcaseBusiness size={16}/><b>{job.application_count || 0}</b> lượt ứng tuyển</span><span>Cần tuyển <b>{job.openings}</b></span></div>{job.application_deadline && <p className="jd-deadline"><Clock3 size={13}/>Hạn nhận hồ sơ: {date(`${job.application_deadline}T00:00:00+07:00`)}</p>}
        <footer className="jd-card-actions">{visible ? <><Link className="text-button" to={jobPath(job.id)} target="_blank">Xem JD<ArrowUpRight size={16}/></Link><button className="icon-button" aria-label={`Chia sẻ JD ${job.title}`} title="Chia sẻ liên kết JD" onClick={() => setShare(job)}><Copy size={16}/></button></> : <span className="muted">Tin đang ẩn khỏi trang công khai</span>}{editable && <button className="button secondary small-button" onClick={() => onEdit(job)}><Pencil size={14}/>Chỉnh sửa JD</button>}</footer>
        {editable && <div className="jd-card-status"><span>Ứng viên xem được khi tin đang tuyển và còn hạn.</span><button className="text-button" disabled={busy === job.id} onClick={() => void toggle(job)}>{busy === job.id ? 'Đang lưu…' : job.status === 'open' ? 'Tạm dừng' : 'Mở lại'}</button></div>}
      </article>;
    })}</div>
    {!filtered.length && <Empty title={!jobs.length ? 'Tạo JD đầu tiên cho Super Net' : 'Chưa tìm thấy JD phù hợp'}>{!jobs.length ? 'Admin và HR có thể tạo JD để ứng viên xem công việc và gửi hồ sơ.' : 'Thử đổi từ khóa hoặc trạng thái đang lọc.'}</Empty>}
    {share && <ShareJobLink job={share} onClose={() => setShare(null)}/>}
  </>;
}
