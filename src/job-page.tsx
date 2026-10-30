import { t } from './locale';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarDays, Clock3, Copy, MapPin, UsersRound, Wallet } from 'lucide-react';
import { api, date, errorMessage } from './api';
import { Alert, Spinner } from './ui';
import { Brand, PublicHeader, PublicFooter } from './public';
import { brandName, JDContent, ShareJobLink } from './jobs';
import type { Job } from './types';
import { useLanguage, setLanguage } from './locale';

export function PublicJobPage() {
  const { jobId } = useParams();
  const language = useLanguage(), [params] = useSearchParams();
  const linkedLanguage = params.get('lang');
  useEffect(() => {if (linkedLanguage === 'vi' || linkedLanguage === 'zh-CN') setLanguage(linkedLanguage);},[linkedLanguage]);
  const [job, setJob] = useState<Job | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [share, setShare] = useState(false);
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setJob(null);
    api<Job>(`/public/jobs/${encodeURIComponent(jobId || '')}?language=${language}`).then(result => { if (active) setJob(result); }).catch(error => { if (active) setError(errorMessage(error)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [jobId,language]);
  useEffect(() => {
    if (!job) return;
    const previous = document.title; document.title = `${job.title} | Tuyển dụng Super Net`;
    return () => { document.title = previous; };
  }, [job]);
  const updatedAt = job?.updated_at || job?.created_at;
  return <div className="public-page jd-page"><PublicHeader/><main className="public-jd-main"><Link className="back-link" to="/tuyen-dung"><ArrowLeft size={16}/>{t("Tất cả vị trí tuyển dụng")}</Link>
    {loading ? <Spinner/> : error || !job ? <div className="jd-unavailable"><Alert>{error || t("Tin tuyển dụng không còn hiển thị.")}</Alert><Link className="button primary" to="/tuyen-dung">{t("Xem các vị trí đang tuyển")}<ArrowRight size={17}/></Link></div> : <>
      <header className="public-jd-heading"><div><span className="eyebrow">{t("JD TUYỂN DỤNG · ")}{job.department}</span><h1>{job.title}</h1><p><span>{brandName(job.business_line)}</span><span>·</span><MapPin size={15}/>{job.location}</p></div><Link className="button primary" to={`/ung-tuyen/${encodeURIComponent(job.id)}`}>{t("Ứng tuyển ngay")}<ArrowRight size={17}/></Link></header>
      {language === 'zh-CN' && job.translation_available === false && <p className="jd-language-note">{t("Bản tiếng Trung chưa được đăng. Nội dung công việc đang hiển thị bằng ngôn ngữ gốc.")}</p>}
      <div className="public-jd-layout"><article className="panel jd-article"><JDContent job={job}/><div className="jd-apply-note"><Link className="button primary" to={`/ung-tuyen/${encodeURIComponent(job.id)}`}>{t("Ứng tuyển vị trí này")}<ArrowRight size={17}/></Link></div></article>
      <aside className="panel jd-sidebar"><h2>{t("Thông tin vị trí")}</h2><dl>
        <div><dt><UsersRound size={16}/>{t("Số lượng cần tuyển")}</dt><dd>{job.openings}{t(" người")}</dd></div>
        <div><dt><Clock3 size={16}/>{t("Hình thức làm việc")}</dt><dd>{job.employment_type}</dd></div>
        <div><dt><MapPin size={16}/>{t("Địa điểm")}</dt><dd>{job.location}</dd></div>
        {job.salary_range && <div><dt><Wallet size={16}/>{t("Mức lương")}</dt><dd>{job.salary_range}</dd></div>}
        {job.working_hours && <div><dt><Clock3 size={16}/>{t("Thời gian làm việc")}</dt><dd>{job.working_hours}</dd></div>}
        {job.application_deadline && <div><dt><CalendarDays size={16}/>{t("Hạn nhận hồ sơ")}</dt><dd>{date(`${job.application_deadline}T00:00:00+07:00`)}</dd></div>}
      </dl>{updatedAt && <p className="jd-updated">{t("Cập nhật ")}{date(updatedAt)}</p>}<Link className="button primary full-width" to={`/ung-tuyen/${encodeURIComponent(job.id)}`}>{t("Ứng tuyển ngay")}<ArrowRight size={17}/></Link><button className="button secondary full-width" onClick={() => setShare(true)}><Copy size={16}/>{t("Chia sẻ JD")}</button><div className="jd-company-mark"><Brand/><p>{t("Phụ kiện xe Safestraps · Âm thanh JieLien · Mẹ và Bé Baby tatto")}</p></div></aside></div>
    </>}
    {share && job && <ShareJobLink job={job} onClose={() => setShare(false)}/>}
  </main><PublicFooter/></div>;
}
