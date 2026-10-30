import { parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import { getDocumentProxy } from 'unpdf';

const MAX_TEXT = 60000;
try {
  const bytes = new Uint8Array(await readFile(workerData.path));
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('Tài liệu vượt quá 10 MB.');
  let text = '', pages = 1;
  if (workerData.mime === 'application/pdf') {
    const pdf = await getDocumentProxy(bytes, { isEvalSupported: false, maxImageSize: 16_777_216, enableXfa: false });
    try {
      pages = pdf.numPages;
      if (pages > 50) throw new Error('CV vượt quá 50 trang. Vui lòng chia nhỏ tài liệu.');
      const parts = [];
      for (let number = 1; number <= pages; number++) {
        const page = await pdf.getPage(number), content = await page.getTextContent();
        parts.push(content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join(''));
        if (parts.reduce((sum,part) => sum + part.length,0) > MAX_TEXT) throw new Error('Nội dung CV vượt quá 60.000 ký tự.');
        page.cleanup();
      }
      text = parts.join('\n\n').trim();
    } finally { await pdf.cleanup(); }
  } else {
    let expanded = 0;
    const files = unzipSync(bytes, { filter(entry) {
      if (!/^word\/(document|header\d+|footer\d+)\.xml$/.test(entry.name)) return false;
      expanded += entry.originalSize;
      if (expanded > 5 * 1024 * 1024) throw new Error('Nội dung DOCX giải nén vượt giới hạn.');
      return true;
    } });
    if (!files['word/document.xml']) throw new Error('Không đọc được nội dung DOCX.');
    const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: true, parseTagValue: false, trimValues: false, processEntities: true });
    function read(nodes) {
      let value = '';
      for (const node of nodes) for (const [name,children] of Object.entries(node)) {
        if (name === '#text') value += String(children);
        else if (name === 'w:tab') value += '\t';
        else if (name === 'w:br' || name === 'w:cr') value += '\n';
        else if (Array.isArray(children)) { value += read(children); if (name === 'w:p' || name === 'w:tr') value += '\n'; }
        if (value.length > MAX_TEXT) throw new Error('Nội dung CV vượt quá 60.000 ký tự.');
      }
      return value;
    }
    const names = Object.keys(files).sort((a,b) => (a.includes('header') ? 0 : a.includes('document') ? 1 : 2) - (b.includes('header') ? 0 : b.includes('document') ? 1 : 2));
    text = names.map(name => {
      const xml = strFromU8(files[name]);
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('DOCX có cấu trúc XML không được hỗ trợ.');
      return read(parser.parse(xml));
    }).join('\n').replace(/\n{3,}/g,'\n\n').trim();
    if (text.length > MAX_TEXT) throw new Error('Nội dung CV vượt quá 60.000 ký tự.');
  }
  parentPort.postMessage({ text, pages, scanned: !text.trim() });
} catch (error) {
  // Never return parser internals or document content through an error message.
  const known = ['vượt quá','vượt giới hạn','không được hỗ trợ'];
  parentPort.postMessage({ error: known.some(value => error.message?.includes(value)) ? error.message : 'Không đọc được nội dung tài liệu. PDF có thể bị khóa hoặc tệp bị hỏng.' });
}
