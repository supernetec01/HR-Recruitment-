import { t, LanguageSwitcher, useLanguage } from './locale';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle2, Clock3, MapPin, Search, ShieldCheck, UsersRound, Wallet } from 'lucide-react';
import { api, date, errorMessage, key } from './api';
import { Alert, Empty, Field, FileInput, Spinner } from './ui';
import type { Job } from './types';
import { JOB_BRANDS, brandName, jobPath } from './jobs';
export function Brand({ light = false }: {
    light?: boolean;
}) {
    return <div className={`brand ${light ? 'brand-light' : ''}`}><img className="brand-symbol" src="/supernet-symbol.svg" alt=""/><div><strong>{t("SuperNet")}<span className="brand-dot">{t(".")}</span></strong><small>{t("Tuy\u1EC3n d\u1EE5ng")}</small></div></div>;
}
export function PublicHeader() {
    return <header className="public-header"><Link to="/tuyen-dung"><Brand /></Link><nav aria-label={t("\u0110i\u1EC1u h\u01B0\u1EDBng tuy\u1EC3n d\u1EE5ng")}><LanguageSwitcher /><Link to="/tuyen-dung">{t("V\u1ECB tr\u00ED \u0111ang tuy\u1EC3n")}</Link><Link className="button secondary small-button" to="/" aria-label={t("\u0110\u0103ng nh\u1EADp n\u1ED9i b\u1ED9")}>{t("N\u1ED9i b\u1ED9")}<ArrowUpRight size={15}/></Link></nav></header>;
}
export function PrivacyNotice() { return <details className="privacy-notice"><summary><ShieldCheck size={16}/>{t("Thông báo xử lý dữ liệu tuyển dụng")}</summary><p>{t("Super Net tiếp nhận thông tin liên hệ, CV và portfolio để xem xét vị trí ứng tuyển, liên hệ, tổ chức phỏng vấn và lưu lịch sử xử lý trong quy trình tuyển dụng. Chỉ nhân sự được phân quyền mới được truy cập hồ sơ.")}</p><p>{t("Hệ thống không tự động ra quyết định tuyển dụng. Tài liệu mới được cách ly để kiểm tra. Thông tin không được dùng để gửi quảng cáo. Bạn có thể liên hệ HR đã trao đổi với bạn để yêu cầu xem, sửa, rút lại sự đồng ý hoặc xóa dữ liệu.")}</p><p>{t("Vui lòng liên hệ HR phụ trách để được thông báo thời hạn lưu hồ sơ hoặc gửi yêu cầu chỉnh sửa, rút lại sự đồng ý và xóa dữ liệu. Hệ thống chưa tự động thực hiện việc xóa hồ sơ theo thời hạn; các yêu cầu này cần HR tiếp nhận và xử lý. Nếu nhân sự sử dụng chức năng dịch, nội dung CV có thể được gửi tới dịch vụ OpenAI do Super Net cấu hình để tạo bản dịch phục vụ tuyển dụng. Phiên bản thông báo: recruitment-v2.")}</p></details>; }
export function Careers() {
    const language = useLanguage();
    const [jobs, setJobs] = useState<Job[]>([]), [loaded, setLoaded] = useState(false), [error, setError] = useState(''), [search, setSearch] = useState(''), [brand, setBrand] = useState('');
    async function loadJobs() {
        setLoaded(false);
        setError('');
        try {
            setJobs(await api<Job[]>(`/public/jobs?language=${language}`));
        }
        catch (error) {
            setError(errorMessage(error));
        }
        finally {
            setLoaded(true);
        }
    }
    useEffect(() => { void loadJobs(); }, [language]);
    const normalize = (value: string) => value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
    const filtered = jobs.filter(job => (!brand || job.business_line === brand) && normalize(`${job.title} ${job.department} ${brandName(job.business_line)}`).includes(normalize(search)));
    return <div className="public-page simple-careers"><PublicHeader /><main className="careers-main">
    <header className="careers-heading"><div><h1>{t("Tuy\u1EC3n d\u1EE5ng t\u1EA1i Super Net")}</h1><p>{t("Th\u00F4ng tin c\u00F4ng vi\u1EC7c v\u00E0 c\u00E1c v\u1ECB tr\u00ED \u0111ang tuy\u1EC3n.")}</p></div>{loaded && !error && <span className="careers-total"><strong>{jobs.length}</strong>{t(" v\u1ECB tr\u00ED \u0111ang tuy\u1EC3n")}</span>}</header>
    <section id="opportunities" className="opportunities" aria-label={t("Danh s\u00E1ch v\u1ECB tr\u00ED tuy\u1EC3n d\u1EE5ng")}>
      <div className="career-filters"><label className="search-input"><Search size={19}/><input aria-label={t("T\u00ECm v\u1ECB tr\u00ED tuy\u1EC3n d\u1EE5ng")} placeholder={t("T\u00ECm v\u1ECB tr\u00ED ho\u1EB7c b\u1ED9 ph\u1EADn")} value={search} onChange={event => setSearch(event.target.value)}/></label><select aria-label={t("L\u1ECDc ng\u00E0nh h\u00E0ng tuy\u1EC3n d\u1EE5ng")} value={brand} onChange={event => setBrand(event.target.value)}><option value="">{t("T\u1EA5t c\u1EA3 ng\u00E0nh h\u00E0ng")}</option>{JOB_BRANDS.map(item => <option value={item.id} key={item.id}>{item.name}{t(" \u00B7 ")}{t(item.category)}</option>)}</select></div>
      {loaded && !error && <div className="career-results"><span>{filtered.length}{t(" v\u1ECB tr\u00ED")}{brand ? ` · ${brandName(brand)}` : ''}</span>{(search || brand) && <button className="text-button" onClick={() => { setSearch(''); setBrand(''); }}>{t("X\u00F3a b\u1ED9 l\u1ECDc")}</button>}</div>}
      {!loaded ? <Spinner /> : error ? <div className="careers-error"><Alert>{t(error)}</Alert><button className="button secondary" onClick={() => void loadJobs()}>{t("Th\u1EED t\u1EA3i l\u1EA1i v\u1ECB tr\u00ED tuy\u1EC3n d\u1EE5ng")}</button></div> : filtered.length ? <div className="career-jobs">
        <div className="career-columns" aria-hidden="true"><span>{t("V\u1ECB tr\u00ED tuy\u1EC3n d\u1EE5ng")}</span><span>{t("\u0110\u1ECBa \u0111i\u1EC3m")}</span><span>{t("M\u1EE9c l\u01B0\u01A1ng")}</span><span /></div>
        {filtered.map(job => <Link className="career-job" to={jobPath(job.id)} key={job.id}>
          <div className="career-job-info"><h2>{job.title}</h2><p>{job.department}<span aria-hidden="true">{t("\u00B7")}</span>{brandName(job.business_line)}</p><span className="career-employment">{job.employment_type}</span></div>
          <div className="career-location"><MapPin size={16}/><span>{job.location}</span></div>
          <div className="career-salary"><Wallet size={16}/><span>{job.salary_range || t('Chưa cập nhật')}</span></div>
          <div className="career-job-end"><span>{job.openings}{t(" ng\u01B0\u1EDDi")}</span><strong>{t("Xem JD")}<ArrowRight size={17}/></strong></div>
        </Link>)}
      </div> : <Empty title={jobs.length ? t("Kh\u00F4ng t\u00ECm th\u1EA5y v\u1ECB tr\u00ED ph\u00F9 h\u1EE3p") : t("Ch\u01B0a c\u00F3 v\u1ECB tr\u00ED \u0111ang tuy\u1EC3n")}>{jobs.length ? t("Th\u1EED t\u1EEB kh\u00F3a ho\u1EB7c ng\u00E0nh h\u00E0ng kh\u00E1c.") : t("Danh s\u00E1ch s\u1EBD \u0111\u01B0\u1EE3c c\u1EADp nh\u1EADt khi c\u00F3 v\u1ECB tr\u00ED m\u1EDBi.")}</Empty>}
    </section>
    <nav className="careers-stores" aria-label={t("Gian h\u00E0ng Shopee")}><span>{t("Gian h\u00E0ng Shopee")}</span>{JOB_BRANDS.map(item => <a href={item.storeUrl} target="_blank" rel="noopener noreferrer" key={item.id}>{item.name}<ArrowUpRight size={14}/></a>)}</nav>
  </main><PublicFooter /></div>;
}
export function PublicFooter() {
    return <footer className="public-footer"><span>{t("\u00A9 ")}{new Date().getFullYear()}{t(" Super Net")}</span><span>{t("Tuy\u1EC3n d\u1EE5ng")}</span></footer>;
}
export function ApplicationPage() {
    const language = useLanguage();
    const { jobId } = useParams();
    const [job, setJob] = useState<Job | null>(null), [loaded, setLoaded] = useState(false), [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        setLoaded(false);
        setJob(null);
        setError('');
        api<Job>(`/public/jobs/${encodeURIComponent(jobId || '')}?language=${language}`).then(result => { if (active)
            setJob(result); }).catch(err => { if (active)
            setError(errorMessage(err)); }).finally(() => { if (active)
            setLoaded(true); });
        return () => { active = false; };
    }, [jobId, language]);
    return <div className="public-page"><PublicHeader /><main className="application-page"><Link className="back-link" to="/tuyen-dung"><ArrowLeft size={16}/>{t("T\u1EA5t c\u1EA3 v\u1ECB tr\u00ED tuy\u1EC3n d\u1EE5ng")}</Link>{!loaded ? <Spinner /> : !job ? <Alert>{error || 'Vị trí này đã ngừng tuyển hoặc không tồn tại.'}</Alert> : <div className="application-layout"><aside className="application-summary"><span className="application-department">{job.department}{t(" \u00B7 ")}{brandName(job.business_line)}</span><h1>{job.title}</h1><div className="job-facts"><span><MapPin size={16}/>{job.location}</span><span><Clock3 size={16}/>{job.employment_type}</span><span><UsersRound size={16}/>{job.openings}{t(" ng\u01B0\u1EDDi")}</span>{job.salary_range && <span><Wallet size={16}/>{job.salary_range}</span>}</div><Link className="text-button application-jd-link" to={jobPath(job.id)}>{t("Xem m\u00F4 t\u1EA3 c\u00F4ng vi\u1EC7c")}<ArrowUpRight size={15}/></Link></aside><PublicIntakeForm job={job}/></div>}</main><PublicFooter /></div>;
}
function PublicIntakeForm({ job }: {
    job: Job;
}) {
    const [file, setFile] = useState<File | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
    const requestKey = useRef(key());
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy)
            return;
        if (!file) {
            setError('Vui lòng đính kèm CV.');
            return;
        }
        const data = new FormData(event.currentTarget);
        data.delete('file');
        data.set('file', file);
        data.set('jobId', job.id);
        setBusy(true);
        setError('');
        try {
            await api('/public/applications', { method: 'POST', body: data, headers: { 'Idempotency-Key': requestKey.current } });
            setDone(true);
        }
        catch (err) {
            setError(errorMessage(err));
        }
        finally {
            setBusy(false);
        }
    }
    if (done)
        return <section className="public-form success-panel"><span className="success-ring"><Check size={28}/></span><h2>{t("\u0110\u00E3 nh\u1EADn h\u1ED3 s\u01A1")}</h2><p>{t("H\u1ED3 s\u01A1 \u1EE9ng tuy\u1EC3n v\u1ECB tr\u00ED ")}<strong>{job.title}</strong>{t(" \u0111\u00E3 \u0111\u01B0\u1EE3c g\u1EEDi \u0111\u1EBFn HR.")}</p><Link className="button primary" to="/tuyen-dung">{t("V\u1EC1 danh s\u00E1ch tuy\u1EC3n d\u1EE5ng")}<ArrowRight size={17}/></Link></section>;
    return <form className="public-form" onSubmit={submit} onChange={() => { requestKey.current = key(); }}><div className="public-form-heading"><h2>{t("\u1EE8ng tuy\u1EC3n ngay")}</h2><p>{t("\u0110i\u1EC1n th\u00F4ng tin li\u00EAn h\u1EC7 v\u00E0 \u0111\u00EDnh k\u00E8m CV.")}</p></div><Field label={t("H\u1ECD v\u00E0 t\u00EAn")} required><input name="fullName" required minLength={2} maxLength={120} autoComplete="name" placeholder={t("H\u1ECD v\u00E0 t\u00EAn c\u1EE7a b\u1EA1n")}/></Field><div className="form-grid"><Field label={t("Email")}><input type="email" name="email" maxLength={254} autoComplete="email" placeholder={t("ban@email.com")}/></Field><Field label={t("S\u1ED1 \u0111i\u1EC7n tho\u1EA1i")}><input type="tel" name="phone" maxLength={30} autoComplete="tel" placeholder={t("09xx xxx xxx")}/></Field></div><p className="helper">{t("C\u1EA7n \u00EDt nh\u1EA5t email ho\u1EB7c s\u1ED1 \u0111i\u1EC7n tho\u1EA1i \u0111\u1EC3 HR li\u00EAn h\u1EC7.")}</p><Field label={t("Portfolio (n\u1EBFu c\u00F3)")}><input type="url" name="portfolio" placeholder={t("https://\u2026")} maxLength={1000}/></Field><Field label={t("CV c\u1EE7a b\u1EA1n")} required><FileInput file={file} onChange={value => { setFile(value); requestKey.current = key(); }}/></Field><PrivacyNotice /><label className="checkbox-line consent-checkbox"><input type="checkbox" name="consent" value="true" required/><span>{t("T\u00F4i \u0111\u00E3 \u0111\u1ECDc th\u00F4ng b\u00E1o v\u00E0 \u0111\u1ED3ng \u00FD \u0111\u1EC3 Super Net x\u1EED l\u00FD d\u1EEF li\u1EC7u c\u00E1 nh\u00E2n cho m\u1EE5c \u0111\u00EDch tuy\u1EC3n d\u1EE5ng.")}</span></label>{error && <Alert>{t(error)}</Alert>}<button className="button primary full-width" disabled={busy}>{busy ? t("\u0110ang qu\u00E9t v\u00E0 g\u1EEDi h\u1ED3 s\u01A1\u2026") : t("G\u1EEDi h\u1ED3 s\u01A1 \u1EE9ng tuy\u1EC3n")}<ArrowRight size={18}/></button></form>;
}
export function SupplementPage() {
    const { token } = useParams();
    const [expires, setExpires] = useState(''), [loaded, setLoaded] = useState(false), [linkError, setLinkError] = useState(''), [error, setError] = useState('');
    const [file, setFile] = useState<File | null>(null), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
    const requestKey = useRef(key());
    useEffect(() => { api<{
        expiresAt: string;
    }>(`/public/update-links/${token}`).then(r => setExpires(r.expiresAt)).catch(err => setLinkError(errorMessage(err))).finally(() => setLoaded(true)); }, [token]);
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy)
            return;
        const data = new FormData(event.currentTarget);
        data.delete('file');
        if (file)
            data.set('file', file);
        setBusy(true);
        setError('');
        try {
            await api(`/public/update-links/${token}`, { method: 'POST', body: data, headers: { 'Idempotency-Key': requestKey.current } });
            setDone(true);
        }
        catch (err) {
            setError(errorMessage(err));
        }
        finally {
            setBusy(false);
        }
    }
    return <div className="public-page"><PublicHeader /><main className="supplement-page"><div className="supplement-intro"><h1>{t("B\u1ED5 sung h\u1ED3 s\u01A1")}</h1><p>{t("\u0110i\u1EC1n th\u00F4ng tin c\u00F2n thi\u1EBFu ho\u1EB7c t\u1EA3i CV m\u1EDBi.")}</p></div>{!loaded ? <Spinner /> : linkError ? <div className="public-form"><Alert>{t(linkError)}</Alert><p>{t("M\u1ED7i li\u00EAn k\u1EBFt ch\u1EC9 d\u00F9ng \u0111\u01B0\u1EE3c m\u1ED9t l\u1EA7n.")}</p></div> : done ? <div className="public-form success-panel"><span className="success-ring"><CheckCircle2 size={28}/></span><h2>{t("\u0110\u00E3 nh\u1EADn th\u00F4ng tin b\u1ED5 sung")}</h2><p>{t("Th\u00F4ng tin \u0111\u00E3 \u0111\u01B0\u1EE3c g\u1EAFn v\u00E0o h\u1ED3 s\u01A1 c\u1EE7a b\u1EA1n.")}</p><Link className="button primary" to="/tuyen-dung">{t("V\u1EC1 danh s\u00E1ch tuy\u1EC3n d\u1EE5ng")}<ArrowRight size={17}/></Link></div> : <form className="public-form" onSubmit={submit} onChange={() => { requestKey.current = key(); }}><div className="info-note"><Clock3 size={18}/><span>{t("Li\u00EAn k\u1EBFt d\u00F9ng m\u1ED9t l\u1EA7n, c\u00F3 hi\u1EC7u l\u1EF1c \u0111\u1EBFn ")}<strong>{date(expires, true)}</strong>{t(".")}</span></div><div className="form-grid"><Field label={t("H\u1ECD v\u00E0 t\u00EAn (n\u1EBFu \u0111ang thi\u1EBFu)")} className="full"><input name="fullName" maxLength={120} autoComplete="name"/></Field><Field label={t("Email")}><input name="email" type="email" maxLength={254} autoComplete="email"/></Field><Field label={t("S\u1ED1 \u0111i\u1EC7n tho\u1EA1i")}><input name="phone" type="tel" maxLength={30} autoComplete="tel"/></Field><Field label={t("Portfolio")} className="full"><input name="portfolio" type="url" placeholder={t("https://\u2026")} maxLength={1000}/></Field><Field label={t("L\u1EDDi nh\u1EAFn cho HR")} className="full"><textarea name="notes" maxLength={3000} placeholder={t("Th\u00F4ng tin c\u1EA7n c\u1EADp nh\u1EADt ho\u1EB7c gi\u1EA3i th\u00EDch th\u00EAm")}/></Field></div><Field label={t("CV b\u1ED5 sung")}><FileInput file={file} onChange={value => { setFile(value); requestKey.current = key(); }}/></Field><p className="helper">{t("Th\u00F4ng tin g\u1ED1c \u0111\u01B0\u1EE3c gi\u1EEF nguy\u00EAn. HR s\u1EBD ki\u1EC3m tra c\u00E1c thay \u0111\u1ED5i b\u1EA1n g\u1EEDi.")}</p><PrivacyNotice /><label className="checkbox-line consent-checkbox"><input type="checkbox" name="consent" value="true" required/><span>{t("T\u00F4i \u0111\u1ED3ng \u00FD x\u1EED l\u00FD th\u00F4ng tin b\u1ED5 sung cho m\u1EE5c \u0111\u00EDch tuy\u1EC3n d\u1EE5ng t\u1EA1i Super Net.")}</span></label>{error && <Alert>{t(error)}</Alert>}<button className="button primary full-width" disabled={busy}>{busy ? t("\u0110ang g\u1EEDi\u2026") : t("G\u1EEDi th\u00F4ng tin b\u1ED5 sung")}<ArrowRight size={17}/></button></form>}</main><PublicFooter /></div>;
}
