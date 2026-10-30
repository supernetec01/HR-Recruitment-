import { resolve } from 'node:path';
import { createApp } from '../../server/app.mjs';
import { bootstrapAdmin } from '../../server/accounts.mjs';
import { createTranslationSettingsStore } from '../../server/translation-settings.mjs';
import { randomBytes } from 'node:crypto';
if (!process.env.SUPERNET_E2E_PASSWORD || !process.env.DATA_DIR) throw new Error('Only start this test helper through Playwright with isolated test data.');
// Local fixture only: browser tests never call an external provider or send real CVs.
const translationFetch = async (_url,options) => {
  const body = JSON.parse(options.body), record = 'description' in body.text.format.schema.properties;
  const value = record ? {title:'内容营销专员（测试）',department:'市场部',location:'Super Net 测试办公室',employment_type:'全职',description:'负责内容策划和制作。',requirements:'具备沟通及写作能力。',benefits:'按照公司政策享受福利。',working_hours:'周一至周五',salary_range:'面议',application_instructions:'请通过网站提交简历。',application_email_subject:'[内容营销] – [姓名]'} : {text:body.instructions.includes('Simplified Chinese') ? '候选人简历\n工作经历：内容营销。\n专业技能：文案写作与沟通。' : 'Bản dịch CV kiểm thử\nKinh nghiệm và kỹ năng.'};
  return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]}),{headers:{'Content-Type':'application/json'}});
};
const translationSettingsStore = createTranslationSettingsStore({dataDir:resolve(process.env.DATA_DIR),environment:{},legacyFile:resolve(process.env.DATA_DIR,'no-env-file')});
const { app, db } = createApp({ dataDir: resolve(process.env.DATA_DIR), demo: false, translationSettingsStore, translationFetch, loginLimit:300 });
bootstrapAdmin(db, { username: 'admin', name: 'Admin Kiểm Thử', password: process.env.SUPERNET_E2E_PASSWORD });
translationSettingsStore.save({apiKey:`sk-test-${randomBytes(24).toString('hex')}`,model:'local-test-model',expectedRevision:0});
const server = app.listen(3110, '127.0.0.1');
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
