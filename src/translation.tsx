import { t } from './locale';
import { useEffect, useState, type FormEvent } from 'react';
import { Check, KeyRound, Languages, RefreshCw } from 'lucide-react';
import { api, date, errorMessage, json } from './api';
import { Alert, Field, Modal, Spinner } from './ui';
import { JDContent } from './jobs';
import type { Job } from './types';
type TranslationStatus = {configured:boolean;provider:string;model:string};
type TranslationSettings = TranslationStatus & {revision:number;keyUpdatedAt:string | null;reminderDays:number;nextReminderAt:string | null;reminderDue:boolean;lastTestAt:string | null;lastTestResult:'untested' | 'connected' | 'error';source:string};
type CVTranslation = {text:string;target_language:string;created_at:string;model:string};
type JobTranslation = {content:Partial<Job>;created_at:string;source_revision:number;model:string};

export function CVTranslationPanel({documentId}:{documentId:string}) {
  const [target,setTarget] = useState('zh-CN'), [translation,setTranslation] = useState<CVTranslation | null>(null);
  const [status,setStatus] = useState<TranslationStatus | null>(null), [loading,setLoading] = useState(true), [busy,setBusy] = useState(false), [error,setError] = useState('');
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setTranslation(null);
    Promise.all([api<TranslationStatus>('/translation/status'),api<{translation:CVTranslation | null}>(`/documents/${documentId}/translations/${target}`)]).then(([status,content]) => { if (active) {setStatus(status);setTranslation(content.translation);} }).catch(error => {if (active) setError(errorMessage(error));}).finally(() => {if (active) setLoading(false);});
    return () => {active = false;};
  },[documentId,target]);
  async function translate() {
    setBusy(true);setError('');
    try { const content = await api<{translation:CVTranslation}>(`/documents/${documentId}/translations`,{method:'POST',body:json({targetLanguage:target,force:!!translation})}); setTranslation(content.translation); }
    catch (error) {setError(errorMessage(error));} finally {setBusy(false);}
  }
  return <section className="translation-panel"><div className="translation-heading"><h3><Languages size={19}/>{t("Dịch CV")}</h3><select aria-label={t("Ngôn ngữ bản dịch CV")} value={target} onChange={event => setTarget(event.target.value)} disabled={busy}><option value="zh-CN">{t("Tiếng Trung giản thể")}</option><option value="vi">{t("Tiếng Việt")}</option></select></div>
    {loading ? <Spinner/> : <>
      {!status?.configured && <p className="translation-unavailable" role="status">{t("Chức năng dịch chưa được bật. Vui lòng liên hệ quản trị viên.")}</p>}
      <p className="helper">{t("Khi chọn dịch, nội dung CV được gửi tới dịch vụ dịch của công ty. Bản dịch dùng để tham khảo khi đọc hồ sơ.")}</p>
      <button className="button primary" disabled={busy || !status?.configured} onClick={() => void translate()}><Languages size={16}/>{busy ? t("Đang dịch CV…") : translation ? t("Dịch lại CV") : t("Dịch CV")}</button>
      {error && <Alert>{t(error)}</Alert>}
      {translation && <div className="translated-document" lang={target}><p className="translation-date">{t("Bản dịch · ")}{date(translation.created_at,true)}</p><div>{translation.text}</div></div>}
    </>}
  </section>;
}

export function JobTranslationModal({job,onClose}:{job:Job;onClose:()=>void}) {
  const [status,setStatus] = useState<TranslationStatus | null>(null), [translation,setTranslation] = useState<JobTranslation | null>(null);
  const [loading,setLoading] = useState(true), [busy,setBusy] = useState(false), [error,setError] = useState('');
  useEffect(() => {let active = true;Promise.all([api<TranslationStatus>('/translation/status'),api<{translation:JobTranslation | null}>(`/jobs/${job.id}/translations/zh-CN`)]).then(([status,result]) => {if (active) {setStatus(status);setTranslation(result.translation);}}).catch(error => {if (active) setError(errorMessage(error));}).finally(() => {if (active) setLoading(false);});return () => {active = false;};},[job.id]);
  async function translate() {
    setBusy(true);setError('');
    try {const result = await api<{translation:JobTranslation}>(`/jobs/${job.id}/translations`,{method:'POST',body:json({targetLanguage:'zh-CN',expectedRevision:job.revision})});setTranslation(result.translation);}
    catch(error){setError(errorMessage(error));}finally{setBusy(false);}
  }
  return <Modal title={t("Bản tiếng Trung của JD")} subtitle={job.title} onClose={() => !busy && onClose()} wide><div className="modal-body translation-panel">
    {loading ? <Spinner/> : <>
      <p>{t("Thông tin tuyển dụng bằng tiếng Trung sẽ hiển thị khi ứng viên chọn ngôn ngữ này trên trang công khai.")}</p>
      {!status?.configured && <Alert>{t("Chức năng dịch chưa được bật. Vui lòng cấu hình dịch vụ trong trang quản trị.")}</Alert>}
      {error && <Alert>{t(error)}</Alert>}
      {translation && <div className="translated-document" lang="zh-CN"><h3>{translation.content.title}</h3><JDContent job={{...job,...translation.content}}/></div>}
    </>}
  </div><footer className="modal-foot"><span>{t("Bản gốc và bản tiếng Trung được lưu riêng")}</span><button className="button primary" disabled={busy || !status?.configured || !!translation} onClick={() => void translate()}><Languages size={16}/>{busy ? t("Đang dịch JD…") : translation ? t("Đã lưu bản tiếng Trung") : t("Dịch & lưu bản tiếng Trung")}</button></footer></Modal>;
}

export function AdminTranslationSettings() {
  const [settings,setSettings] = useState<TranslationSettings | null>(null),[error,setError] = useState(''),[message,setMessage] = useState('');
  const [apiKey,setApiKey] = useState(''),[model,setModel] = useState('gpt-4.1-mini'),[days,setDays] = useState(30),[busy,setBusy] = useState(false),[sample,setSample] = useState('');
  function apply(value:TranslationSettings) {setSettings(value);setModel(value.model);setDays(value.reminderDays);}
  async function load() {try {const result = await api<{settings:TranslationSettings}>('/admin/translation-settings');apply(result.settings);setError('');}catch(error){setError(errorMessage(error));}}
  useEffect(() => {void load();},[]);
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(busy || !settings)return;setBusy(true);setError('');setMessage('');setSample('');
    try {const result=await api<{settings:TranslationSettings}>('/admin/translation-settings',{method:'PUT',body:json({apiKey,model,reminderDays:days,expectedRevision:settings.revision})});apply(result.settings);setApiKey('');setMessage('Đã lưu cấu hình API. Áp dụng ngay cho lần dịch tiếp theo.');}
    catch(error){setError(errorMessage(error));}finally{setBusy(false);}
  }
  async function testConnection() {
    if(busy)return;setBusy(true);setError('');setMessage('');setSample('');
    try{const result=await api<{settings:TranslationSettings;sample:string}>('/admin/translation-settings/test',{method:'POST',body:json({})});apply(result.settings);setSample(result.sample);setMessage('Kết nối API thành công.');}
    catch(error){await load();setError(errorMessage(error));}finally{setBusy(false);}
  }
  return <section className="panel dashboard-card translation-settings"><div className="section-heading"><h3><Languages size={18}/>{t("Dịch thuật Việt–Trung")}</h3><button className="text-button" disabled={busy} onClick={() => void load()}><RefreshCw size={15}/>{t("Cập nhật trạng thái")}</button></div>
    {error && <Alert>{t(error)}</Alert>}
    {message && <Alert success>{t(message)}</Alert>}
    {settings && <><div className="translation-account-status"><span className={`stage ${settings.configured ? 'green' : 'gray'}`}><span/>{settings.configured ? t('Đã lưu khóa API') : t('Chưa cấu hình API')}</span><span>{settings.lastTestResult === 'connected' ? t('Lần kiểm tra gần nhất: Thành công') : settings.lastTestResult === 'error' ? t('Lần kiểm tra gần nhất: Cần kiểm tra lại') : t('Chưa kiểm tra kết nối')}</span></div>
      {settings.reminderDue && <Alert>{t('Đã đến lịch nhắc cập nhật khóa API. Bạn có thể thay khóa ngay bên dưới.')}</Alert>}
      <form onSubmit={save} className="translation-settings-form"><div className="form-grid">
        <Field label="Khóa API OpenAI mới" className="full" required={!settings.configured} hint="Để trống để giữ khóa hiện tại. Khóa đã lưu không hiển thị lại."><input name="translationApiKey" type="password" autoComplete="off" value={apiKey} onChange={event=>setApiKey(event.target.value)} required={!settings.configured} minLength={20} maxLength={512} disabled={busy} placeholder="sk-…"/></Field>
        <Field label="Mô hình dịch"><input value={model} onChange={event=>setModel(event.target.value)} required maxLength={120} disabled={busy}/></Field>
        <Field label="Nhắc cập nhật sau (ngày)"><input type="number" min={1} max={365} value={days} onChange={event=>setDays(Number(event.target.value))} required disabled={busy}/></Field>
      </div><div className="translation-key-dates"><span>{t('Ngày cập nhật khóa:')} <strong>{settings.keyUpdatedAt ? date(settings.keyUpdatedAt,true) : t('Chưa ghi nhận')}</strong></span><span>{t('Lần nhắc tiếp theo:')} <strong>{settings.nextReminderAt ? date(settings.nextReminderAt,true) : '—'}</strong></span>{settings.lastTestAt && <span>{t('Kiểm tra API:')} {date(settings.lastTestAt,true)}</span>}</div>
      <p className="helper">{t('Có thể thay khóa bất cứ lúc nào. Lịch nhắc không làm khóa tự hết hạn.')}</p>
      <div className="hero-actions"><button className="button primary" disabled={busy}><KeyRound size={16}/>{busy ? t('Đang xử lý…') : t('Lưu cấu hình API')}</button><button type="button" className="button secondary" disabled={busy || !settings.configured || !!apiKey || model !== settings.model} onClick={()=>void testConnection()}><Check size={16}/>{t('Kiểm tra kết nối API')}</button></div></form>
      {sample && <p className="translation-test-sample" lang="zh-CN">{sample}</p>}
    </>}
  </section>;
}
