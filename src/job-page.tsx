import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarDays, Clock3, Copy, MapPin, UsersRound, Wallet } from 'lucide-react';
import { api, date, errorMessage } from './api';
import { Alert, Spinner } from './ui';
import { Brand, PublicHeader, PublicFooter } from './public';
import { brandName, JDContent, ShareJobLink } from './jobs';
import type { Job } from './types';

export function PublicJobPage() {
  const { jobId } = useParams();
  const [job, setJob] = useState<Job | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [share, setShare] = useState(false);
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setJob(null);
    api<Job>(`/public/jobs/${encodeURIComponent(jobId || '')}`).then(result => { if (active) setJob(result); }).catch(error => { if (active) setError(errorMessage(error)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [jobId]);
  useEffect(() => {
    if (!job) return;
    const previous = document.title; document.title = `${job.title} | Tuyển dụng Super Net`;
    return () => { document.title = previous; };
  }, [job]);
  const updatedAt = job?.updated_at || job?.created_at;
  return <div className="public-page jd-page"><PublicHeader/><main className="public-jd-main"><Link className="back-link" to="/tuyen-dung"><ArrowLeft size={16}/>Tất cả vị trí tuyển dụng</Link>
    {loading ? <Spinner/> : error || !job ? <div className="jd-unavailable"><Alert>{error || 'Tin tuyển dụng không còn hiển thị.'}</Alert><Link className="button primary" to="/tuyen-dung">Xem các vị trí đang tuyển<ArrowRight size={17}/></Link></div> : <>
      <header className="public-jd-heading"><div><span className="eyebrow">JD TUYỂN DỤNG · {job.department}</span><h1>{job.title}</h1><p><span>{brandName(job.business_line)}</span><span>·</span><MapPin size={15}/>{job.location}</p></div><Link className="button primary" to={`/ung-tuyen/${encodeURIComponent(job.id)}`}>Ứng tuyển ngay<ArrowRight size={17}/></Link></header>
      <div className="public-jd-layout"><article className="panel jd-article"><JDContent job={job}/><div className="jd-apply-note"><Link className="button primary" to={`/ung-tuyen/${encodeURIComponent(job.id)}`}>Ứng tuyển vị trí này<ArrowRight size={17}/></Link></div></article>
      <aside className="panel jd-sidebar"><h2>Thông tin vị trí</h2><dl>
        <div><dt><UsersRound size={16}/>Số lượng cần tuyển</dt><dd>{job.openings} người</dd></div>
        <div><dt><Clock3 size={16}/>Hình thức làm việc</dt><dd>{job.employment_type}</dd></div>
        <div><dt><MapPin size={16}/>Địa điểm</dt><dd>{job.location}</dd></div>
        {job.salary_range && <div><dt><Wallet size={16}/>Mức lương</dt><dd>{job.salary_range}</dd></div>}
        {job.working_hours && <div><dt><Clock3 size={16}/>Thời gian làm việc</dt><dd>{job.working_hours}</dd></div>}
        {job.application_deadline && <div><dt><CalendarDays size={16}/>Hạn nhận hồ sơ</dt><dd>{date(`${job.application_deadline}T00:00:00+07:00`)}</dd></div>}
      </dl>{updatedAt && <p className="jd-updated">Cập nhật {date(updatedAt)}</p>}<Link className="button primary full-width" to={`/ung-tuyen/${encodeURIComponent(job.id)}`}>Ứng tuyển ngay<ArrowRight size={17}/></Link><button className="button secondary full-width" onClick={() => setShare(true)}><Copy size={16}/>Chia sẻ JD</button><div className="jd-company-mark"><Brand/><p>Phụ kiện xe Safestraps · Âm thanh JieLien · Mẹ và Bé Baby tatto</p></div></aside></div>
    </>}
    {share && job && <ShareJobLink job={job} onClose={() => setShare(false)}/>}
  </main><PublicFooter/></div>;
}
