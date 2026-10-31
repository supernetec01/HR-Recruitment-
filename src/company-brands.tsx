import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, Store } from 'lucide-react';
import { api, errorMessage } from './api';
import { t, useLanguage } from './locale';
import { Alert } from './ui';

export type CompanyBrand = {
  id:string; name:string; category:string; description:string; channels:{label:string;url:string}[];
  logoUrl:string; sortOrder:number; categoryZh?:string; descriptionZh?:string; active?:boolean; revision?:number;
};
export function useCompanyBrands(scope:'public'|'staff'|'admin' = 'public') {
  const language = useLanguage();
  const [brands,setBrands] = useState<CompanyBrand[]>([]), [loading,setLoading] = useState(true), [error,setError] = useState('');
  const reload = useCallback(async () => {
    try { setBrands(await api<CompanyBrand[]>(scope === 'public' ? `/public/brands?language=${language}` : scope === 'admin' ? '/admin/brands' : `/brands?language=${language}`)); setError(''); }
    catch(error) { setError(errorMessage(error)); }
    finally { setLoading(false); }
  },[scope,language]);
  useEffect(() => {
    void reload();
    const refresh = () => { if (document.visibilityState === 'visible') void reload(); };
    const timer = setInterval(refresh,30000);
    window.addEventListener('focus',refresh); window.addEventListener('supernet-brands-changed',refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus',refresh); window.removeEventListener('supernet-brands-changed',refresh); };
  },[reload]);
  return {brands,loading,error,reload};
}
export function BrandLogo({brand,admin = false}:{brand:CompanyBrand;admin?:boolean}) {
  const [failed,setFailed] = useState(false);
  const source = admin && brand.logoUrl ? `/api/v1/admin/brands/${brand.id}/logo?v=${brand.logoUrl.split('v=')[1]}` : brand.logoUrl;
  useEffect(() => setFailed(false),[source]);
  return <div className="company-brand-logo">{source && !failed ? <img src={source} alt={t('Logo {name}',{name:brand.name})} loading="lazy" onError={() => setFailed(true)}/> : <span aria-hidden="true">{brand.name.trim().slice(0,2).toUpperCase()}</span>}</div>;
}
export function CompanyShowcase({brands,error,onRetry}:{brands:CompanyBrand[];error:string;onRetry:()=>void}) {
  if (!brands.length && !error) return null;
  return <section className="company-showcase" aria-labelledby="company-showcase-title">
    <header className="company-showcase-heading"><div><h2 id="company-showcase-title">{t('Thương hiệu & kênh bán hàng')}</h2><p>{t('Tìm hiểu sản phẩm và các gian hàng của Super Net.')}</p></div><Store size={24} aria-hidden="true"/></header>
    {error && <div className="brand-load-error"><Alert>{t('Chưa tải được thông tin thương hiệu.')}</Alert><button className="text-button" onClick={onRetry}>{t('Thử lại')}</button></div>}
    <div className="company-brand-grid">{brands.map(brand => <article className="company-brand-card" key={brand.id}>
      <div className="company-brand-heading"><BrandLogo brand={brand}/><div><h3>{brand.name}</h3>{brand.category && <span>{brand.category}</span>}</div></div>
      {brand.description && <p className="company-brand-description">{brand.description}</p>}
      <div className="company-brand-channels">{brand.channels.map(channel => <a key={channel.url} href={channel.url} target="_blank" rel="noopener noreferrer" aria-label={t('Mở {channel} của {name} (tab mới)',{channel:channel.label,name:brand.name})}>{channel.label}<ArrowUpRight size={16} aria-hidden="true"/></a>)}</div>
    </article>)}</div>
  </section>;
}
