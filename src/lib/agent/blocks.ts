/**
 * АГЕНТЫН ХАРИУЛТЫН БҮТЭЦ — markdown → блокууд (ЦЭВЭР логик, JSX-гүй).
 *
 * ⚠️ ЯАГААД `AgentMarkdown.tsx`-ЭЭС САЛГАСАН БЭ: хариултыг зөвхөн дэлгэц дээр
 * биш, ФАЙЛ (PDF · Word · Excel · CSV) болгон хөрвүүлдэг болсон
 * (`src/lib/agent/report*.ts`). Хоёр тал нэг markdown-ыг ХОЁР ӨӨР задлагчаар
 * уншвал файл ба дэлгэц зөрнө — тиймээс дүрэм ЭНД ГАНЦ эхтэй, `AgentMarkdown`
 * зөвхөн зурна. Мөн `chart.ts`/`format.ts`-ийн адил Node-ийн шалгуураас шууд
 * импортлогдоно (`report.check.mjs`).
 *
 * ⚠️ Загвар нь `#` гарчиг бичихгүй (зааварт хориотой) — бүлгийн нэрийг
 * `**тодоор**` бичдэг. Тиймээс «гарчиг» нь тусдаа блок БИШ, бүтнээрээ тод
 * догол мөр (`headingOf`).
 */

import { parseChart, type ChartSpec } from './chart';

export type MdBlock =
  /** Энгийн догол мөр — `**тод**`, `` `код` `` тэмдэглэгээ ХЭВЭЭР үлдэнэ */
  | { kind: 'para'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  /** ```chart блок — `spec` нь `null` бол задлагдаагүй (зурахгүй) */
  | { kind: 'chart'; raw: string; spec: ChartSpec | null }
  /** ```report блок — файл үүсгэх заавар (`report.ts` задална) */
  | { kind: 'report'; raw: string }
  /** ```plan блок — ажлын төлөвлөгөө (`AgentPlan` зурна) */
  | { kind: 'plan'; raw: string };

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
/** `|---|---|` тусгаарлагч — өгөгдөл БИШ тул хаягдана */
const isTableSep = (l: string) => /^\s*\|[\s:|-]+\|\s*$/.test(l);
const isBullet = (l: string) => /^\s*[-•]\s+/.test(l);
const isNumbered = (l: string) => /^\s*\d+[.)]\s+/.test(l);
/**
 * ⚠️ ЭХ СУРВАЛЖИЙН МӨР — ХАЯГДАНА (дэлгэц, файл хоёуланд).
 *
 * Агент нь мөрийг ГАРГАСААР байна (`registry.ts`-ийн дүрэм): тэр нь загварыг
 * «энэ тоог яг хаанаас авсан бэ» гэж нэрлэхэд хүргэдэг сахилга бөгөөд зохиомол
 * тоо гаргах эрсдэлийг бууруулдаг. Зөвхөн ХАРУУЛАХГҮЙ — удирдлагад
 * `et:24 / OBJECTID` гэдэг нь утгагүй техникийн чимээ.
 */
const isSource = (l: string) => /^\s*(эх сурвалж|source)\s*[::]/i.test(l);

const cells = (l: string) =>
  l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

/** Бүтнээрээ тод догол мөр = бүлгийн гарчиг. Үгүй бол `null` */
export function headingOf(b: MdBlock): string | null {
  if (b.kind !== 'para') return null;
  const m = /^\*\*([^*]+)\*\*$/.exec(b.text.trim());
  return m ? m[1].trim() : null;
}

/**
 * Агентын хариултыг блок болгон задлана.
 *
 * ⚠️ ХАЗГАЙ ОРОЛТЫГ ТЭВЧИНЭ (загварын гаралт төгс байх баталгаагүй):
 *   · хаалтын хашлагагүй блок (хариу таслагдсан) — файлын төгсгөл хүртэл залгина;
 *   · догол мөр ``` дээр ЗААВАЛ таслагдана — эс бөгөөс хашилт, JSON, хаалт
 *     гурвуулаа догол мөрд залгигдаж, график зурагдахын оронд түүхий JSON гарна;
 *   · таних салаанд баригдаагүй хашилтын мөрийг ЗАЛГИЖ, индексийг ЗААВАЛ ахиулна
 *     (`if (!para.length) { i++; }`) — эс бөгөөс ХЯЗГААРГҮЙ ДАВТАЛТ үүсч хөтөч гацна.
 */
export function parseBlocks(text: string): MdBlock[] {
  const lines = String(text).split('\n');
  const out: MdBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    /* ── Хашлагатай блок — ```chart ба ```report ── */
    const fence = /^\s*```\s*(chart|report|plan)\s*$/i.exec(line);
    if (fence) {
      i++;
      const buf: string[] = [];
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) buf.push(lines[i++]);
      if (i < lines.length) i++; // хаалтын хашлагыг алгасна
      const raw = buf.join('\n');
      const kind = fence[1].toLowerCase();
      out.push(kind === 'chart'
        ? { kind: 'chart', raw, spec: parseChart(raw) }
        : kind === 'plan'
          ? { kind: 'plan', raw }
          : { kind: 'report', raw });
      continue;
    }

    /* ── Хүснэгт ── */
    if (isTableRow(line)) {
      const rows: string[] = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(lines[i++]);
      const body = rows.filter((r) => !isTableSep(r));
      if (body.length) {
        const [head, ...rest] = body;
        out.push({ kind: 'table', head: cells(head), rows: rest.map(cells) });
      }
      continue;
    }

    /* ── Жагсаалт ── */
    if (isBullet(line) || isNumbered(line)) {
      const ordered = isNumbered(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? isNumbered(lines[i]) : isBullet(lines[i]))) {
        items.push(lines[i++].replace(/^\s*(?:[-•]|\d+[.)])\s+/, ''));
      }
      out.push({ kind: 'list', ordered, items });
      continue;
    }

    if (isSource(line)) { i++; continue; }

    /* ── Энгийн догол мөр — дараалсан мөрүүдийг нэгтгэнэ ── */
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*```/.test(lines[i]) &&
      !isTableRow(lines[i]) &&
      !isBullet(lines[i]) &&
      !isNumbered(lines[i]) &&
      !isSource(lines[i])
    ) {
      para.push(lines[i++]);
    }
    if (!para.length) { i++; continue; }
    out.push({ kind: 'para', text: para.join('\n') });
  }

  return out;
}
