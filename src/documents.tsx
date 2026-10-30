import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Eye, LoaderCircle } from 'lucide-react';
import { ApiError, errorMessage } from './api';
import { Alert, Modal, Spinner } from './ui';
import type { Document } from './types';

type CV = Pick<Document, 'id' | 'original_name' | 'mime_type' | 'version'>;
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

function CVPreview({ document, onClose, onDownload, downloading, downloadError }: {
  document: CV; onClose: () => void; onDownload: () => void; downloading: boolean; downloadError: string;
}) {
  const [url, setUrl] = useState(''), [text, setText] = useState(''), [error, setError] = useState(''), [loaded, setLoaded] = useState(false);
  const pdf = document.mime_type === 'application/pdf';
  useEffect(() => {
    const controller = new AbortController(); let active = true, objectUrl = '';
    (async () => {
      try {
        const blob = await fetchFile(document, 'preview', controller.signal);
        if (pdf) {
          if (!active) return;
          objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
        } else {
          // Extract text locally; never render uploaded HTML or send a CV to an external viewer.
          const { default: mammoth } = await import('mammoth');
          const result = await mammoth.extractRawText({ arrayBuffer: await blob.arrayBuffer() });
          if (active) setText(result.value.trim());
        }
      } catch (err) { if (active) setError(errorMessage(err)); }
      finally { if (active) setLoaded(true); }
    })();
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [document.id, pdf]);
  return createPortal(<Modal title="Xem CV" subtitle={`${document.original_name} · Phiên bản ${document.version}`} onClose={onClose} wide>
    {!loaded ? <Spinner label="Đang tải CV…"/> : error ? <div className="modal-body"><Alert>{error}</Alert></div> : pdf ? <div className="pdf-preview"><iframe title={`CV ${document.original_name}`} src={url}/></div> : <div className="modal-body docx-preview"><p className="helper">Nội dung văn bản của CV DOCX. Tải bản gốc để xem đầy đủ bố cục và hình ảnh.</p>{text ? <pre>{text}</pre> : <Alert>CV không có văn bản có thể trích xuất. Hãy tải bản gốc để xem nội dung.</Alert>}</div>}
    {downloadError && <div className="modal-body"><Alert>{downloadError}</Alert></div>}
    <footer className="modal-foot"><span>CV gốc được lưu trong hồ sơ · Chỉ nhân sự đã đăng nhập được truy cập</span><button type="button" className="button secondary" disabled={downloading} onClick={onDownload}><Download size={16}/>{downloading ? 'Đang tải…' : 'Tải CV'}</button></footer>
  </Modal>, window.document.body);
}

export function DocumentActions({ document }: { document: CV }) {
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
    <button type="button" className="button secondary small-button" onClick={() => { setError(''); setPreview(true); }}><Eye size={15}/>Xem CV</button>
    <button type="button" className="button secondary small-button" aria-label={`Tải ${document.original_name}`} disabled={downloading} onClick={() => void download()}>{downloading ? <LoaderCircle size={15} className="spin"/> : <Download size={15}/>}Tải xuống</button>
  </div>{error && !preview && <Alert>{error}</Alert>}
    {preview && <CVPreview document={document} onClose={() => setPreview(false)} onDownload={() => void download()} downloading={downloading} downloadError={error}/>}
  </div>;
}
