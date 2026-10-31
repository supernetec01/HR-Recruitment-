import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ClipboardCheck, Pencil, Save } from 'lucide-react';
import { api, ApiError, date, errorMessage, json, key } from './api';
import { getLanguage, t } from './locale';
import { Alert, Empty, Field, Modal, Spinner } from './ui';
import type { Interview, InterviewEvaluation, User } from './types';

export const EVALUATION_RESULTS = {pass:'Đạt',follow_up:'Cần phỏng vấn thêm',fail:'Không đạt'};
export const evaluationScore=(value:number)=>new Intl.NumberFormat(getLanguage()==='zh-CN'?'zh-CN':'vi-VN',{maximumFractionDigits:1}).format(value);
export function EvaluationBadge({evaluation}:{evaluation:InterviewEvaluation}) {
  return <div className="evaluation-badge"><strong>{evaluationScore(evaluation.score)}<span>/10</span></strong><span className={`evaluation-result ${evaluation.result}`}>{t(EVALUATION_RESULTS[evaluation.result])}</span></div>;
}
export function EvaluationButton({interview,user,onOpen}:{interview:Interview;user:User;onOpen:(interview:Interview)=>void}) {
  if(interview.status!=='completed')return null;
  const own=interview.interviewer_id===user.id;
  if(!own&&!interview.evaluation)return <span className="evaluation-waiting">{t('Chờ đánh giá từ {name}',{name:interview.interviewer_name})}</span>;
  const label=own?(interview.evaluation?'Chỉnh sửa đánh giá':'Đánh giá'):'Xem đánh giá';
  return <button type="button" className="button secondary small-button" aria-label={t(`${label} {name}`,{name:interview.candidate_name})} onClick={()=>onOpen(interview)}>{own?<Pencil size={15} aria-hidden="true"/>:<ClipboardCheck size={15} aria-hidden="true"/>}{t(label)}</button>;
}
export function CandidateEvaluations({interviews,user,onOpen}:{interviews:Interview[];user:User;onOpen:(interview:Interview)=>void}) {
  const completed=interviews.filter(interview=>interview.status==='completed');
  return <section className="candidate-evaluations" aria-label={t('Đánh giá phỏng vấn')}><div className="section-heading"><h3>{t('Đánh giá phỏng vấn')}</h3><span className="muted">{t('Thang điểm 10')}</span></div>
    {!completed.length?<Empty title={t('Chưa có buổi phỏng vấn đã hoàn thành')}>{t('HR đánh dấu Hoàn thành trong Lịch phỏng vấn sau khi buổi phỏng vấn kết thúc. Sau đó người được phân công có thể ghi đánh giá.')}</Empty>:completed.map(interview=><article className="evaluation-card" key={interview.id}>
      <header><div><h4>{interview.job_title}</h4><p>{date(interview.starts_at,true)} · {interview.interviewer_name}</p></div>{interview.evaluation&&<EvaluationBadge evaluation={interview.evaluation}/>}</header>
      {interview.evaluation?<><p className="evaluation-comments">{interview.evaluation.comments}</p><p className="evaluation-author">{t('Người đánh giá: {name}',{name:interview.evaluation.reviewer_name})} · {t('Cập nhật: {date}',{date:date(interview.evaluation.updated_at,true)})}</p></>:<p className="evaluation-empty">{t('Chưa có đánh giá cho buổi phỏng vấn này.')}</p>}
      <footer><EvaluationButton interview={interview} user={user} onOpen={onOpen}/></footer>
    </article>)}
  </section>;
}

export function InterviewEvaluationModal({interview,onClose,onSaved}:{interview:Interview;onClose:()=>void;onSaved:()=>void}) {
  const [evaluation,setEvaluation]=useState<InterviewEvaluation|null>(null),[canEvaluate,setCanEvaluate]=useState(false),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[conflict,setConflict]=useState(false);
  const [score,setScore]=useState(''),[result,setResult]=useState(''),[comments,setComments]=useState('');const requestKey=useRef(key());
  useEffect(()=>{let active=true;(async()=>{
    try{const value=await api<{evaluation:InterviewEvaluation|null;canEvaluate:boolean}>(`/interviews/${encodeURIComponent(interview.id)}/evaluation`);if(!active)return;setEvaluation(value.evaluation);setCanEvaluate(value.canEvaluate);setScore(value.evaluation?String(value.evaluation.score):'');setResult(value.evaluation?.result||'');setComments(value.evaluation?.comments||'');}
    catch(error){if(active)setError(errorMessage(error));}finally{if(active)setLoaded(true);}
  })();return()=>{active=false;};},[interview.id]);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy||!loaded||!canEvaluate)return;setBusy(true);setError('');setConflict(false);
    try{await api(`/interviews/${encodeURIComponent(interview.id)}/evaluation`,{method:'PUT',headers:{'Idempotency-Key':requestKey.current},body:json({score:Number(score.replace(',','.')),result,comments,expectedRevision:evaluation?.revision||0})});onSaved();}
    catch(error){setError(errorMessage(error));setConflict(error instanceof ApiError&&error.status===409);}finally{setBusy(false);}
  }
  return <Modal title={t('Đánh giá phỏng vấn')} subtitle={`${interview.candidate_name} · ${interview.job_title}`} onClose={()=>!busy&&onClose()} wide className="evaluation-modal">
    {!loaded?<Spinner/>:<form onSubmit={submit} onChange={()=>{requestKey.current=key();}}><div className="modal-body"><p className="evaluation-session">{date(interview.starts_at,true)} · {t('Người phỏng vấn: {name}',{name:interview.interviewer_name})}</p>
      {canEvaluate?<fieldset disabled={busy} className="evaluation-fields"><div className="form-grid"><Field label={t('Điểm phỏng vấn (0–10)')} required hint={t('Có thể nhập số lẻ, ví dụ 8,5.')}><input name="score" type="text" inputMode="decimal" pattern="(?:10(?:[.,]0)?|[0-9](?:[.,][0-9])?)" maxLength={4} title={t("Nhập điểm từ 0 đến 10, tối đa một chữ số thập phân.")} required value={score} onChange={event=>setScore(event.target.value)}/></Field><Field label={t('Kết quả đề xuất')} required><select name="result" required value={result} onChange={event=>setResult(event.target.value)}><option value="">{t('Chọn kết quả')}</option>{Object.entries(EVALUATION_RESULTS).map(([value,label])=><option value={value} key={value}>{t(label)}</option>)}</select></Field></div><Field label={t('Nhận xét phỏng vấn')} required hint={t('Từ 10 đến 5.000 ký tự.')}><textarea name="comments" required minLength={10} maxLength={5000} rows={7} value={comments} onChange={event=>setComments(event.target.value)} placeholder={t('Nhận xét về kinh nghiệm, chuyên môn và những nội dung cần làm rõ…')}/></Field></fieldset>:evaluation?<div className="evaluation-readonly"><EvaluationBadge evaluation={evaluation}/><p className="evaluation-comments">{evaluation.comments}</p><p className="evaluation-author">{t('Người đánh giá: {name}',{name:evaluation.reviewer_name})} · {date(evaluation.updated_at,true)}</p></div>:!error&&<p>{t('Chưa có đánh giá cho buổi phỏng vấn này.')}</p>}
      {!canEvaluate&&!error&&<p className="helper">{t('Chỉ người được phân công phỏng vấn được viết hoặc sửa đánh giá này.')}</p>}{error&&<Alert>{t(error)}</Alert>}{conflict&&<p className="helper">{t('Nội dung bạn nhập được giữ trên biểu mẫu. Đóng và mở lại đánh giá để xem bản cập nhật mới.')}</p>}
    </div><footer className="modal-foot"><div><button type="button" className="button secondary" disabled={busy} onClick={onClose}>{t(canEvaluate?'Hủy':'Đóng')}</button>{canEvaluate&&<button type="submit" className="button primary" disabled={busy}><Save size={16} aria-hidden="true"/>{t(busy?'Đang lưu…':'Lưu đánh giá')}</button>}</div></footer></form>}
  </Modal>;
}
