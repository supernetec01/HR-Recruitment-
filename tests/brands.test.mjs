import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createApp } from '../server/app.mjs';
import { bootstrapAdmin, createAccount } from '../server/accounts.mjs';
import { openDatabase } from '../server/db.mjs';

const password = 'Brand-fixture-only-853!';
let directory, db, server, base, admin;
const sessions = {};
const payload = (extra={}) => ({name:`Brand ${randomUUID()}`,category:'Phụ kiện',description:'Thông tin sản phẩm và gian hàng của thương hiệu.',categoryZh:'配件',descriptionZh:'品牌产品与店铺信息。',active:true,sortOrder:5,channels:[{label:'Shopee',url:'https://shopee.vn/company-test'}],...extra});
async function request(path,{session=admin,method='GET',data,form,idem,headers={}}={}) {
  const h = {'X-Requested-With':'SuperNet',...headers};
  if (session) h.Cookie=session;
  if (data) h['Content-Type']='application/json';
  if (idem) h['Idempotency-Key']=idem;
  const response = await fetch(`${base}/api/v1${path}`,{method,headers:h,body:form || (data?JSON.stringify(data):undefined)});
  return {status:response.status,body:await response.json().catch(()=>null),headers:response.headers};
}
const create = (data=payload(),options={}) => request('/admin/brands',{method:'POST',data,idem:randomUUID(),...options});
const update = (brand,extra={}) => request(`/admin/brands/${brand.id}`,{method:'PATCH',data:{...brand,...extra,expectedRevision:brand.revision}});
function upload(data,buffer,type='image/png',filename='logo.png') {
  const form=new FormData(); form.set('payload',JSON.stringify(data));form.set('logo',new Blob([buffer],{type}),filename);return form;
}
before(async()=>{
  directory=mkdtempSync(join(tmpdir(),'supernet-brands-'));
  const instance=createApp({dataDir:directory});db=instance.db;
  const user=bootstrapAdmin(db,{username:'admin',password});
  for(const role of ['hr','boss','interviewer']) createAccount(db,{username:`brand.${role}`,name:role,password,role},user.id);
  server=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`;
  for(const username of ['admin','brand.hr','brand.boss','brand.interviewer']) {
    const result=await request('/login',{session:'',method:'POST',data:{login:username,password}});assert.equal(result.status,200);
    sessions[username]=result.headers.get('set-cookie').split(';')[0];
  }
  admin=sessions.admin;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();rmSync(directory,{recursive:true,force:true});});

test('migration seeds existing stores once and preserves edits, deletion and an empty showcase on restart',()=>{
  const dir=mkdtempSync(join(tmpdir(),'supernet-brand-migration-'));
  try {
    let database=openDatabase(dir,false);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM company_brands').get().n,3);
    database.prepare('UPDATE company_brands SET name=? WHERE id=?').run('Safestraps cập nhật','safestraps');database.close();
    database=openDatabase(dir,false);assert.equal(database.prepare('SELECT name FROM company_brands WHERE id=?').get('safestraps').name,'Safestraps cập nhật');
    database.exec("UPDATE company_brands SET deleted_at='2026-10-31'");database.close();
    database=openDatabase(dir,false);assert.equal(database.prepare('SELECT COUNT(*) AS n FROM company_brands WHERE deleted_at IS NULL').get().n,0);database.close();
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('public brand data is ordered, localized, and excludes drafts and internal fields',async()=>{
  const draft=await create(payload({active:false,channels:[]}));assert.equal(draft.status,201);
  const created=await create(payload({sortOrder:0}));assert.equal(created.status,201);
  const result=await request('/public/brands?language=zh-CN',{session:''});assert.equal(result.status,200);
  const brand=result.body.find(row=>row.id===created.body.id);
  assert.equal(brand.description,'品牌产品与店铺信息。');assert.equal(brand.category,'配件');assert.ok(!result.body.some(row=>row.id===draft.body.id));
  for(const name of ['logo','logo_hash','revision','deleted_at','active']) assert.ok(!Object.hasOwn(brand,name));
  for(let index=1;index<result.body.length;index++) assert.ok(result.body[index].sortOrder>=result.body[index-1].sortOrder);
  assert.equal((await request('/brands',{session:sessions['brand.hr']})).body.some(row=>row.id===draft.body.id),true);
});
test('only Admin can read management data or mutate brands; unsafe origins cannot write',async()=>{
  assert.equal((await request('/admin/brands',{session:''})).status,401);
  const row=(await create()).body;
  for(const role of ['hr','boss','interviewer']) {
    const session=sessions[`brand.${role}`];
    assert.equal((await request('/admin/brands',{session})).status,403);
    assert.equal((await create(payload(),{session})).status,403);
    assert.equal((await request(`/admin/brands/${row.id}`,{session,method:'PATCH',data:row})).status,403);
    assert.equal((await request(`/admin/brands/${row.id}`,{session,method:'DELETE',data:{expectedRevision:1}})).status,403);
    assert.equal((await request(`/admin/brands/${row.id}/logo`,{session})).status,403);
  }
  assert.equal((await create(payload(),{headers:{Origin:'https://attacker.example'}})).status,403);
});
test('idempotency prevents duplicate brands and optimistic revisions reject lost updates and stale deletes',async()=>{
  const data=payload(),idem=randomUUID();
  const first=await create(data,{idem}),second=await create(data,{idem});assert.equal(first.status,201);assert.equal(second.body.id,first.body.id);
  assert.equal((await create({...data,name:'Changed retry'},{idem})).status,409);
  const changed=await update(first.body,{name:'Đã đổi tên',channels:[{label:'Website',url:'https://example.com/store'},{label:'TikTok Shop',url:'https://www.tiktok.com/@test'}]});assert.equal(changed.status,200);assert.equal(changed.body.revision,2);
  assert.equal((await update(first.body,{description:'Stale edit'})).status,409);
  assert.equal((await request(`/admin/brands/${first.body.id}`,{method:'DELETE',data:{expectedRevision:1}})).status,409);
  assert.equal((await create(payload({name:'đã đổi tên'}))).status,409);
});
test('invalid channel links and malformed brand data fail without changing the database',async()=>{
  const before=db.prepare('SELECT COUNT(*) AS n FROM company_brands').get().n;
  for(const url of ['javascript:alert(1)','data:text/html,test','http://example.com','https://user:password@example.com','invalid']) assert.equal((await create(payload({channels:[{label:'Website',url}]}))).status,400,url);
  for(const extra of [{name:'x'},{sortOrder:-1},{active:'false'},{channels:[]},{channels:[{label:'',url:'https://example.com'}]},{description:'x'.repeat(601)},{channels:[{label:'A',url:'https://example.com'},{label:'B',url:'https://example.com/'}]}]) assert.equal((await create(payload(extra))).status,400);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM company_brands').get().n,before);
});
test('logos upload, normalize to WebP, replace, hide and remove without stale or public draft images',async()=>{
  const png=await sharp({create:{width:240,height:80,channels:4,background:'#13578c'}}).png().toBuffer();
  const data=payload();const first=await create(undefined,{data:undefined,form:upload(data,png)});assert.equal(first.status,201);
  let row=first.body;assert.ok(row.logoUrl.includes('?v='));
  const image=await fetch(`${base}${row.logoUrl}`);assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/image\/webp/);assert.equal(image.headers.get('x-content-type-options'),'nosniff');
  const metadata=await sharp(Buffer.from(await image.arrayBuffer())).metadata();assert.equal(metadata.width/metadata.height,3);assert.equal(metadata.format,'webp');
  const replacement=await sharp({create:{width:100,height:100,channels:3,background:'#a53838'}}).png().toBuffer();
  const replaced=await request(`/admin/brands/${row.id}`,{method:'PATCH',form:upload({...row,expectedRevision:row.revision},replacement)});assert.equal(replaced.status,200);assert.notEqual(replaced.body.logoUrl,row.logoUrl);row=replaced.body;
  const hidden=await update(row,{active:false});assert.equal(hidden.status,200);row=hidden.body;
  assert.equal((await fetch(`${base}${row.logoUrl}`)).status,404);assert.equal((await fetch(`${base}/api/v1/admin/brands/${row.id}/logo`,{headers:{Cookie:admin}})).status,200);
  const removed=await update(row,{removeLogo:true,active:true});assert.equal(removed.status,200);assert.equal(removed.body.logoUrl,'');assert.equal((await fetch(`${base}${row.logoUrl}`)).status,404);
});
test('invalid image content, disguised SVGs and oversized logos never change an existing brand',async()=>{
  const row=(await create()).body;const data={...row,expectedRevision:row.revision};
  for(const [buffer,type,name] of [[Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),'image/png','logo.png'],[Buffer.from('not an image'),'image/webp','logo.webp'],[Buffer.alloc(2*1024*1024+1),'image/png','logo.png']]) {
    const response=await request(`/admin/brands/${row.id}`,{method:'PATCH',form:upload(data,buffer,type,name)});assert.equal(response.status,400);
  }
  assert.equal(db.prepare('SELECT revision FROM company_brands WHERE id=?').get(row.id).revision,1);
});
test('deleted brands retain historical JD names and cannot be newly assigned; existing JDs remain editable',async()=>{
  const row=(await create(payload({name:'Thương hiệu lưu lịch sử'}))).body;
  const job={title:'Nhân viên thương hiệu',department:'Marketing',location:'TP. Hồ Chí Minh',description:'Quản lý và cập nhật thông tin sản phẩm của thương hiệu.',openings:1,businessLine:row.id};
  const created=await request('/jobs',{method:'POST',data:job,idem:randomUUID()});assert.equal(created.status,201);
  assert.equal((await request(`/admin/brands/${row.id}`,{method:'DELETE',data:{expectedRevision:row.revision}})).status,200);
  assert.ok(!(await request('/public/brands',{session:''})).body.some(item=>item.id===row.id));
  const publicJob=await request(`/public/jobs/${created.body.id}`,{session:''});assert.equal(publicJob.status,200);assert.equal(publicJob.body.brand_name,row.name);
  assert.equal((await request('/jobs',{method:'POST',data:job,idem:randomUUID()})).status,400);
  assert.equal((await request(`/jobs/${created.body.id}`,{method:'PATCH',data:{title:'Nhân viên cập nhật',expectedRevision:1}})).status,200);
  const listed=(await request('/jobs')).body.find(item=>item.id===created.body.id);assert.equal(listed.brand_name,row.name);
});
test('audit failures roll back brand creation, updates and deletion',async()=>{
  const row=(await create()).body;
  db.exec("CREATE TRIGGER brand_audit_failure BEFORE INSERT ON audit_logs WHEN NEW.action LIKE 'brand.%' BEGIN SELECT RAISE(ABORT, 'test audit rollback'); END");
  try {
    const data=payload();assert.equal((await create(data)).status,500);assert.ok(!db.prepare('SELECT id FROM company_brands WHERE name=?').get(data.name));
    assert.equal((await update(row,{name:'Should rollback'})).status,500);
    assert.equal((await request(`/admin/brands/${row.id}`,{method:'DELETE',data:{expectedRevision:1}})).status,500);
    const retained=db.prepare('SELECT * FROM company_brands WHERE id=?').get(row.id);assert.equal(retained.name,row.name);assert.equal(retained.revision,1);assert.equal(retained.deleted_at,null);
  } finally {db.exec('DROP TRIGGER brand_audit_failure');}
});
