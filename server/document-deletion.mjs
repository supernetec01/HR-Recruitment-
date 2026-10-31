import { basename, resolve } from 'node:path';
import { rmSync } from 'node:fs';
import { z } from 'zod';
import { audit, now, transaction } from './db.mjs';

const fail = (status,message) => { throw Object.assign(new Error(message),{status}); };

// Deleted metadata keeps version numbers and historical interview references intact.
// A committed tombstone is also a durable cleanup queue if the filesystem is unavailable.
export function purgeDeletedDocumentFiles(db,dataDir,removeFile = rmSync) {
  let pending = 0;
  for (const row of db.prepare('SELECT id,stored_name FROM documents WHERE deleted_at IS NOT NULL AND purged_at IS NULL').all()) {
    try {
      if (!row.stored_name || basename(row.stored_name) !== row.stored_name || row.stored_name.startsWith('.')) throw new Error('Invalid storage name');
      removeFile(resolve(dataDir,'documents',row.stored_name),{force:true});
      db.prepare('UPDATE documents SET purged_at=? WHERE id=?').run(now(),row.id);
    } catch { pending++; }
  }
  return pending;
}

export function registerDocumentDeletion(app,{db,staff,editor,dataDir}) {
  let timer;
  const clean = () => {
    if (!db.isOpen) return;
    const pending = purgeDeletedDocumentFiles(db,dataDir);
    if (pending && !timer) {
      console.warn('Document cleanup pending; retrying in 30 seconds.');
      timer = setTimeout(() => {timer = undefined;clean();},30000);
      timer.unref();
    }
  };
  clean();
  app.delete('/api/v1/candidates/:candidateId/documents/:id',staff,editor,(req,res) => {
    const {expectedRevision} = z.object({expectedRevision:z.number().int().min(1)}).parse(req.body);
    transaction(db,() => {
      const doc = db.prepare('SELECT * FROM documents WHERE id=? AND candidate_id=?').get(req.params.id,req.params.candidateId);
      if (!doc) fail(404,'Không tìm thấy tài liệu trong hồ sơ này.');
      // Retrying a completed delete is safe, even if its successful response was lost.
      if (doc.deleted_at) return;
      const candidate = db.prepare('SELECT revision FROM candidates WHERE id=?').get(doc.candidate_id);
      if (candidate.revision !== expectedRevision) fail(409,'Hồ sơ đã thay đổi. Hãy tải lại danh sách tài liệu và kiểm tra trước khi xóa.');
      const active = db.prepare(`SELECT r.id FROM interview_requests r LEFT JOIN interviews i ON i.request_id=r.id AND i.status='scheduled'
        WHERE r.document_id=? AND (r.status='pending' OR i.id IS NOT NULL) LIMIT 1`).get(doc.id);
      if (active) fail(409,'Tài liệu đang được dùng cho yêu cầu hoặc lịch phỏng vấn chưa hoàn tất. Hãy xử lý yêu cầu hoặc lịch phỏng vấn đó trước khi xóa.');
      const timestamp = now();
      db.prepare('UPDATE documents SET deleted_at=?,deleted_by=? WHERE id=?').run(timestamp,req.user.id,doc.id);
      db.prepare('DELETE FROM document_translations WHERE document_id=?').run(doc.id);
      db.prepare('UPDATE candidates SET updated_at=?,revision=revision+1 WHERE id=?').run(timestamp,doc.candidate_id);
      audit(db,doc.candidate_id,req.user.id,'document.deleted',{documentId:doc.id,name:doc.original_name,version:doc.version,revision:candidate.revision+1});
    });
    // Never remove the file before the database transaction and audit have committed.
    clean();
    res.json({ok:true});
  });
}
