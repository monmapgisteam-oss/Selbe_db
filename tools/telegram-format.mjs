/**
 * Агентын markdown → Telegram-ийн HTML.
 */

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const isRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isSep = (l) => /^\s*\|[\s:|-]+\|\s*$/.test(l);

const isSource = (l) => /^\s*(эх сурвалж|source)\s*:/i.test(l);

/** Telegram-д тайлангийн блокийн оронд гарах мөр */
const REPORT_HINT = 'Тайлан файлыг порталын AI туслахаас татна уу.';

function stripCharts(lines) {
  const out = [];
  let kind = null; // ```chart | ```report
  let buf = null; // null = блокоос гадна

  const flush = () => {
    if (!buf) return;
    if (kind === 'report') { out.push(REPORT_HINT); buf = null; kind = null; return; }
    if (kind === 'plan') { buf = null; kind = null; return; }
    // Задлан шинжлэх нь бүтэхгүй бол ЧИМЭЭГҮЙ орхино — түүхий JSON гаргахгүй
    try {
      const note = JSON.parse(buf.join('\n'))?.note;
      if (note && String(note).trim()) out.push(String(note).trim());
    } catch { /* эвдэрсэн JSON — тайлбар алга */ }
    buf = null;
    kind = null;
  };

  for (const l of lines) {
    if (!buf) {
      const m = /^\s*```\s*(chart|report|plan)\s*$/i.exec(l);
      if (m) { buf = []; kind = m[1].toLowerCase(); continue; }
    }
    if (buf) {
      if (/^\s*```\s*$/.test(l)) flush();
      else buf.push(l);
      continue;
    }
    out.push(l);
  }
  flush(); // хаалтгүй блок — дотроос нь тайлбар гарвал авна
  return out;
}

/** Markdown → Telegram HTML БЛОКУУД (мөр бүр = нэг блок, хүснэгт = нэг `<pre>` блок) — `toHtml` · `toHtmlChunks`-ийн суурь */
export function toHtmlBlocks(md) {
  const lines = stripCharts(
    String(md).split('\n').filter((l) => !isSource(l)),
  );
  const out = [];
  let i = 0;

  while (i < lines.length) {
    if (isRow(lines[i])) {
      const rows = [];
      while (i < lines.length && isRow(lines[i])) {
        if (!isSep(lines[i])) {
          rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
        }
        i++;
      }
      if (rows.length) {
        const cols = Math.max(...rows.map((r) => r.length));
        const w = Array.from({ length: cols }, (_, c) =>
          Math.max(...rows.map((r) => (r[c] ?? '').length)),
        );
        const txt = rows
          .map((r) =>
            Array.from({ length: cols }, (_, n) =>
              // Эхний багана нь нэр (зүүн), бусад нь тоо (баруун)
              n === 0 ? (r[n] ?? '').padEnd(w[n]) : (r[n] ?? '').padStart(w[n]),
            ).join('  ').trimEnd(),
          )
          .join('\n');
        out.push(`<pre>${esc(txt)}</pre>`);
      }
      continue;
    }

    out.push(
      esc(lines[i])
        .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/^(\s*)- /, '$1• '),
    );
    i++;
  }
  return out;
}

export function toHtml(md) {
  return toHtmlBlocks(md).join('\n');
}

/** Telegram-ийн нэг мессежийн дээд хэмжээ 4096 — зайтай (хүснэгтийн `<pre>` таг, тоолуур) */
export const TG_CHUNK_MAX = 3800;

const TAG_RE = /^<\/?(b|code|pre)>$/i;
const hasText = (s) => s.replace(/<[^>]+>/g, '').trim().length > 0;

/**
 * ХАТУУ ХАЙЧИЛТЫН ЦЭГ — `s`-ийг `[from, to)` хүртэл авахад entity (`&amp;` · `&lt;` · `&gt;`) ДУНДУУР орохгүй цэг.
 */
const cutAt = (s, from, to) => {
  if (to >= s.length) return s.length;
  const amp = s.lastIndexOf('&', to - 1);
  return amp > from && s.indexOf(';', amp) >= to ? amp : to;
};

/**
 * Нэг ХЭТ УРТ энгийн мөрийг (inline `<b>` · `<code>` тагтай HTML) үгийн зайн дээр хуваана — хуваах цэгт нээлттэй тагийг
 * ХААЖ, дараагийн хэсгийн эхэнд ДАХИН НЭЭНЭ: хэсэг бүр өөрөө хүчинтэй HTML.
 */
function splitHtmlLine(html, max) {
  const out = [];
  const open = [];
  let cur = '';
  const closeAll = () => open.slice().reverse().map((t) => `</${t}>`).join('');
  const openAll = () => open.map((t) => `<${t}>`).join('');
  const push = () => { if (hasText(cur)) out.push(cur + closeAll()); cur = openAll(); };
  for (const tk of html.split(/(<\/?(?:b|code|pre)>)/i).filter(Boolean)) {
    if (TAG_RE.test(tk)) {
      const name = tk.replace(/[<>/]/g, '').toLowerCase();
      if (tk.startsWith('</')) { const i = open.lastIndexOf(name); if (i >= 0) open.splice(i, 1); } else open.push(name);
      cur += tk;
      continue;
    }
    for (const w of tk.split(/(\s+)/)) {
      if (!w) continue;
      if (cur.length + w.length + closeAll().length > max && hasText(cur)) push();
      if (w.length > max - 20) {
        /* ганц «үг» (урт холбоос г.м.) хэсгээс урт — хайчилна */
        for (let i = 0; i < w.length;) { const j = cutAt(w, i, i + max - 20); cur += w.slice(i, j); push(); i = j; }
        continue;
      }
      cur += w;
    }
  }
  if (hasText(cur)) out.push(cur + closeAll());
  return out;
}

/** Хэт урт хүснэгтийн `<pre>` блокийг мөрөөр нь хувааж, хэсэг бүрийг `<pre>…</pre>`-д */
function splitPre(block, max) {
  const inner = block.slice('<pre>'.length, -'</pre>'.length).split('\n');
  const out = [];
  let cur = [];
  let len = 0;
  const flush = () => { if (cur.length) out.push(`<pre>${cur.join('\n')}</pre>`); cur = []; len = 0; };
  for (const l of inner) {
    if (len + l.length + 12 > max) flush();
    if (l.length + 11 > max) {
      for (let i = 0; i < l.length;) { const j = cutAt(l, i, i + max - 11); out.push(`<pre>${l.slice(i, j)}</pre>`); i = j; }
      continue;
    }
    cur.push(l);
    len += l.length + 1;
  }
  flush();
  return out;
}

export function toHtmlChunks(md, max = TG_CHUNK_MAX) {
  const parts = [];
  for (const b of toHtmlBlocks(md)) {
    if (b.length <= max) parts.push(b);
    else if (b.startsWith('<pre>') && b.endsWith('</pre>')) parts.push(...splitPre(b, max));
    else parts.push(...splitHtmlLine(b, max));
  }
  const chunks = [];
  let cur = '';
  for (const p of parts) {
    if (cur && cur.length + 1 + p.length > max) { chunks.push(cur); cur = p; }
    else cur = cur ? `${cur}\n${p}` : p;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** HTML таг арилгаж цэвэр текст болгоно — илгээлт унасан үеийн нөөц зам */
export const stripHtml = (html) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
