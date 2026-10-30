import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Check, Eye, FilePlus2, Mail, Pencil } from 'lucide-react';
import { api, errorMessage, json } from './api';
import { Alert, Field, Modal } from './ui';
import { EMPLOYMENT_TYPES, JDContent, JOB_BRANDS } from './jobs';
import { CONTENT_MARKETING_JD } from './jd-template';
import type { Job } from './types';

const initialDraft = (job?: Job) => ({
  companyName: job?.company_name || 'CÔNG TY TNHH THƯƠNG MẠI SUPER NET',
  title: job?.title || '', department: job?.department || '', openings: String(job?.openings || 1),
  businessLine: job?.business_line || '', employmentType: job?.employment_type || 'Toàn thời gian',
  location: job?.location || '', salaryRange: job?.salary_range || '', workingHours: job?.working_hours || '',
  description: job?.description || '', requirements: job?.requirements || '', benefits: job?.benefits || '',
  applicationInstructions: job?.application_instructions || '', applicationEmail: job?.application_email || '',
  applicationEmailSubject: job?.application_email_subject || '', applicationZalo: job?.application_zalo || '',
  applicationDeadline: job?.application_deadline || '', status: job?.status || 'open',
});

export function JobForm({ existing, onClose, onSaved }: { existing?: Job; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState(() => initialDraft(existing));
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const bind = (field: keyof typeof draft) => ({ name: field, value: draft[field], onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setDraft(previous => ({ ...previous, [field]: event.target.value })) });
  const preview: Job = { id: existing?.id || 'preview', title: draft.title || 'Tên vị trí tuyển dụng', department: draft.department, openings: Number(draft.openings) || 0, location: draft.location, employment_type: draft.employmentType, description: draft.description, requirements: draft.requirements, benefits: draft.benefits, salary_range: draft.salaryRange, working_hours: draft.workingHours, company_name: draft.companyName, application_instructions: draft.applicationInstructions, application_email: draft.applicationEmail, application_email_subject: draft.applicationEmailSubject, application_zalo: draft.applicationZalo };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget;
    if (!form.checkValidity()) { setView('edit'); requestAnimationFrame(() => form.reportValidity()); return; }
    setBusy(true); setError('');
    try { await api(existing ? `/jobs/${existing.id}` : '/jobs', { method: existing ? 'PATCH' : 'POST', body: json({ ...draft, ...(existing?.revision ? { expectedRevision: existing.revision } : {}) }) }); onSaved(); }
    catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  return <Modal title={existing ? 'Chỉnh sửa JD' : 'Tạo JD tuyển dụng'} subtitle="Nhập đầy đủ thông tin công việc và xem trước nội dung ứng viên sẽ đọc." onClose={() => !busy && onClose()} wide className="jd-editor-modal">
    <form className="jd-editor" onSubmit={submit} noValidate>
      <div className="jd-editor-tools"><div role="tablist" aria-label="Chế độ biên soạn JD"><button type="button" role="tab" aria-selected={view === 'edit'} onClick={() => setView('edit')}><Pencil size={16}/>Nhập thông tin</button><button type="button" role="tab" aria-selected={view === 'preview'} onClick={() => setView('preview')}><Eye size={16}/>Xem trước JD</button></div>{!existing && <button type="button" className="text-button" disabled={busy} onClick={() => { setDraft(previous => ({ ...previous, ...CONTENT_MARKETING_JD })); setView('edit'); }}><FilePlus2 size={16}/>Điền mẫu Content Marketing</button>}</div>
      <div className="modal-body">
        <div className="jd-editor-fields" hidden={view !== 'edit'}>
          <section className="jd-editor-section" aria-labelledby="jd-general-heading"><h3 id="jd-general-heading"><span>01</span>Thông tin chung</h3><div className="form-grid">
            <Field label="Tên công ty" className="full"><input {...bind('companyName')} maxLength={200}/></Field>
            <Field label="Tên vị trí" className="full" required><input {...bind('title')} required minLength={2} maxLength={120} placeholder="Ví dụ: Chuyên viên Content Marketing"/></Field>
            <Field label="Bộ phận" required><input {...bind('department')} required maxLength={120} placeholder="Marketing"/></Field>
            <Field label="Ngành hàng"><select {...bind('businessLine')}><option value="">Chung · Super Net</option>{JOB_BRANDS.map(brand => <option value={brand.id} key={brand.id}>{brand.name} · {brand.category}</option>)}</select></Field>
            <Field label="Số lượng cần tuyển" required><input {...bind('openings')} type="number" min={1} max={1000} required/></Field>
            <Field label="Hình thức làm việc"><select {...bind('employmentType')}>{EMPLOYMENT_TYPES.map(type => <option key={type}>{type}</option>)}</select></Field>
            <Field label="Địa điểm làm việc" className="full" required><textarea {...bind('location')} required maxLength={200} rows={2} placeholder="Số nhà, đường, phường/xã, tỉnh/thành phố…"/></Field>
            <Field label="Mức lương"><input {...bind('salaryRange')} maxLength={200} placeholder="Ví dụ: 10 – 15 triệu VNĐ/tháng (tùy năng lực)"/></Field>
            <Field label="Thời gian làm việc"><input {...bind('workingHours')} maxLength={1000} placeholder="Ví dụ: Thứ 2 đến Thứ 7, 09:00 – 18:00"/></Field>
          </div></section>
          <section className="jd-editor-section" aria-labelledby="jd-content-heading"><h3 id="jd-content-heading"><span>02</span>Nội dung công việc</h3><p className="helper">Mỗi ý một dòng. Có thể dùng dấu “-” hoặc “•” đầu dòng để hiển thị thành danh sách.</p>
            <Field label="Mô tả công việc" required><textarea {...bind('description')} required minLength={20} maxLength={10000} rows={8} placeholder="Nhiệm vụ và trách nhiệm chính…"/></Field>
            <Field label="Yêu cầu ứng viên"><textarea {...bind('requirements')} maxLength={10000} rows={5} placeholder="Kinh nghiệm, kỹ năng, kiến thức…"/></Field>
            <Field label="Quyền lợi"><textarea {...bind('benefits')} maxLength={10000} rows={5} placeholder="Bảo hiểm, ngày nghỉ, môi trường và cơ hội phát triển…"/></Field>
          </section>
          <section className="jd-editor-section" aria-labelledby="jd-contact-heading"><h3 id="jd-contact-heading"><span>03</span>Cách thức ứng tuyển</h3><div className="form-grid">
            <Field label="Hướng dẫn ứng tuyển" className="full"><textarea {...bind('applicationInstructions')} maxLength={3000} rows={3} placeholder="Cách gửi hồ sơ, tài liệu cần gửi hoặc lưu ý dành cho ứng viên…"/></Field>
            <Field label="Email nhận CV"><input {...bind('applicationEmail')} type="email" maxLength={254} placeholder="tuyendung@congty.vn"/></Field>
            <Field label="Số Zalo liên hệ"><input {...bind('applicationZalo')} type="tel" maxLength={30} placeholder="09xx xxx xxx"/></Field>
            <Field label="Tiêu đề email ứng tuyển" className="full"><input {...bind('applicationEmailSubject')} maxLength={200} placeholder="[VỊ TRÍ] – [HỌ VÀ TÊN]"/></Field>
          </div></section>
          <section className="jd-editor-section" aria-labelledby="jd-publish-heading"><h3 id="jd-publish-heading"><span>04</span>Đăng tuyển</h3><div className="form-grid">
            <Field label="Hạn nhận hồ sơ" hint="Để trống nếu chưa chốt; tin quá hạn tự ẩn."><input {...bind('applicationDeadline')} type="date"/></Field>
            <Field label="Trạng thái hiển thị"><select {...bind('status')}><option value="open">Đang tuyển · Hiển thị công khai</option><option value="closed">Tạm dừng · Chưa hiển thị</option></select></Field>
          </div></section>
        </div>
        {view === 'preview' && <div className="jd-editor-preview"><span className="eyebrow">BẢN XEM TRƯỚC</span><h3>{preview.title}</h3><JDContent job={preview}/></div>}
        {error && <Alert>{error}</Alert>}
      </div>
      <footer className="modal-foot"><span><Mail size={15}/>Ứng viên có thể nộp CV trên website</span><div><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Hủy</button><button className="button primary" disabled={busy}><Check size={17}/>{busy ? 'Đang lưu…' : draft.status === 'open' ? 'Lưu & đăng JD' : 'Lưu JD'}</button></div></footer>
    </form>
  </Modal>;
}
