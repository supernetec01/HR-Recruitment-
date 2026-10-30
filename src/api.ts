import { getLanguage } from './locale';
export class ApiError extends Error {
  status: number;
  code?: string;
  matches?: import('./types').Match[];
  constructor(status: number, data: { message?: string; code?: string; matches?: import('./types').Match[] }) {
    super(data.message || 'Không kết nối được với hệ thống.'); this.status = status; this.code = data.code; this.matches = data.matches;
  }
}
export async function api<T = { ok: boolean }>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('X-Requested-With', 'SuperNet');
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  let response: Response;
  try { response = await fetch(`/api/v1${path}`, { ...options, headers, credentials: 'same-origin' }); }
  catch { throw new Error('Không thể kết nối. Kiểm tra mạng và thử lại; thông tin chưa gửi vẫn được giữ trên biểu mẫu.'); }
  const data = await response.json().catch(() => ({ message: 'Phản hồi từ máy chủ không hợp lệ.' }));
  if (!response.ok) throw new ApiError(response.status, data);
  return data;
}
export const json = (value: unknown) => JSON.stringify(value);
export const key = () => crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
export const SOURCES = ['Website','Facebook','Zalo','Email','TopCV','Giới thiệu','Hồ sơ giấy','Khác'];
export const STAGES: Record<string, { label: string; color: string }> = {
  new: { label: 'Mới tiếp nhận', color: 'blue' }, screening: { label: 'Đang sàng lọc', color: 'purple' },
  contacted: { label: 'Đã liên hệ', color: 'teal' }, scheduled: { label: 'Chờ phỏng vấn', color: 'amber' },
  interview_requested: { label: 'Hẹn phỏng vấn', color: 'cyan' },
  interviewed: { label: 'Đã phỏng vấn', color: 'purple' }, review: { label: 'Chờ đánh giá', color: 'amber' },
  offered: { label: 'Đã gửi offer', color: 'teal' }, hired: { label: 'Đã tuyển dụng', color: 'green' }, rejected: { label: 'Không phù hợp', color: 'gray' },
};
export const date = (value: string, withTime = false) => new Intl.DateTimeFormat(getLanguage() === 'zh-CN' ? 'zh-CN' : 'vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone: 'Asia/Bangkok' }).format(new Date(value));
export const time = (value: string) => new Intl.DateTimeFormat(getLanguage() === 'zh-CN' ? 'zh-CN' : 'vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }).format(new Date(value));
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Có lỗi xảy ra. Vui lòng thử lại.';
export const dayKey = (value: string | Date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(value));
export const duration = (interview: { starts_at: string; ends_at: string }) => Math.round((+new Date(interview.ends_at) - +new Date(interview.starts_at)) / 60000);
