import { Worker } from 'node:worker_threads';
import { resolve } from 'node:path';
import { audit } from './db.mjs';

export function extractDocument(path, mime) {
  return new Promise((resolveResult,reject) => {
    const worker = new Worker(new URL('./document-worker.mjs',import.meta.url), { execArgv:[], workerData: { path, mime }, resourceLimits: { maxOldGenerationSizeMb: 192, stackSizeMb: 4 } });
    const failure = message => Object.assign(new Error(message),{status:422});
    let finished = false;
    const finish = (error,result) => { if (finished) return; finished = true; clearTimeout(timer); void worker.terminate(); error ? reject(error) : resolveResult(result); };
    const timer = setTimeout(() => finish(failure('Đọc CV quá thời gian cho phép. Vui lòng thử bản PDF hoặc DOCX nhỏ hơn.')),15000);
    worker.once('message',result => result.error ? finish(failure(result.error)) : finish(null,result));
    worker.once('error',() => finish(failure('Không xử lý được tài liệu này. Vui lòng thử một bản CV khác.')));
    worker.once('exit',() => { if (!finished) finish(failure('Không xử lý được tài liệu này.')); });
  });
}

export function registerDocumentPreview(app,{db,staff,dataDir}) {
  const getDocument = value => {
    const document = db.prepare('SELECT * FROM documents WHERE id=? AND deleted_at IS NULL').get(value);
    if (!document) throw Object.assign(new Error('Không tìm thấy tài liệu.'),{status:404});
    return document;
  };
  app.get('/api/v1/documents/:id/text',staff,async (req,res) => {
    const document = getDocument(req.params.id);
    const content = await extractDocument(resolve(dataDir,'documents',document.stored_name),document.mime_type);
    getDocument(document.id); // A delete may have committed while extraction was running.
    audit(db,document.candidate_id,req.user.id,'document.viewed',{documentId:document.id,version:document.version,mode:'text'});
    res.json({...content,documentId:document.id,checksum:document.checksum});
  });
}
