import multer from 'multer';
import sharp from 'sharp';
import { z } from 'zod';
import { audit, hash, id, now, transaction } from './db.mjs';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const httpsUrl = z.string().trim().max(2048).transform((value, ctx) => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
    return url.href;
  } catch { ctx.addIssue({ code:'custom', message:'Liên kết cửa hàng phải là HTTPS hợp lệ, không chứa thông tin đăng nhập.' }); return z.NEVER; }
});
const schema = z.object({
  name:z.string().trim().min(2).max(100), category:z.string().trim().max(100).default(''),
  description:z.string().trim().max(600).default(''), categoryZh:z.string().trim().max(100).default(''),
  descriptionZh:z.string().trim().max(600).default(''), active:z.boolean().default(true),
  sortOrder:z.number().int().min(0).max(9999).default(0), removeLogo:z.boolean().default(false),
  channels:z.array(z.object({label:z.string().trim().min(1).max(60),url:httpsUrl})).max(10),
  expectedRevision:z.number().int().min(1).optional(),
}).superRefine((data,ctx) => {
  if (data.active && !data.channels.length) ctx.addIssue({code:'custom',path:['channels'],message:'Thương hiệu đang hiển thị cần ít nhất một kênh bán hàng.'});
  if (new Set(data.channels.map(channel => channel.url)).size !== data.channels.length) ctx.addIssue({code:'custom',path:['channels'],message:'Liên kết kênh bán hàng bị trùng.'});
});
export function brandDTO(row, {language, admin = false} = {}) {
  const logoUrl = row.logo_hash ? `/api/v1/public/brands/${encodeURIComponent(row.id)}/logo?v=${row.logo_hash}` : '';
  const common = {id:row.id,name:row.name,category:language === 'zh-CN' && row.category_zh ? row.category_zh : row.category,
    description:language === 'zh-CN' && row.description_zh ? row.description_zh : row.description,channels:JSON.parse(row.channels),logoUrl,sortOrder:row.sort_order};
  return admin ? {...common,categoryZh:row.category_zh,descriptionZh:row.description_zh,active:!!row.active,revision:row.revision,updatedAt:row.updated_at} : common;
}
export function withBrand(db, job) {
  if (!job) return job;
  return {...job,brand_name:db.prepare('SELECT name FROM company_brands WHERE id=?').get(job.business_line)?.name || ''};
}
export function validateJobBrand(db, brandId, previous = '') {
  if (brandId && brandId !== previous && !db.prepare('SELECT id FROM company_brands WHERE id=? AND deleted_at IS NULL').get(brandId)) fail(400,'Thương hiệu không tồn tại hoặc đã bị xóa.');
}

export function registerBrandRoutes(app, {db,staff,idempotent}) {
  const admin = (req,res,next) => req.user.role === 'admin' ? next() : res.status(403).json({message:'Chỉ Admin được quản lý thương hiệu và cửa hàng.'});
  const upload = multer({storage:multer.memoryStorage(),limits:{fileSize:2*1024*1024,files:1,fields:1,fieldSize:32768}}).single('logo');
  const parseUpload = (req,res,next) => upload(req,res,error => {
    if (error) return next(Object.assign(new Error('Logo cần là PNG, JPEG hoặc WebP, tối đa 2 MB.'),{status:400}));
    next();
  });
  const readInput = async req => {
    let input = req.body;
    if (req.is('multipart/form-data')) {
      try { input = JSON.parse(req.body.payload); } catch { fail(400,'Thông tin thương hiệu không hợp lệ.'); }
    }
    const data = schema.parse(input);
    let logo;
    if (req.file) {
      if (data.removeLogo) fail(400,'Chọn thay logo hoặc xóa logo.');
      try {
        const buffer = req.file.buffer;
        const raster = buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
          buffer.subarray(0,3).equals(Buffer.from([255,216,255])) ||
          (buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP');
        if (!raster) throw new Error();
        const image = sharp(req.file.buffer,{limitInputPixels:16_000_000,animated:false});
        const meta = await image.metadata();
        if (!['png','jpeg','webp'].includes(meta.format) || (meta.pages || 1) > 1) throw new Error();
        logo = await image.rotate().resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).webp({quality:90}).toBuffer();
      } catch { fail(400,'Logo cần là ảnh PNG, JPEG hoặc WebP hợp lệ, tối đa 16 triệu điểm ảnh.'); }
    }
    return {data,logo};
  };
  const find = brandId => {
    const row = db.prepare('SELECT * FROM company_brands WHERE id=? AND deleted_at IS NULL').get(brandId);
    if (!row) fail(404,'Không tìm thấy thương hiệu.');
    return row;
  };
  const checkName = (name, brandId = '') => {
    const normalized = name.normalize('NFKC').toLocaleLowerCase('vi');
    if (db.prepare('SELECT id,name FROM company_brands WHERE deleted_at IS NULL AND id!=?').all(brandId).some(row => row.name.normalize('NFKC').toLocaleLowerCase('vi') === normalized)) fail(409,'Tên thương hiệu đã tồn tại.');
  };
  app.get('/api/v1/public/brands',(req,res) => res.json(db.prepare('SELECT * FROM company_brands WHERE active=1 AND deleted_at IS NULL ORDER BY sort_order,name,id').all().map(row => brandDTO(row,{language:req.query.language}))));
  app.get('/api/v1/brands',staff,(req,res) => res.json(db.prepare('SELECT * FROM company_brands WHERE deleted_at IS NULL ORDER BY sort_order,name,id').all().map(row => brandDTO(row,{language:req.query.language}))));
  app.get('/api/v1/admin/brands',staff,admin,(req,res) => res.json(db.prepare('SELECT * FROM company_brands WHERE deleted_at IS NULL ORDER BY sort_order,name,id').all().map(row => brandDTO(row,{admin:true}))));
  app.get('/api/v1/public/brands/:id/logo', (req,res) => {
    const row = db.prepare('SELECT logo,logo_hash,active,deleted_at FROM company_brands WHERE id=?').get(req.params.id);
    // Draft logos are visible only through the separate authenticated endpoint below.
    if (!row || !row.active || row.deleted_at || !row.logo) return res.sendStatus(404);
    res.type('webp').set('ETag',`"${row.logo_hash}"`).send(Buffer.from(row.logo));
  });
  app.get('/api/v1/admin/brands/:id/logo',staff,admin,(req,res) => {
    const row = find(req.params.id);
    if (!row.logo) return res.sendStatus(404);
    res.type('webp').send(Buffer.from(row.logo));
  });
  app.post('/api/v1/admin/brands',staff,admin,parseUpload,async (req,res) => {
    const {data,logo} = await readInput(req);
    idempotent(req,res,`brand:${req.user.id}`,() => {
      checkName(data.name);
      const brandId = id(), timestamp = now();
      db.prepare('INSERT INTO company_brands(id,name,category,description,category_zh,description_zh,channels,active,sort_order,logo,logo_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(brandId,data.name,data.category,data.description,data.categoryZh,data.descriptionZh,JSON.stringify(data.channels),data.active?1:0,data.sortOrder,logo || null,logo?hash(logo):'',timestamp,timestamp);
      audit(db,null,req.user.id,'brand.created',{brandId,name:data.name});
      return brandDTO(find(brandId),{admin:true});
    },201);
  });
  app.patch('/api/v1/admin/brands/:id',staff,admin,parseUpload,async (req,res) => {
    const {data,logo} = await readInput(req);
    res.json(transaction(db,() => {
      const row = find(req.params.id);
      if (data.expectedRevision !== row.revision) fail(409,'Thương hiệu đã thay đổi. Hãy tải lại danh sách và mở lại biểu mẫu.');
      checkName(data.name,row.id);
      const newLogo = data.removeLogo ? null : logo || row.logo;
      db.prepare('UPDATE company_brands SET name=?,category=?,description=?,category_zh=?,description_zh=?,channels=?,active=?,sort_order=?,logo=?,logo_hash=?,updated_at=?,revision=revision+1 WHERE id=?')
        .run(data.name,data.category,data.description,data.categoryZh,data.descriptionZh,JSON.stringify(data.channels),data.active?1:0,data.sortOrder,newLogo,newLogo?hash(newLogo):'',now(),row.id);
      audit(db,null,req.user.id,'brand.updated',{brandId:row.id,name:data.name,revision:row.revision+1});
      return brandDTO(find(row.id),{admin:true});
    }));
  });
  app.delete('/api/v1/admin/brands/:id',staff,admin,(req,res) => {
    const {expectedRevision} = z.object({expectedRevision:z.number().int().min(1)}).parse(req.body);
    transaction(db,() => {
      const row = find(req.params.id);
      if (row.revision !== expectedRevision) fail(409,'Thương hiệu đã thay đổi. Hãy tải lại danh sách trước khi xóa.');
      db.prepare('UPDATE company_brands SET deleted_at=?,updated_at=?,revision=revision+1,logo=NULL,logo_hash=\'\' WHERE id=?').run(now(),now(),row.id);
      audit(db,null,req.user.id,'brand.deleted',{brandId:row.id,name:row.name});
    });
    res.json({ok:true});
  });
}
