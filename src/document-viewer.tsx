import { t } from './locale';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileText, ZoomIn, ZoomOut } from 'lucide-react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { api, errorMessage } from './api';
import { Alert, Field, Modal, Spinner } from './ui';
import type { Document } from './types';
import { CVTranslationPanel } from './translation';
GlobalWorkerOptions.workerSrc = workerUrl;

export default function DocumentViewer({ document, candidateName = '', onClose, onDownload, downloading, downloadError, allowTranslation = true, initialView = 'original' }: { document: Pick<Document,'id' | 'original_name' | 'mime_type' | 'version'>; candidateName?: string; onClose: () => void; onDownload: () => void; downloading: boolean; downloadError: string; allowTranslation?: boolean; initialView?: 'original' | 'translation' }) {
  const [view,setView] = useState(initialView);
  const [pdf,setPdf] = useState<PDFDocumentProxy | null>(null), [text,setText] = useState(''), [error,setError] = useState('');
  const [loading,setLoading] = useState(true), [rendering,setRendering] = useState(false), [page,setPage] = useState(1), [zoom,setZoom] = useState(1);
  const [passwordRequired,setPasswordRequired] = useState(false), [password,setPassword] = useState('');
  const passwordCallback = useRef<((password: string) => void) | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null), viewport = useRef<HTMLDivElement>(null), [width,setWidth] = useState(700);
  const isPDF = document.mime_type === 'application/pdf';
  useEffect(() => {
    let active = true; const controller = new AbortController(); let task: ReturnType<typeof getDocument> | undefined;
    setLoading(true); setError(''); setPage(1); setPdf(null); setText('');
    (async () => {
      try {
        if (isPDF) {
          const response = await fetch(`/api/v1/documents/${document.id}/preview`,{credentials:'same-origin',signal:controller.signal});
          if (!response.ok) throw new Error((await response.json()).message || 'Không mở được CV.');
          task = getDocument({data:new Uint8Array(await response.arrayBuffer()),enableXfa:false,maxImageSize:16_777_216,cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdfjs/standard_fonts/',wasmUrl:'/pdfjs/wasm/'});
          task.onPassword = (callback: (password: string) => void) => { if (active) { passwordCallback.current = callback; setPasswordRequired(true); } };
          const loaded = await task.promise;
          if (loaded.numPages > 50) { await task.destroy(); throw new Error('CV vượt quá 50 trang. Vui lòng chia nhỏ tài liệu.'); }
          if (active) { setPdf(loaded); setPasswordRequired(false); }
        } else {
          const content = await api<{text:string}>(`/documents/${document.id}/text`,{signal:controller.signal});
          if (active) setText(content.text || 'Tài liệu không có nội dung văn bản.');
        }
      } catch (error) { if (active && !controller.signal.aborted) setError(errorMessage(error)); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; controller.abort(); if (task) void task.destroy(); };
  },[document.id,isPDF]);
  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(240,entries[0].contentRect.width - 24)));
    observer.observe(viewport.current); return () => observer.disconnect();
  },[loading,view]);
  useEffect(() => {
    if (!pdf || !canvas.current || view !== 'original') return;
    let active = true, task: RenderTask | undefined;
    setRendering(true); setError('');
    (async () => {
      try {
        const current = await pdf.getPage(page);
        if (!active || !canvas.current) return;
        const base = current.getViewport({scale:1}), ratio = Math.min(window.devicePixelRatio || 1,2);
        if (![base.width,base.height].every(value => Number.isFinite(value) && value > 0)) throw new Error('Invalid PDF page size');
        const scale = Math.min(width / base.width * zoom,3,8192 / Math.max(base.width,base.height) / ratio,Math.sqrt(16_777_216 / (base.width * base.height)) / ratio);
        const view = current.getViewport({scale});
        const element = canvas.current;
        element.width = Math.ceil(view.width * ratio); element.height = Math.ceil(view.height * ratio);
        element.style.width = `${view.width}px`; element.style.height = `${view.height}px`;
        task = current.render({canvas:element,viewport:view,transform:ratio === 1 ? undefined : [ratio,0,0,ratio,0,0]});
        await task.promise;
      } catch (error) { if (active && error instanceof Error && error.name !== 'RenderingCancelledException') setError('Không hiển thị được trang PDF này. Hãy thử tải lại hoặc xem trang khác.'); }
      finally { if (active) setRendering(false); }
    })();
    return () => { active = false; task?.cancel(); };
  },[pdf,page,zoom,width,view]);
  return <Modal title={t("Xem CV")} subtitle={`${candidateName ? `${candidateName} · ` : ''}${document.original_name}`} onClose={onClose} wide className="cv-viewer-modal"><div className="cv-viewer">
    <div className="cv-tabs" role="tablist" aria-label={t("Nội dung CV")}><button role="tab" aria-selected={view === 'original'} onClick={() => setView('original')}>{t("CV gốc")}</button>{allowTranslation && <button role="tab" aria-selected={view === 'translation'} onClick={() => setView('translation')}>{t("Bản dịch CV")}</button>}</div>
    {view === 'original' && isPDF && pdf && <div className="cv-toolbar"><div><button className="icon-button" aria-label={t("Trang CV trước")} disabled={page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={18}/></button><span>{t("Trang ")}{page} / {pdf.numPages}</span><button className="icon-button" aria-label={t("Trang CV sau")} disabled={page >= pdf.numPages} onClick={() => setPage(value => value + 1)}><ChevronRight size={18}/></button></div><div><button className="icon-button" aria-label={t("Thu nhỏ CV")} disabled={zoom <= .6} onClick={() => setZoom(value => Math.max(.6,value - .2))}><ZoomOut size={17}/></button><span>{Math.round(zoom * 100)}%</span><button className="icon-button" aria-label={t("Phóng to CV")} disabled={zoom >= 2} onClick={() => setZoom(value => Math.min(2,value + .2))}><ZoomIn size={17}/></button></div></div>}
    {view === 'original' && (passwordRequired ? <form className="cv-password" onSubmit={event => { event.preventDefault(); passwordCallback.current?.(password); setPasswordRequired(false); setPassword(''); }}><Field label={t("Mật khẩu PDF")} required><input type="password" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="off"/></Field><button className="button primary">{t("Mở tài liệu")}</button></form> : loading ? <Spinner label={t("Đang mở CV…")}/> : null)}
    {view === 'original' && error && <Alert>{t(error)}</Alert>}
    {view === 'translation' && allowTranslation && <CVTranslationPanel documentId={document.id}/>}
    <div ref={viewport} hidden={view !== 'original'} className={`cv-pages ${isPDF ? '' : 'cv-text'}`}>
      {isPDF ? <>{rendering && <span className="cv-rendering" role="status">{t("Đang hiển thị trang…")}</span>}<canvas ref={canvas} aria-label={`CV ${candidateName}, trang ${page}`} data-testid="cv-canvas" hidden={!pdf || !!error}/></> : !loading && !error && <><h3><FileText size={18}/>{t("Nội dung CV")}</h3><p>{text}</p></>}
    </div>
    {downloadError && <Alert>{t(downloadError)}</Alert>}
  </div><footer className="modal-foot"><span>{t("CV gốc · ")}{document.mime_type === 'application/pdf' ? 'PDF' : 'DOCX'}</span><button type="button" className="button secondary" disabled={downloading} onClick={onDownload}><Download size={16}/>{downloading ? t('Đang tải…') : t("Tải CV")}</button><button className="button secondary" onClick={onClose}>{t("Đóng")}</button></footer></Modal>;
}
