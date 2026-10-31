import { t } from './locale';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Baby, BriefcaseBusiness, CarFront, Check, Clock3, Copy, ExternalLink, Headphones, MapPin, Pencil, Plus, Search } from 'lucide-react';
import { api, date, dayKey, errorMessage, json } from './api';
import { Alert, Empty, Field, Modal } from './ui';
import type { Job } from './types';
import { JobTranslationModal } from './translation';

export const JOB_BRANDS = [
  { id: 'safestraps', name: 'Safestraps', category: 'Phụ kiện xe', Icon: CarFront, storeUrl: 'https://shopee.vn/safestraps?entryPoint=ShopBySearch&searchKeyword=safestraps' },
  { id: 'jielien', name: 'JieLien', category: 'Loa & thiết bị âm thanh', Icon: Headphones, storeUrl: 'https://vn.shp.ee/2ZrUpPRj' },
  { id: 'baby-tatto', name: 'Baby tatto', category: 'Mẹ và Bé', Icon: Baby, storeUrl: 'https://shopee.vn/babytattoo?categoryId=100632&entryPoint=ShopByPDP&itemId=20716712617' },
] as const;
export const EMPLOYMENT_TYPES = ['Toàn thời gian','Bán thời gian','Thực tập','Cộng tác viên','Hợp đồng'];
export const jobPath = (id: string) => `/tuyen-dung/${encodeURIComponent(id)}`;
export const brandName = (id?: string) => JOB_BRANDS.find(brand => brand.id === id)?.name || 'Super Net';
export const jobExpired = (job: Job) => !!job.application_deadline && job.application_deadline < dayKey();

function JDText({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const bullet = /^(?:[-•●▪]|\d+[.)])\s+/u;
  return lines.length && lines.every(line => bullet.test(line)) ? <ul className="jd-bullets">{lines.map((line,index) => <li key={index}>{line.replace(bullet,'')}</li>)}</ul> : <p>{text}</p>;
}

export function JDContent({ job }: { job: Job }) {
  return <div className="jd-content"><section><h2>{t("Thông tin chung")}</h2><dl className="jd-general-info">
    {job.company_name && <div className="full"><dt>{t("Công ty")}</dt><dd>{job.company_name}</dd></div>}
    <div><dt>{t("Số lượng")}</dt><dd>{job.openings}{t(" người")}</dd></div><div><dt>{t("Hình thức")}</dt><dd>{job.employment_type}</dd></div>
    <div className="full"><dt>{t("Địa điểm làm việc")}</dt><dd>{job.location || t("Chưa nhập địa điểm")}</dd></div>
    {job.working_hours && <div className="full"><dt>{t("Thời gian làm việc")}</dt><dd>{job.working_hours}</dd></div>}
  </dl></section>{[
    ['Mô tả công việc', job.description], ['Yêu cầu ứng viên', job.requirements],
  ].filter(([,text]) => text?.trim()).map(([heading,text]) => <section key={heading}><h2>{t(heading)}</h2><JDText text={text!}/></section>)}
    {(job.salary_range || job.benefits) && <section><h2>{t("Mức lương & quyền lợi")}</h2>{job.salary_range && <p className="jd-salary-emphasis"><strong>{t("Mức lương:")}</strong> {job.salary_range}</p>}{job.benefits && <JDText text={job.benefits}/>}</section>}
    <section className="jd-application-details"><h2>{t("Cách thức ứng tuyển")}</h2>{job.application_instructions && <JDText text={job.application_instructions}/>}
      {(job.application_email || job.application_zalo || job.application_email_subject) && <dl className="jd-application-contacts">
        {job.application_email_subject && <div><dt>{t("Tiêu đề email")}</dt><dd>{job.application_email_subject}</dd></div>}
        {job.application_email && <div><dt>{t("Email nhận CV")}</dt><dd><a href={`mailto:${job.application_email}?subject=${encodeURIComponent(job.application_email_subject || '')}`}>{job.application_email}</a></dd></div>}
        {job.application_zalo && <div><dt>{t("Zalo")}</dt><dd><a href={`https://zalo.me/${job.application_zalo.replace(/\D/g,'')}`} target="_blank" rel="noreferrer">{job.application_zalo}</a></dd></div>}
      </dl>}
      <p>{t("Bạn có thể chọn “Ứng tuyển ngay” để gửi thông tin và CV trực tiếp trên website, không cần tạo tài khoản.")}</p>
    </section>
  </div>;
}

export function ShareJobLink({ job, onClose }: { job: Job; onClose: () => void }) {
  const [copied, setCopied] = useState(false), [error, setError] = useState('');
  const link = new URL(jobPath(job.id), window.location.origin).toString();
  return <Modal title={t("Chia sẻ JD tuyển dụng")} subtitle={job.title} onClose={onClose}><div className="modal-body"><Field label={t("Liên kết JD dành cho ứng viên")}><input value={link} readOnly onFocus={event => event.target.select()}/></Field><button className="button primary" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setError(''); } catch { setError('Trình duyệt chưa cho phép sao chép. Chọn nội dung trong ô bên trên rồi nhấn Ctrl+C.'); } }}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? t("Đã sao chép") : t("Sao chép liên kết")}</button>{error && <Alert>{t(error)}</Alert>}<p className="helper">{t("Ứng viên không cần tài khoản để xem JD. Khi chia sẻ ra ngoài công ty, dùng địa chỉ website mà ứng viên có thể truy cập.")}</p><Link to={jobPath(job.id)} target="_blank" className="text-button">{t("Mở trang JD")}<ExternalLink size={15}/></Link></div></Modal>;
}

export function JobsManager({ jobs, editable, onAdd, onEdit, onRefresh, notify }: { jobs: Job[]; editable: boolean; onAdd: () => void; onEdit: (job: Job) => void; onRefresh: () => void; notify: (message: string) => void }) {
  const [search, setSearch] = useState(''), [status, setStatus] = useState('all'), [share, setShare] = useState<Job | null>(null), [busy, setBusy] = useState<string | null>(null);
  const [translationJob,setTranslationJob] = useState<Job | null>(null);
  const filtered = jobs.filter(job => `${job.title} ${job.department} ${brandName(job.business_line)}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')) && (status === 'all' || (status === 'expired' ? jobExpired(job) : job.status === status && !jobExpired(job))));
  async function toggle(job: Job) {
    setBusy(job.id);
    try { await api(`/jobs/${job.id}`, { method: 'PATCH', body: json({ status: job.status === 'open' ? 'closed' : 'open', expectedRevision: job.revision }) }); onRefresh(); notify(job.status === 'open' ? 'Đã tạm dừng tin tuyển dụng.' : 'Đã mở tin tuyển dụng.'); }
    catch (error) { notify(errorMessage(error)); onRefresh(); } finally { setBusy(null); }
  }
  return <>
    <div className="page-heading"><div><h1>{t("Vị trí tuyển dụng & JD")}</h1><p>{t("Quản lý nội dung và trạng thái các tin tuyển dụng.")}</p></div>{editable && <button className="button primary" onClick={onAdd}><Plus size={17}/>{t("Tạo JD tuyển dụng")}</button>}</div>
    <div className="jobs-toolbar"><label className="search-input"><Search size={18}/><input aria-label={t("Tìm vị trí nội bộ")} value={search} onChange={event => setSearch(event.target.value)} placeholder={t("Tìm tên vị trí, bộ phận, ngành hàng…")}/></label><select aria-label={t("Lọc trạng thái JD")} value={status} onChange={event => setStatus(event.target.value)}><option value="all">{t("Tất cả trạng thái")}</option><option value="open">{t("Đang tuyển")}</option><option value="closed">{t("Tạm dừng")}</option><option value="expired">{t("Hết hạn")}</option></select><Link to="/tuyen-dung" className="text-button" target="_blank">{t("Trang tuyển dụng công khai")}<ExternalLink size={16}/></Link></div>
    <div className="jobs-grid">{filtered.map((job,index) => {
      const visible = job.status === 'open' && !jobExpired(job);
      return <article className="panel job-card" key={job.id}><div className="job-card-top"><span className={`job-symbol job-symbol-${index % 4}`}><BriefcaseBusiness size={23}/></span><span className={`stage ${jobExpired(job) ? 'amber' : visible ? 'green' : 'gray'}`}><span/>{jobExpired(job) ? t("Hết hạn") : visible ? t("Đang tuyển") : t("Tạm dừng")}</span></div>
        <span className="eyebrow">{job.department} · {brandName(job.business_line)}</span><h2>{job.title}</h2><p className="job-location"><MapPin size={13}/>{job.location} · {job.employment_type}</p><p className="job-description">{job.description}</p>
        <div className="job-card-stats"><span><BriefcaseBusiness size={16}/><b>{job.application_count || 0}</b>{t(" lượt ứng tuyển")}</span><span>{t("Cần tuyển ")}<b>{job.openings}</b></span></div>{job.application_deadline && <p className="jd-deadline"><Clock3 size={13}/>{t("Hạn nhận hồ sơ: ")}{date(`${job.application_deadline}T00:00:00+07:00`)}</p>}
        <footer className="jd-card-actions">{visible ? <><Link className="text-button" to={jobPath(job.id)} target="_blank">{t("Xem JD")}<ArrowUpRight size={16}/></Link><button className="icon-button" aria-label={t("Chia sẻ JD {p0}",{p0:job.title})} title={t("Chia sẻ liên kết JD")} onClick={() => setShare(job)}><Copy size={16}/></button></> : <span className="muted">{t("Tin đang ẩn khỏi trang công khai")}</span>}{editable && <button className="button secondary small-button" onClick={() => onEdit(job)}><Pencil size={14}/>{t("Chỉnh sửa JD")}</button>}{editable && <button className="text-button" onClick={() => setTranslationJob(job)}>{t("Dịch JD 中文")}</button>}</footer>
        {editable && <div className="jd-card-status"><span>{t("Ứng viên xem được khi tin đang tuyển và còn hạn.")}</span><button className="text-button" disabled={busy === job.id} onClick={() => void toggle(job)}>{busy === job.id ? t("Đang lưu…") : job.status === 'open' ? t("Tạm dừng") : t("Mở lại")}</button></div>}
      </article>;
    })}</div>
    {!filtered.length && <Empty title={!jobs.length ? t("Tạo JD đầu tiên cho Super Net") : t("Chưa tìm thấy JD phù hợp")}>{!jobs.length ? t("Các vị trí được đăng tuyển sẽ xuất hiện tại đây.") : t("Thử đổi từ khóa hoặc trạng thái đang lọc.")}</Empty>}
    {share && <ShareJobLink job={share} onClose={() => setShare(null)}/>}
    {translationJob && <JobTranslationModal job={translationJob} onClose={() => setTranslationJob(null)}/>}
  </>;
}
