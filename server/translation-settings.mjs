import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

const failure = (status,message) => { throw Object.assign(new Error(message),{status,publicMessage:message}); };
const associatedData = Buffer.from('supernet.translation-settings.v1');

export function createTranslationSettingsStore({dataDir,clock = () => new Date(),environment = process.env,legacyFile = resolve('.env.translation')} = {}) {
  const directory = resolve(dataDir), path = resolve(directory,'translation-settings.json'), masterPath = resolve(directory,'.translation-master-key');
  const fallback = existsSync(legacyFile) ? parseEnv(readFileSync(legacyFile,'utf8')) : {};
  function read() {
    if (!existsSync(path)) return null;
    try {
      const value = JSON.parse(readFileSync(path,'utf8'));
      if (value.version !== 1 || !Number.isInteger(value.revision) || (!value.encryptedKey && value.inheritKey !== true)) throw new Error('Invalid settings');
      return value;
    } catch { return failure(503,'Không đọc được cấu hình dịch. Quản trị viên cần kiểm tra bản sao lưu cấu hình.'); }
  }
  function master() {
    mkdirSync(directory,{recursive:true,mode:0o700});
    if (!existsSync(masterPath)) {
      try { writeFileSync(masterPath,randomBytes(32),{mode:0o600,flag:'wx'}); }
      catch(error) { if (error.code !== 'EEXIST') throw error; }
    }
    chmodSync(masterPath,0o600);
    const key = readFileSync(masterPath);
    if (key.length !== 32) failure(503,'Khóa bảo vệ cấu hình không hợp lệ. Cần khôi phục cả thư mục dữ liệu đã sao lưu.');
    return key;
  }
  function decrypt(value) {
    if (!existsSync(masterPath)) failure(503,'Thiếu khóa bảo vệ cấu hình. Cần khôi phục cả thư mục dữ liệu đã sao lưu.');
    try {
      const cipher = createDecipheriv('aes-256-gcm',master(),Buffer.from(value.iv,'base64'));
      cipher.setAAD(associatedData); cipher.setAuthTag(Buffer.from(value.tag,'base64'));
      return Buffer.concat([cipher.update(Buffer.from(value.data,'base64')),cipher.final()]).toString('utf8');
    } catch { return failure(503,'Không giải mã được cấu hình dịch. Cần khôi phục cả thư mục dữ liệu đã sao lưu.'); }
  }
  function encrypt(key) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm',master(),iv);
    cipher.setAAD(associatedData);
    return {iv:iv.toString('base64'),data:Buffer.concat([cipher.update(key,'utf8'),cipher.final()]).toString('base64'),tag:cipher.getAuthTag().toString('base64')};
  }
  function write(value) {
    mkdirSync(directory,{recursive:true,mode:0o700});
    const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
    try { writeFileSync(temporary,JSON.stringify(value),{mode:0o600,flag:'wx'}); renameSync(temporary,path); chmodSync(path,0o600); }
    finally { if (existsSync(temporary)) unlinkSync(temporary); }
  }
  function active() {
    const saved = read();
    return {
      apiKey:saved?.encryptedKey ? decrypt(saved.encryptedKey) : environment.SUPERNET_TRANSLATION_API_KEY || environment.OPENAI_API_KEY || fallback.OPENAI_API_KEY || '',
      model:saved?.model || environment.TRANSLATION_MODEL || fallback.TRANSLATION_MODEL || 'gpt-4.1-mini',
      revision:saved?.revision || 0, keyUpdatedAt:saved?.keyUpdatedAt || null, reminderDays:saved?.reminderDays || 30,
      lastTestAt:saved?.lastTestAt || null,lastTestResult:saved?.lastTestResult || 'untested',
      source:saved?.encryptedKey ? 'admin' : environment.SUPERNET_TRANSLATION_API_KEY || environment.OPENAI_API_KEY ? 'environment' : fallback.OPENAI_API_KEY ? 'file' : 'none',
    };
  }
  function status() {
    const {apiKey,...value} = active();
    const nextReminderAt = value.keyUpdatedAt ? new Date(+new Date(value.keyUpdatedAt) + value.reminderDays * 86400000).toISOString() : null;
    return {...value,configured:!!apiKey,provider:'OpenAI',nextReminderAt,reminderDue:!!nextReminderAt && +clock() >= +new Date(nextReminderAt)};
  }
  function save({apiKey,model,reminderDays = 30,expectedRevision},actorId = null) {
    const current = active();
    if (expectedRevision !== undefined && expectedRevision !== current.revision) failure(409,'Cấu hình dịch đã được thay đổi. Tải lại trước khi lưu.');
    const nextKey = apiKey || current.apiKey;
    if (!nextKey) failure(400,'Cần nhập khóa API để bật dịch.');
    const changed = !!apiKey && apiKey !== current.apiKey;
    const timestamp = clock().toISOString();
    const previous = read();
    write({version:1,revision:current.revision+1,encryptedKey:apiKey ? encrypt(nextKey) : previous?.encryptedKey || null,inheritKey:!apiKey && !previous?.encryptedKey,model:model || current.model,reminderDays,
      keyUpdatedAt:apiKey && (changed || !current.keyUpdatedAt) ? timestamp : current.keyUpdatedAt,updatedAt:timestamp,updatedBy:actorId,
      lastTestAt:changed || (model && model !== current.model) ? null : previous?.lastTestAt || null,
      lastTestResult:changed || (model && model !== current.model) ? 'untested' : previous?.lastTestResult || 'untested'});
    return status();
  }
  function recordTest(revision,result) {
    const saved = read();
    if (saved && saved.revision === revision) write({...saved,lastTestAt:clock().toISOString(),lastTestResult:result});
    return status();
  }
  return {active,status,save,recordTest};
}
