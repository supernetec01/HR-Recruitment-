import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as lucide from 'lucide-react';

const root = new URL('./', import.meta.url);
const names = ['LayoutDashboard', 'BriefcaseBusiness', 'UsersRound', 'Bookmark', 'GitPullRequest', 'CalendarDays', 'MessageSquareText', 'History', 'ChartNoAxesCombined', 'Settings2', 'ChevronDown', 'ChevronRight', 'ChevronLeft', 'ArrowRight', 'ArrowUpRight', 'ArrowUp', 'Search', 'Bell', 'Plus', 'Download', 'Target', 'FileText', 'CircleCheck', 'Trophy', 'Clock3', 'CircleHelp', 'ExternalLink', 'Ellipsis', 'Menu', 'X', 'Check', 'Megaphone', 'TrendingUp', 'CodeXml', 'Package', 'CircleAlert', 'Video', 'MapPin', 'Mail', 'Phone', 'Globe2', 'SlidersHorizontal', 'ArrowDown', 'ScanLine', 'MessagesSquare', 'UserRoundCheck', 'CheckCheck', 'Building2', 'Send', 'Sparkles', 'Filter', 'Star', 'MoveRight', 'LogOut'];
const icons = Object.fromEntries(names.map(name => [name, renderToStaticMarkup(createElement(lucide[name], { size: 20, strokeWidth: 1.7, 'aria-hidden': 'true', focusable: 'false' }))]));
let css = await readFile(new URL('styles.css', root), 'utf8');
for (const subset of ['latin', 'vietnamese']) {
  const font = await readFile(new URL(`assets/inter-${subset}.woff2`, root));
  css = css.replace(`__INTER_${subset.toUpperCase()}__`, font.toString('base64'));
}
const license = await readFile(new URL('assets/INTER-LICENSE.txt', root), 'utf8');
const iconLicense = await readFile(new URL('assets/LUCIDE-LICENSE.txt', root), 'utf8');
const script = await readFile(new URL('prototype.js', root), 'utf8');
let html = await readFile(new URL('template.html', root), 'utf8');
html = html.replace('/* PREVIEW_STYLES */', () => css)
  .replace('/* PREVIEW_ICONS */', () => JSON.stringify(icons))
  .replace('/* PREVIEW_SCRIPT */', () => script)
  .replace('</head>', `<!-- Embedded Inter font, @fontsource-variable/inter 5.3.0.\n${license.replaceAll('--', '—')}\nEmbedded Lucide icons:\n${iconLicense.replaceAll('--', '—')}\n-->\n</head>`);
await writeFile(new URL('index.html', root), html);
console.log(`Built standalone preview: ${fileURLToPath(new URL('index.html', root))}`);
