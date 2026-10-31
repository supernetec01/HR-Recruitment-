import { t } from './locale';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import App from './App';
import { ApplicationPage, Careers, SupplementPage } from './public';
import { PublicJobPage } from './job-page';
import '@fontsource/be-vietnam-pro/vietnamese-400.css';
import '@fontsource/be-vietnam-pro/vietnamese-500.css';
import '@fontsource/be-vietnam-pro/vietnamese-600.css';
import '@fontsource/be-vietnam-pro/vietnamese-700.css';
import '@fontsource/be-vietnam-pro/latin-400.css';
import '@fontsource/be-vietnam-pro/latin-500.css';
import '@fontsource/be-vietnam-pro/latin-600.css';
import '@fontsource/be-vietnam-pro/latin-700.css';
import '@fontsource-variable/noto-sans-sc';
import './styles.css';
import './internal.css';
import './careers.css';
import './documents.css';
import './accessibility.css';
import './brands.css';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <div className="boot-screen"><h1>{t("Không thể mở trang")}</h1><p>{t("Vui lòng tải lại. Hồ sơ đã lưu trên máy chủ vẫn được giữ nguyên.")}</p><button className="button primary" onClick={() => window.location.reload()}>{t("Tải lại trang")}</button></div> : this.props.children; }
}
ReactDOM.createRoot(document.getElementById('root')!).render(<ErrorBoundary><BrowserRouter><Routes><Route path="/tuyen-dung" element={<Careers/>}/><Route path="/tuyen-dung/:jobId" element={<PublicJobPage/>}/><Route path="/ung-tuyen/:jobId" element={<ApplicationPage/>}/><Route path="/bo-sung/:token" element={<SupplementPage/>}/><Route path="*" element={<App/>}/></Routes></BrowserRouter></ErrorBoundary>);
