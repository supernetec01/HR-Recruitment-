import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { X, Check, LoaderCircle, FileText, UploadCloud, AlertCircle } from 'lucide-react';
import { STAGES } from './api';

export function Avatar({ name, small = false, index = 0 }: { name: string; small?: boolean; index?: number }) {
  const words = name.trim().split(/\s+/);
  const initials = words.length > 1 ? words[words.length - 2][0] + words[words.length - 1][0] : name.slice(0, 2) || '?';
  return <span className={`avatar avatar-${index % 6} ${small ? 'small' : ''}`} aria-hidden="true">{initials.toUpperCase()}</span>;
}
export function Stage({ stage }: { stage: string }) {
  const info = STAGES[stage] || STAGES.new;
  return <span className={`stage ${info.color}`}><span />{info.label}</span>;
}
export function Modal({ title, subtitle, children, onClose, wide = false, className = '' }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const original = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab') {
        const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || []).filter(el => el.getClientRects().length > 0);
        if (!nodes.length) { event.preventDefault(); return; }
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', listener);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', listener); original?.focus(); };
  }, []);
  return <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={`modal ${wide ? 'wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1} ref={ref}>
      <header className="modal-head"><div><span className="eyebrow">SUPER NET RECRUITMENT</span><h2 id="modal-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="Đóng" onClick={onClose}><X size={20}/></button></header>
      {children}
    </div>
  </div>;
}
export function Field({ label, children, hint, required = false, className = '' }: { label: string; children: ReactNode; hint?: string; required?: boolean; className?: string }) {
  const controlId = useId();
  const control = isValidElement(children) && typeof children.type === 'string' && ['input','select','textarea'].includes(children.type);
  return <div className={`field ${className}`}>{control ? <label htmlFor={controlId}>{label}{required && <b className="required" aria-hidden="true"> *</b>}</label> : <span>{label}{required && <b className="required" aria-hidden="true"> *</b>}</span>}{control ? cloneElement(children as ReactElement<{ id?: string }>, { id: controlId }) : children}{hint && <small>{hint}</small>}</div>;
}
export function Alert({ children, success = false }: { children: ReactNode; success?: boolean }) { return <div className={`alert ${success ? 'success' : ''}`} role={success ? 'status' : 'alert'}>{success ? <Check size={17}/> : <AlertCircle size={17}/>}<span>{children}</span></div>; }
export function Spinner({ label = 'Đang tải dữ liệu…' }: { label?: string }) { return <div className="loading" role="status"><LoaderCircle size={24} className="spin"/>{label}</div>; }
export function FileInput({ file, onChange, required = false }: { file: File | null; onChange: (file: File | null) => void; required?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [invalid, setInvalid] = useState('');
  const select = (value: File | null) => {
    const message = value && (value.size > 10 * 1024 * 1024 || value.size === 0) ? 'Chọn tệp không rỗng, tối đa 10 MB.' : '';
    setInvalid(message);
    onChange(message ? null : value);
  };
  return <div className="file-field"><label className={`file-drop ${file ? 'has-file' : ''}`} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); select(e.dataTransfer.files[0] || null); }}>
    <input ref={ref} type="file" name="file" aria-label="Tải CV" required={required && !file} onChange={e => select(e.target.files?.[0] || null)}/>
    <span className="upload-icon">{file ? <FileText size={24}/> : <UploadCloud size={24}/>}</span><strong>{file ? file.name : 'Chọn tệp hoặc kéo thả CV vào đây'}</strong>
    <span>{file ? `${(file.size / 1024).toFixed(0)} KB · Nhấn để thay tệp` : 'Mọi định dạng · Tối đa 10 MB · Quét mã độc trước khi lưu'}</span>
  </label><span className="field-error" role="alert">{invalid}</span>{file && <button type="button" className="text-button" onClick={() => { onChange(null); if (ref.current) ref.current.value = ''; }}>Bỏ tệp đã chọn</button>}</div>;
}
export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) { return <div className="empty"><div className="empty-icon">{icon || <FileText size={26}/>}</div><h3>{title}</h3><p>{children}</p></div>; }
