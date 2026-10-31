import { lazy, Suspense, useEffect, useState } from 'react';
import { t } from './locale';
import { createPortal } from 'react-dom';
import { Download, Eye, LoaderCircle, Trash2 } from 'lucide-react';
import { api, ApiError, errorMessage, json } from './api';
import { Alert, Modal, Spinner } from './ui';
import type { Document } from './types';

const DocumentViewer = lazy(() => import('./document-viewer'));

type CV = Pick<Document, 'id' | 'original_name' | 'mime_type' | 'version'>;
export function DocumentDeleteDialog({document,candidateId,revision,onClose,onDeleted,onReload}:{document:CV;candidateId:string;revision:number;onClose:()=>void;onDeleted:()=>void;onReload:()=>void}) {
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [conflict,setConflict] = useState(false);
  async function remove() {
    if (busy) return;
    setBusy(true);setError('');setConflict(false);
    try {
      await api(`/candidates/${encodeURIComponent(candidateId)}/documents/${encodeURIComponent(document.id)}`,{method:'DELETE',body:json({expectedRevision:revision})});
      onDeleted();
    } catch(error) {setError(errorMessage(error));setConflict(error instanceof ApiError && [404,409].includes(error.status));}
    finally {setBusy(false);}
  }
  return <Modal title={t('Xóa tài liệu')} subtitle={`${document.original_name} · ${t('Phiên bản ')}${document.version}`} className="document-delete-modal" onClose={()=>!busy && onClose()}>
    <div className="modal-body"><p>{t('Tài liệu và các bản dịch đã lưu sẽ bị xóa. Bạn không thể hoàn tác thao tác này trong ứng dụng.')}</p><p className="helper">{t('Thông tin ứng viên, lượt ứng tuyển và các tài liệu khác được giữ nguyên. Hành động xóa được ghi vào lịch sử hồ sơ.')}</p>{error && <Alert>{t(error)}</Alert>}{conflict && <button className="text-button" disabled={busy} onClick={onReload}>{t('Tải lại danh sách tài liệu')}</button>}</div>
    <footer className="modal-foot"><div><button type="button" className="button secondary" disabled={busy} onClick={onClose}>{t('Hủy')}</button><button type="button" className="button danger" disabled={busy} onClick={()=>void remove()}>{busy ? <LoaderCircle size={16} className="spin" aria-hidden="true"/> : <Trash2 size={16} aria-hidden="true"/>}{t(busy?'Đang xóa…':'Xác nhận xóa')}</button></div></footer>
  </Modal>;
}

async function fetchFile(document: CV, action: 'preview' | 'download', signal?: AbortSignal) {
  let response: Response;
  try {
    response = await fetch(`/api/v1/documents/${encodeURIComponent(document.id)}/${action}`, {
      credentials: 'same-origin', headers: { 'X-Requested-With': 'SuperNet' }, signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new Error('Không kết nối được để tải CV. Vui lòng kiểm tra mạng và thử lại.');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Không tải được CV. Vui lòng thử lại.' }));
    throw new ApiError(response.status, data);
  }
  return response.blob();
}

function OtherPreview({ document, onClose, onDownload, downloading, downloadError }: {
  document: CV; onClose: () => void; onDownload: () => void; downloading: boolean; downloadError: string;
}) {
  const [url, setUrl] = useState(''), [text, setText] = useState(''), [error, setError] = useState(''), [loaded, setLoaded] = useState(false);
  const image = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(document.mime_type);
  const plainText = document.mime_type === 'text/plain';
  const supported = image || plainText;
  useEffect(() => {
    const controller = new AbortController(); let active = true, objectUrl = '';
    (async () => {
      try {
        if (!supported) return;
        const blob = await fetchFile(document, 'preview', controller.signal);
        if (image) {
          if (!active) return;
          objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
        } else if (active) setText((await blob.text()).slice(0, 500000));
      } catch (err) { if (active) setError(errorMessage(err)); }
      finally { if (active) setLoaded(true); }
    })();
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [document.id, image, supported]);
  return createPortal(<Modal title={t("Xem CV")} subtitle={`${document.original_name} · ${t("Phiên bản ")}${document.version}`} onClose={onClose} wide>
    {!loaded ? <Spinner label={t("Đang tải CV…")}/> : error ? <div className="modal-body"><Alert>{t(error)}</Alert></div> : !supported ? <div className="modal-body"><p>{t('Đã lưu bản gốc. Định dạng này chưa hỗ trợ xem trực tiếp; chọn Tải CV để mở bằng phần mềm phù hợp.')}</p></div> : image ? <div className="modal-body image-preview"><img src={url} alt={`CV ${document.original_name}`}/></div> : <div className="modal-body docx-preview"><p className="helper">{t('Xem tối đa 500.000 ký tự. Tải bản gốc để xem toàn bộ nội dung.')}</p>{text ? <pre>{text}</pre> : <Alert>{t('CV không có văn bản có thể trích xuất. Hãy tải bản gốc để xem nội dung.')}</Alert>}</div>}
    {downloadError && <div className="modal-body"><Alert>{t(downloadError)}</Alert></div>}
    <footer className="modal-foot"><span>{t('CV gốc được lưu trong hồ sơ · Chỉ nhân sự đã đăng nhập được truy cập')}</span><button type="button" className="button secondary" disabled={downloading} onClick={onDownload}><Download size={16}/>{downloading ? t('Đang tải…') : t('Tải CV')}</button></footer>
  </Modal>, window.document.body);
}

export function DocumentActions({ document, candidateName, allowTranslation = true }: { document: CV; candidateName?: string; allowTranslation?: boolean }) {
  const rich = ['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(document.mime_type);
  const [initialView,setInitialView] = useState<'original' | 'translation'>('original');
  const [preview, setPreview] = useState(false), [downloading, setDownloading] = useState(false), [error, setError] = useState('');
  async function download() {
    if (downloading) return;
    setDownloading(true); setError('');
    try {
      const blob = await fetchFile(document, 'download');
      const url = URL.createObjectURL(blob), link = window.document.createElement('a');
      link.href = url; link.download = document.original_name;
      window.document.body.append(link); link.click(); link.remove();
      // Give the browser time to consume the download before releasing its blob.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { setError(errorMessage(err)); }
    finally { setDownloading(false); }
  }
  return <div className="document-actions"><div className="hero-actions">
    <button type="button" className="button secondary small-button" onClick={() => { setError(''); setInitialView('original'); setPreview(true); }}><Eye size={15}/>{t("Xem CV")}</button>
    <button type="button" className="button secondary small-button" aria-label={t("Tải {p0}",{p0:document.original_name})} disabled={downloading} onClick={() => void download()}>{downloading ? <LoaderCircle size={15} className="spin"/> : <Download size={15}/>}{t("Tải xuống")}</button>
    {rich && allowTranslation && <button type="button" className="text-button" onClick={() => {setError('');setInitialView('translation');setPreview(true);}}>{t("Dịch CV 中文")}</button>}
  </div>{error && !preview && <Alert>{t(error)}</Alert>}
    {preview && (rich ? createPortal(<Suspense fallback={<div className="modal-backdrop"><Spinner/></div>}><DocumentViewer document={document} candidateName={candidateName} onClose={() => setPreview(false)} onDownload={() => void download()} downloading={downloading} downloadError={error} initialView={initialView} allowTranslation={allowTranslation}/></Suspense>,window.document.body) : <OtherPreview document={document} onClose={() => setPreview(false)} onDownload={() => void download()} downloading={downloading} downloadError={error}/>)}
  </div>;
}
