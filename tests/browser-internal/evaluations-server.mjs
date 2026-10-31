import { resolve } from 'node:path';
import { createApp } from '../../server/app.mjs';
import { bootstrapAdmin, createAccount } from '../../server/accounts.mjs';
import { id, now } from '../../server/db.mjs';

if(!process.send||!process.env.DATA_DIR||!process.env.SUPERNET_E2E_PASSWORD)throw new Error('Start only through isolated evaluation tests.');
const {app,db}=createApp({dataDir:resolve(process.env.DATA_DIR)}),password=process.env.SUPERNET_E2E_PASSWORD;
const users={admin:bootstrapAdmin(db,{username:'admin',password})};
for(const[role,username,name]of[['interviewer','evaluation.interviewer','Người phỏng vấn kiểm thử'],['interviewer','evaluation.other','Người phỏng vấn khác'],['hr','evaluation.hr','HR kiểm thử'],['boss','evaluation.boss','Sếp kiểm thử']])users[username]=createAccount(db,{username,name,role,password},users.admin.id);
const jobId=id(),timestamp=now();db.prepare('INSERT INTO jobs(id,title,department,location,description,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(jobId,'Chuyên viên Marketing','Marketing','TP. Hồ Chí Minh','Vị trí tổng hợp chỉ dùng trong kiểm thử đánh giá phỏng vấn.',timestamp,timestamp);
const fixtures=[];
for(let index=0;index<6;index++){
  const candidateId=id(),applicationId=id(),interviewId=id(),status=index===4?'scheduled':index===5?'cancelled':'completed',name=`Ứng viên đánh giá ${index+1}`;
  db.prepare('INSERT INTO candidates(id,full_name,email,source,created_by,received_at,created_at,updated_at,consent_status,owner_id) VALUES(?,?,?,?,?,?,?,?,?,?)').run(candidateId,name,`evaluation-${index}@example.com`,'Email',users.admin.id,timestamp,timestamp,timestamp,'granted',users.admin.id);
  db.prepare('INSERT INTO applications(id,candidate_id,job_id,source,received_at,created_at,created_by,stage) VALUES(?,?,?,?,?,?,?,?)').run(applicationId,candidateId,jobId,'Email',timestamp,timestamp,users.admin.id,status==='completed'?'interviewed':status==='scheduled'?'scheduled':'contacted');
  db.prepare('INSERT INTO interviews(id,application_id,interviewer_id,starts_at,ends_at,mode,location,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(interviewId,applicationId,users['evaluation.interviewer'].id,new Date(Date.now()+(status==='scheduled'?86400000:-7200000)-index*60000).toISOString(),new Date(Date.now()+(status==='scheduled'?88200000:-5400000)-index*60000).toISOString(),'Online','Phòng họp kiểm thử',status,users.admin.id,timestamp);
  fixtures.push({candidateId,interviewId,name});
}
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));process.send({baseURL:`http://127.0.0.1:${server.address().port}`,fixtures,reviewerId:users['evaluation.interviewer'].id});
let stopping=false;const stop=()=>{if(stopping)return;stopping=true;server.close(()=>{db.close();process.exit(0);});};process.on('SIGTERM',stop);process.on('SIGINT',stop);process.on('disconnect',stop);
