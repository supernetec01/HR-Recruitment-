import { z } from 'zod';
import { audit, now } from './db.mjs';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const schema=z.object({
  score:z.number().min(0).max(10).multipleOf(0.1),
  result:z.enum(['pass','follow_up','fail']),
  comments:z.string().trim().min(10,'Nhận xét cần ít nhất 10 ký tự.').max(5000),
  expectedRevision:z.number().int().min(0),
});
export function getInterviewEvaluation(db,interviewId) {
  return db.prepare(`SELECT e.*,u.name AS reviewer_name FROM interview_evaluations e
    JOIN users u ON u.id=e.reviewer_id WHERE e.interview_id=?`).get(interviewId) || null;
}
export function withInterviewEvaluation(db,interview) {
  return {...interview,evaluation:getInterviewEvaluation(db,interview.id)};
}
export function registerInterviewEvaluations(app,{db,staff,idempotent}) {
  const interview=interviewId=>{
    const row=db.prepare(`SELECT i.*,a.candidate_id FROM interviews i JOIN applications a ON a.id=i.application_id WHERE i.id=?`).get(interviewId);
    if(!row)fail(404,'Không tìm thấy buổi phỏng vấn.');return row;
  };
  app.get('/api/v1/interviews/:id/evaluation',staff,(req,res)=>{
    const row=interview(req.params.id);
    res.json({evaluation:getInterviewEvaluation(db,row.id),canEvaluate:row.status==='completed' && row.interviewer_id===req.user.id && new Date(row.starts_at)<=new Date()});
  });
  app.put('/api/v1/interviews/:id/evaluation',staff,(req,res)=>{
    const data=schema.parse(req.body);
    idempotent(req,res,`interview-evaluation:${req.user.id}:${req.params.id}`,()=>{
      const row=interview(req.params.id);
      if(row.interviewer_id!==req.user.id)fail(403,'Chỉ người được phân công phỏng vấn được viết hoặc sửa đánh giá này.');
      if(row.status!=='completed' || new Date(row.starts_at)>new Date())fail(409,'Chỉ đánh giá sau khi buổi phỏng vấn đã được đánh dấu hoàn thành.');
      const current=getInterviewEvaluation(db,row.id);
      if(data.expectedRevision!==(current?.revision || 0))fail(409,'Đánh giá đã được cập nhật. Hãy tải lại bản mới trước khi tiếp tục chỉnh sửa.');
      const timestamp=now();
      if(current){
        db.prepare('UPDATE interview_evaluations SET score=?,result=?,comments=?,revision=revision+1,updated_at=? WHERE interview_id=?').run(data.score,data.result,data.comments,timestamp,row.id);
      }else{
        db.prepare('INSERT INTO interview_evaluations(interview_id,reviewer_id,score,result,comments,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(row.id,req.user.id,data.score,data.result,data.comments,timestamp,timestamp);
      }
      const evaluation=getInterviewEvaluation(db,row.id);
      audit(db,row.candidate_id,req.user.id,current?'interview.evaluation_updated':'interview.evaluated',{
        interviewId:row.id,applicationId:row.application_id,revision:evaluation.revision,
        ...(current?{before:{score:current.score,result:current.result,comments:current.comments}}:{}),
        after:{score:evaluation.score,result:evaluation.result,comments:evaluation.comments},
      });
      return {evaluation};
    });
  });
}
