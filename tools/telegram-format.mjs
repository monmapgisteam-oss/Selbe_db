/**
 * Агентын markdown → Telegram-ийн HTML.
 *
 * ⚠️ MARKDOWN горим ХЭРЭГЛЭХГҮЙ: агентын хариултад `_`, `*`, `[` тэмдэгт
 * чөлөөтэй ордог бөгөөд Telegram-ийн Markdown задлагч тэдгээрт 400 алдаа өгдөг.
 * HTML горимд `&<>`-ыг л зайлуулбал бусад бүх тэмдэгт аюулгүй — тиймээс ЭХЛЭЭД
 * зайлуулж, ДАРАА нь тэмдэглэгээг таг болгоно (эсрэгээр хийвэл таг ч
 * зайлуулагдана).
 *
 * ⚠️ Хүснэгтийг Telegram зурдаггүй тул `<pre>` дотор эгнүүлж, хөдөлгөөнгүй
 * өргөнтэй фонтоор харуулна — эс бөгөөс баганууд хоорондоо холилдоно.
 *
 * ⚠️ Тусдаа файл болгосон шалтгаан: ботыг ажиллуулахгүйгээр ТЕСТЛЭХ боломжтой
 * байх ёстой (`tools/telegram-format.check.mjs`).
 */

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const isRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isSep = (l) => /^\s*\|[\s:|-]+\|\s*$/.test(l);

/**
 * ⚠️ ЭХ СУРВАЛЖИЙН МӨРИЙГ ХАСНА. Порталд түүнийг `<details>`-ээр нуугаад дарж
 * нээдэг боловч Telegram-д тийм боломж байхгүй — «Эх сурвалж: `et:24` /
 * `OBJECTID`» гэдэг нь удирдлагад утгагүй чимээ болно.
 *
 * ⚠️ Агент нь мөрийг ГАРГАСААР байна (`registry.ts`-ийн дүрэм) — тэр нь загварыг
 * тоогоо хаанаас авснаа нэрлэхэд хүргэдэг сахилга бөгөөд зохиомол тоо гаргахаас
 * сэргийлдэг. Зөвхөн ХАРУУЛАХГҮЙ.
 */
const isSource = (l) => /^\s*(эх сурвалж|source)\s*:/i.test(l);

export function toHtml(md) {
  const lines = String(md)
    .split('\n')
    .filter((l) => !isSource(l));
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
  return out.join('\n');
}

/** HTML таг арилгаж цэвэр текст болгоно — илгээлт унасан үеийн нөөц зам */
export const stripHtml = (html) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
