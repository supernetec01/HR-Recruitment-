import { useEffect, useState } from 'react';
import { CalendarDays, FilePlus2, UserRoundCheck, UsersRound } from 'lucide-react';
import { api, errorMessage, STAGES } from './api';
import { t } from './locale';
import { Alert, Empty, Spinner } from './ui';
import type { Candidate, Interview } from './types';
import './recruitment-reports.css';

type Report = {
  summary: { received: number; scheduled: number; interviewed: number; pass: number; fail: number; follow_up: number; pending: number };
  sources: { name: string; value: number }[];
  jobs: { id: string; title: string; value: number }[];
  stages: { stage: string; value: number }[];
  applicationCount: number;
};
const dayKey = (timestamp = Date.now()) => new Date(timestamp + 7 * 3600000).toISOString().slice(0, 10);
function presetRange(preset: string) {
  const to = dayKey();
  const from = preset === 'month' ? `${to.slice(0, 7)}-01` : dayKey(Date.now() - (preset === '30' ? 29 : 6) * 86400000);
  return { from, to };
}
const displayDay = (value: string) => value.split('-').reverse().join('/');

export function RecruitmentReports({ candidates, interviews }: { candidates: Candidate[]; interviews: Interview[] }) {
  const [preset, setPreset] = useState('7'), [range, setRange] = useState(() => presetRange('7'));
  const [report, setReport] = useState<Report | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  // Recompute relative presets on the regular app refresh, including across midnight.
  const dates = preset === 'custom' ? range : presetRange(preset);
  const from = dates.from, to = dates.to;
  const invalid = preset !== 'all' && (!from || !to || from > to);
  useEffect(() => {
    let active = true;
    setReport(null); setError('');
    if (!invalid) {
      const query = preset === 'all' ? '' : `?${new URLSearchParams({ from, to })}`;
      void api<Report>(`/reports/recruitment${query}`).then(result => { if (active) setReport(result); })
        .catch(err => { if (active) setError(errorMessage(err)); });
    }
    return () => { active = false; };
  }, [preset, from, to, invalid, candidates, interviews, retry]);
  function changePreset(value: string) { setRange(presetRange(value)); setPreset(value); }
  const summary = report?.summary;
  const stats = summary ? [
    { label: 'Hồ sơ mới ghi nhận', value: summary.received, icon: FilePlus2 },
    { label: 'Ứng viên được hẹn phỏng vấn', value: summary.scheduled, icon: CalendarDays },
    { label: 'Ứng viên đã phỏng vấn', value: summary.interviewed, icon: UsersRound },
    { label: 'Ứng viên phỏng vấn đạt', value: summary.pass, icon: UserRoundCheck },
  ] : [];
  return <>
    <div className="page-heading"><div><h1>{t('Báo cáo tuyển dụng')}</h1><p>{t('Theo dõi hoạt động tuyển dụng trong khoảng thời gian đã chọn.')}</p></div></div>
    <section className="panel report-filters" aria-label={t('Bộ lọc thời gian báo cáo')}>
      <label>{t('Khoảng thời gian')}<select aria-label={t('Khoảng thời gian')} value={preset} onChange={event => changePreset(event.target.value)}>
        <option value="7">{t('7 ngày qua')}</option><option value="30">{t('30 ngày qua')}</option>
        <option value="month">{t('Tháng này')}</option><option value="all">{t('Toàn bộ thời gian')}</option><option value="custom">{t('Tùy chọn ngày')}</option>
      </select></label>
      {preset !== 'all' && <><label>{t('Từ ngày')}<input aria-label={t('Từ ngày')} type="date" value={from} max={to || undefined} onChange={event => { setRange({ from: event.target.value, to }); setPreset('custom'); }}/></label>
        <label>{t('Đến ngày')}<input aria-label={t('Đến ngày')} type="date" value={to} min={from || undefined} onChange={event => { setRange({ from, to: event.target.value }); setPreset('custom'); }}/></label></>}
      <span className="muted">{t('Tính trọn ngày theo UTC+7, gồm cả ngày bắt đầu và kết thúc.')}</span>
    </section>
    {invalid ? <Alert>{t('Chọn ngày bắt đầu và ngày kết thúc hợp lệ; ngày bắt đầu không được sau ngày kết thúc.')}</Alert> : error ? <div><Alert>{t(error)}</Alert><button className="button secondary" onClick={() => setRetry(value => value + 1)}>{t('Thử tải lại dữ liệu')}</button></div> : !report || !summary ? <Spinner/> : <div className="recruitment-report" aria-live="polite">
      <p className="report-period">{preset === 'all' ? t('Toàn bộ thời gian') : `${displayDay(from)} – ${displayDay(to)}`}</p>
      <div className="metrics">{stats.map(({ label, value, icon: Icon }) => <div className="metric-card" key={label}><div className="metric-top"><span>{t(label)}</span><span className="metric-icon"><Icon size={19}/></span></div><strong className="metric-value">{value}</strong></div>)}</div>
      <section className="panel report-outcomes" aria-label={t('Kết quả phỏng vấn')}><h3>{t('Kết quả phỏng vấn')}</h3>
        <div className="report-outcome-grid">{([['pass', 'Đạt'], ['fail', 'Không đạt'], ['follow_up', 'Cần phỏng vấn thêm'], ['pending', 'Chưa có đánh giá']] as const).map(([key, label]) => <div className={`report-outcome ${key}`} key={key}><span>{t(label)}</span><strong>{summary[key]}</strong></div>)}</div>
        <p className="muted">{t('Mỗi ứng viên được tính một lần, theo buổi phỏng vấn đã hoàn thành gần nhất trong kỳ và đánh giá hiện tại của buổi đó.')}</p>
      </section>
      <details className="report-method"><summary>{t('Cách tính số liệu')}</summary><ul>
        <li>{t('Hồ sơ mới: theo ngày nhận hồ sơ, kể cả hồ sơ hiện đã chuyển sang giai đoạn khác.')}</li>
        <li>{t('Hẹn phỏng vấn: theo ngày tạo lịch hẹn, không gồm lịch đã hủy; mỗi ứng viên tính một lần trong kỳ.')}</li>
        <li>{t('Đã phỏng vấn: theo ngày diễn ra buổi phỏng vấn có trạng thái Hoàn thành, kể cả ứng viên được tiếp nhận trước kỳ báo cáo.')}</li>
        <li>{t('Đạt và Không đạt lấy từ đánh giá phỏng vấn; hồ sơ bị loại ở vòng sàng lọc không tính là phỏng vấn không đạt.')}</li>
      </ul></details>
      <div className="dashboard-grid">
        <section className="panel dashboard-card"><div className="section-heading"><h3>{t('Ứng viên theo nguồn tiếp nhận')}</h3><span className="muted">{t('Hồ sơ nhận trong kỳ')}</span></div>
          {report.sources.map((source, index) => <div className="bar-report" key={source.name}><div><span>{t(source.name)}</span><span><strong>{source.value}</strong> · {Math.round(source.value / (summary.received || 1) * 100)}%</span></div><div className="bar-track"><span style={{ width: `${source.value / (summary.received || 1) * 100}%`, background: ['#149cd0', '#034969', '#93c947', '#6eb8cc'][index % 4] }}/></div></div>)}
          {!report.sources.length && <Empty title={t('Chưa có số liệu')}>{t('Không có hồ sơ nhận trong khoảng thời gian này.')}</Empty>}
        </section>
        <section className="panel dashboard-card"><div className="section-heading"><h3>{t('Lượt ứng tuyển theo vị trí')}</h3><span className="mini-tag">{report.applicationCount}{t(' lượt')}</span></div>
          {report.jobs.map(job => <div className="bar-report" key={job.id}><div><span>{job.title}</span><strong>{job.value}</strong></div><div className="bar-track"><span style={{ width: `${job.value / (report.applicationCount || 1) * 100}%` }}/></div></div>)}
          {!report.applicationCount && <Empty title={t('Chưa có lượt ứng tuyển trong kỳ')}/>}
        </section>
        <section className="panel dashboard-card recent-card"><div className="section-heading"><h3>{t('Phân bố các giai đoạn tuyển dụng')}</h3><span className="muted">{t('Trạng thái hiện tại của các lượt ứng tuyển nhận trong kỳ')}</span></div><div className="stage-report">{Object.entries(STAGES).map(([stage, info]) => <div key={stage}><span className={`pipeline-stage-dot ${info.color}`}/><strong>{report.stages.find(row => row.stage === stage)?.value || 0}</strong><span>{t(info.label)}</span></div>)}</div></section>
      </div>
    </div>}
  </>;
}
