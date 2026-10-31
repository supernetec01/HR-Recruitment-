import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage, json, key } from './api';
import { BrandLogo, useCompanyBrands, type CompanyBrand } from './company-brands';
import { t } from './locale';
import { Alert, Empty, Field, Modal, Spinner } from './ui';

export function BrandsManager({notify}:{notify:(message:string)=>void}) {
  const {brands,loading,error,reload} = useCompanyBrands('admin');
  const [editing,setEditing] = useState<CompanyBrand|'new'|null>(null), [removing,setRemoving] = useState<CompanyBrand|null>(null);
  const [busy,setBusy] = useState(false), [deleteError,setDeleteError] = useState('');
  const changed = () => { void reload(); window.dispatchEvent(new Event('supernet-brands-changed')); };
  async function remove() {
    if (!removing || busy) return;
    setBusy(true); setDeleteError('');
    try { await api(`/admin/brands/${removing.id}`,{method:'DELETE',body:json({expectedRevision:removing.revision})}); setRemoving(null); changed(); notify('Đã xóa thương hiệu khỏi khu vực giới thiệu.'); }
    catch(error) { setDeleteError(errorMessage(error)); } finally { setBusy(false); }
  }
  return <div className="brands-manager">
    <header className="brands-admin-heading"><div><h1>{t('Thương hiệu & cửa hàng')}</h1><p>{t('Quản lý logo, mô tả và liên kết hiển thị trên trang tuyển dụng.')}</p></div><div className="brand-heading-actions"><a className="button secondary" href="/tuyen-dung#company-showcase-title" target="_blank" rel="noopener noreferrer">{t('Xem trang tuyển dụng')}<ArrowUpRight size={16} aria-hidden="true"/></a><button className="button primary" onClick={() => setEditing('new')}><Plus size={17} aria-hidden="true"/>{t('Thêm thương hiệu')}</button></div></header>
    {error && <div className="brand-load-error"><Alert>{t(error)}</Alert><button className="button secondary" onClick={() => void reload()}>{t('Tải lại danh sách')}</button></div>}
    {loading ? <Spinner/> : !brands.length && !error ? <Empty title={t('Chưa có thương hiệu')}>{t('Thêm thương hiệu và kênh bán hàng để giới thiệu với ứng viên.')}</Empty> : <div className="brand-admin-list">{brands.map(brand => <article className="brand-admin-card" key={brand.id}>
      <div className="company-brand-heading"><BrandLogo brand={brand} admin/><div><h2>{brand.name}</h2><span>{brand.category}</span><span className={`brand-visibility ${brand.active ? 'visible' : ''}`}>{t(brand.active ? 'Đang hiển thị' : 'Đang ẩn')} · {t('Thứ tự')}: {brand.sortOrder}</span></div></div>
      <p className="company-brand-description">{brand.description || t('Chưa có mô tả')}</p><div className="company-brand-channels">{brand.channels.map(channel => <a key={channel.url} href={channel.url} target="_blank" rel="noopener noreferrer" aria-label={t('Mở {channel} của {name} (tab mới)',{channel:channel.label,name:brand.name})}>{channel.label}<ArrowUpRight size={15} aria-hidden="true"/></a>)}</div>
      <div className="brand-admin-actions"><button className="button secondary" aria-label={t('Chỉnh sửa {name}',{name:brand.name})} onClick={() => setEditing(brand)}><Pencil size={15} aria-hidden="true"/>{t('Chỉnh sửa')}</button><button className="button secondary brand-delete" aria-label={t('Xóa {name}',{name:brand.name})} onClick={() => {setRemoving(brand);setDeleteError('');}}><Trash2 size={15} aria-hidden="true"/>{t('Xóa')}</button></div>
    </article>)}</div>}
    {editing && <BrandForm existing={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => {setEditing(null);changed();notify('Đã lưu thương hiệu và cửa hàng.');}}/>}
    {removing && <Modal title={t('Xóa thương hiệu')} onClose={() => !busy && setRemoving(null)}><div className="modal-body"><p>{t('Xóa {name} khỏi khu vực giới thiệu?',{name:removing.name})}</p><p className="helper">{t('Các tin tuyển dụng đã gắn thương hiệu này vẫn được giữ nguyên.')}</p>{deleteError && <Alert>{t(deleteError)}</Alert>}{deleteError && <button className="text-button" onClick={() => {setRemoving(null);void reload();}}>{t('Tải lại danh sách')}</button>}</div><div className="modal-footer"><button className="button secondary" disabled={busy} onClick={() => setRemoving(null)}>{t('Hủy')}</button><button className="button danger" disabled={busy} onClick={() => void remove()}>{t(busy ? 'Đang xóa…' : 'Xác nhận xóa')}</button></div></Modal>}
  </div>;
}

function BrandForm({existing,onClose,onSaved}:{existing?:CompanyBrand;onClose:()=>void;onSaved:()=>void}) {
  const [name,setName] = useState(existing?.name || ''), [category,setCategory] = useState(existing?.category || ''), [description,setDescription] = useState(existing?.description || '');
  const [categoryZh,setCategoryZh] = useState(existing?.categoryZh || ''), [descriptionZh,setDescriptionZh] = useState(existing?.descriptionZh || '');
  const [active,setActive] = useState(existing?.active ?? true), [order,setOrder] = useState(String(existing?.sortOrder ?? 0));
  const [channels,setChannels] = useState(existing?.channels.map(channel => ({...channel,id:key()})) || [{label:'Shopee',url:'',id:key()}]);
  const [file,setFile] = useState<File|null>(null), [removeLogo,setRemoveLogo] = useState(false), [preview,setPreview] = useState('');
  const [error,setError] = useState(''), [busy,setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null), requestKey = useRef(key());
  useEffect(() => { if (!file) {setPreview('');return;} const url = URL.createObjectURL(file);setPreview(url);return () => URL.revokeObjectURL(url); },[file]);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    if (active && !channels.length) {setError('Thương hiệu đang hiển thị cần ít nhất một kênh bán hàng.');return;}
    setBusy(true);setError('');
    const payload = {name,category,description,categoryZh,descriptionZh,active,sortOrder:Number(order),channels:channels.map(({label,url}) => ({label,url})),removeLogo,...(existing ? {expectedRevision:existing.revision} : {})};
    const body = new FormData(); body.set('payload',json(payload)); if (file) body.set('logo',file);
    try { await api(existing ? `/admin/brands/${existing.id}` : '/admin/brands',{method:existing?'PATCH':'POST',headers:existing?undefined:{'Idempotency-Key':requestKey.current},body});onSaved(); }
    catch(error) {setError(errorMessage(error));} finally {setBusy(false);}
  }
  const logoUrl = preview || (!removeLogo && existing?.logoUrl ? `/api/v1/admin/brands/${existing.id}/logo?v=${existing.revision}` : '');
  return <Modal title={t(existing ? 'Chỉnh sửa thương hiệu' : 'Thêm thương hiệu')} onClose={() => !busy && onClose()} wide className="brand-editor-modal">
    <form onSubmit={submit} onChange={() => {requestKey.current = key();}}><div className="modal-body"><fieldset disabled={busy} className="brand-editor-fields">
      <section className="brand-logo-editor"><div className="company-brand-logo">{logoUrl ? <img src={logoUrl} alt={t('Xem trước logo')}/> : <ImagePlus size={30} aria-hidden="true"/>}</div><div><Field label={t('Logo thương hiệu')} hint={t('PNG, JPEG hoặc WebP · Tối đa 2 MB. Logo được giữ đúng tỷ lệ.')}><input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const value = event.target.files?.[0];if (!value) return; if (value.size > 2*1024*1024 || !['image/png','image/jpeg','image/webp'].includes(value.type)) {setError('Logo cần là PNG, JPEG hoặc WebP, tối đa 2 MB.');event.target.value='';return;}setFile(value);setRemoveLogo(false);setError(''); }}/></Field>{(file || (!removeLogo && existing?.logoUrl)) && <button type="button" className="text-button brand-delete" onClick={() => {setFile(null);setRemoveLogo(true);requestKey.current=key();if(inputRef.current)inputRef.current.value='';}}>{t('Gỡ logo')}</button>}</div></section>
      <div className="form-grid"><Field label={t('Tên thương hiệu')} required><input value={name} onChange={e=>setName(e.target.value)} required minLength={2} maxLength={100}/></Field><Field label={t('Ngành hàng')}><input value={category} onChange={e=>setCategory(e.target.value)} maxLength={100}/></Field><Field label={t('Mô tả thương hiệu')} className="full" hint={t('Giới thiệu sản phẩm và lĩnh vực hoạt động bằng thông tin cụ thể.')}><textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3} maxLength={600}/></Field></div>
      <section className="brand-channel-editor" aria-labelledby="brand-channels-heading"><div className="brand-section-heading"><h3 id="brand-channels-heading">{t('Kênh bán hàng')}</h3><button type="button" className="text-button" disabled={channels.length>=10} onClick={() => {setChannels([...channels,{label:'',url:'',id:key()}]);requestKey.current=key();}}><Plus size={16} aria-hidden="true"/>{t('Thêm kênh')}</button></div><p className="helper">{t('Tên kênh có thể là Shopee, TikTok Shop, Lazada hoặc website. Chỉ nhận liên kết HTTPS.')}</p>{channels.map((channel,index)=><div className="brand-channel-row" key={channel.id}><Field label={t('Tên kênh {number}',{number:index+1})} required><input value={channel.label} maxLength={60} required onChange={e=>setChannels(channels.map(item=>item.id===channel.id?{...item,label:e.target.value}:item))}/></Field><Field label={t('Liên kết kênh {number}',{number:index+1})} required><input type="url" placeholder="https://" pattern="https://.*" maxLength={2048} required value={channel.url} onChange={e=>setChannels(channels.map(item=>item.id===channel.id?{...item,url:e.target.value}:item))}/></Field><button className="icon-button brand-delete" type="button" aria-label={t('Xóa kênh {number}',{number:index+1})} onClick={() => {setChannels(channels.filter(item=>item.id!==channel.id));requestKey.current=key();}}><Trash2 size={18} aria-hidden="true"/></button></div>)}</section>
      <details className="brand-language-fields"><summary>{t('Nội dung tiếng Trung (tùy chọn)')}</summary><Field label={t('Ngành hàng bằng tiếng Trung')}><input value={categoryZh} maxLength={100} onChange={e=>setCategoryZh(e.target.value)}/></Field><Field label={t('Mô tả bằng tiếng Trung')} hint={t('Để trống để dùng nội dung tiếng Việt.')}><textarea value={descriptionZh} maxLength={600} rows={3} onChange={e=>setDescriptionZh(e.target.value)}/></Field></details>
      <div className="form-grid"><Field label={t('Thứ tự hiển thị')} hint={t('Số nhỏ hơn được hiển thị trước.')}><input value={order} onChange={e=>setOrder(e.target.value)} type="number" min={0} max={9999} required/></Field><label className="brand-active-control"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/><span>{t('Hiển thị trên trang tuyển dụng')}</span></label></div>
    </fieldset>{error && <Alert>{t(error)}</Alert>}</div><div className="modal-footer"><button className="button secondary" type="button" disabled={busy} onClick={onClose}>{t('Hủy')}</button><button className="button primary" type="submit" disabled={busy}>{t(busy?'Đang lưu…':'Lưu thương hiệu')}</button></div></form>
  </Modal>;
}
