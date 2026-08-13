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

/**
 * ⚠️ ГРАФИКИЙН БЛОКИЙГ БҮРЭН ХАСНА. Портал ```chart блокийг диаграм болгож
 * зурдаг (`AgentChart.tsx`) ч Telegram-д зураг зурах боломжгүй — хасахгүй бол
 * хэрэглэгч түүхий JSON хараад ойлгохгүй.
 *
 * ⚠️ ГЭХДЭЭ БЛОК ДОТОРХ `note`-ЫГ АВЧ ҮЛДЭНЭ. Агентын дүгнэлт («Багц 2
 * тэргүүлж…») тэр талбарт ордог тул блокийг бүхэлд нь хаявал Telegram
 * хэрэглэгч зөвхөн хүснэгт хараад, ШИНЖИЛГЭЭГ нь бүрэн алдана.
 *
 * ⚠️ Хаалтын хашлага ирээгүй ч (хариулт таслагдсан) үлдсэн мөрийг бүгдийг
 * залгина — түүхий JSON гарахаас сэргийлэх нь чухал.
 */
function stripCharts(lines) {
  const out = [];
  let buf = null; // null = блокоос гадна

  const flush = () => {
    if (!buf) return;
    // Задлан шинжлэх нь бүтэхгүй бол ЧИМЭЭГҮЙ орхино — түүхий JSON гаргахгүй
    try {
      const note = JSON.parse(buf.join('\n'))?.note;
      if (note && String(note).trim()) out.push(String(note).trim());
    } catch { /* эвдэрсэн JSON — тайлбар алга */ }
    buf = null;
  };

  for (const l of lines) {
    if (!buf && /^\s*```\s*chart\s*$/i.test(l)) { buf = []; continue; }
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

export function toHtml(md) {
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
  return out.join('\n');
}

/** HTML таг арилгаж цэвэр текст болгоно — илгээлт унасан үеийн нөөц зам */
export const stripHtml = (html) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
