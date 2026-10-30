import { useSyncExternalStore } from 'react';
import { Languages } from 'lucide-react';
import { zhCN } from './zh-CN';
export type Language = 'vi' | 'zh-CN';
let language: Language = 'vi';
try { if (localStorage.getItem('supernet.language') === 'zh-CN') language = 'zh-CN'; } catch { /* Private browser storage may be unavailable. */ }
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getLanguage = () => language;
export const useLanguage = () => useSyncExternalStore(subscribe,getLanguage,() => 'vi' as Language);
export function setLanguage(value: Language) {
  language = value;
  document.documentElement.lang = value;
  try { localStorage.setItem('supernet.language',value); } catch { /* Keep the choice for this page session. */ }
  listeners.forEach(listener => listener());
}
export function t(value: string | number | undefined | null, variables: Record<string,string | number> = {}) {
  const source = value == null ? '' : String(value), key = source.trim();
  let output = language === 'zh-CN' && zhCN[key] ? source.replace(key,zhCN[key]) : source;
  for (const [name,replacement] of Object.entries(variables)) output = output.replaceAll(`{${name}}`,String(replacement));
  return output;
}
export function LanguageSwitcher() {
  const current = useLanguage();
  return <label className="language-switcher"><Languages size={17}/><select aria-label="Ngôn ngữ / 语言" value={current} onChange={event => setLanguage(event.target.value as Language)}><option value="vi">Tiếng Việt</option><option value="zh-CN">简体中文</option></select></label>;
}
document.documentElement.lang = language;
