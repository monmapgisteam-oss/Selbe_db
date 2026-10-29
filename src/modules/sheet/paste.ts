/**
 * ОЛОН НҮДНИЙ БУУЛГАЛТ — Excel-ээс хуулсан блокийг хүснэгтийн нүднүүдэд
 * БАЙРЛУУЛАХ цэвэр логик. React-гүй, DOM-гүй — тиймээс тестлэгдэнэ
 * (`paste.check.mjs`).
 */

/** Нэг нүдний зорилт: аль мөрийн индекс, аль блок, ямар утга */
export type PasteHit = { row: number; b: number; v: string };

export type PastePlan = {
  hits: PasteHit[];
  /** Байрлалаа эзэлсэн ч бичигдээгүй нүд (бүлэг, талбаргүй блок, хоосон, хальсан) */
  skipped: number;
  /** Тоо болгож уншигдаагүй утга */
  bad: number;
  badAt: { row: number; b: number; raw: string }[];
  rejAt: { row: number; b: number; raw: string; why: 'bad' | 'neg' | 'noWrite' | 'pct' }[];
};
export type PasteOpt = { noPct?: boolean };

/** `badAt`-д хадгалах жишээний дээд тоо */
const BAD_SAMPLES = 5;

/**
 * Санамсаргүй асар том буулгалтаас хамгаална (жиш. бүтэн хуудас хуулах).
 */
export const PASTE_MAX_CELLS = 5000;

/**
 * Хавтангийн текстийг 2 хэмжээст сүлжээ болгоно.
 */
export function parseGrid(text: string): string[][] {
  const s = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  const n = s.length;
  const out: string[][] = [];
  let row: string[] = [];
  let i = 0;
  /* Давталт бүр НЭГ нүд уншина: `i` = нүдний эхлэл, `j` = түүний төгсгөл (таб/мөр/төгсгөл) */
  for (;;) {
    let cell: string | null = null;
    let j = i;
    if (s[i] === '"') {
      let buf = '';
      let k = i + 1;
      let closed = false;
      while (k < n) {
        const c = s[k];
        if (c === '"') {
          if (s[k + 1] === '"') { buf += '"'; k += 2; continue; }
          closed = k + 1 >= n || s[k + 1] === '\t' || s[k + 1] === '\n';
          k += 1;
          break;
        }
        buf += c;
        k += 1;
      }
      if (closed) { cell = buf; j = k; }
    }
    if (cell === null) {
      let k = i;
      while (k < n && s[k] !== '\t' && s[k] !== '\n') k += 1;
      cell = s.slice(i, k);
      j = k;
    }
    row.push(cell);
    if (j >= n) { out.push(row); break; }
    if (s[j] === '\t') { i = j + 1; continue; }
    out.push(row);
    row = [];
    i = j + 1;
  }
  return out;
}

/**
 * ТАСЛАЛ НЬ МЯНГАТЫН Ч, АРАВТЫН Ч БАЙЖ БОЛОХ бичлэг — `1,250` · `-12,500`.
 */
export const isAmbiguousComma = (raw: string): boolean =>
  /^-?[1-9]\d{0,2},\d{3}$/.test(raw.trim().replace(/^\+/, ''));

/**
 * Нүдний текстийг тоон мөр болгоно. Тоо биш бол `null`.
 */
export function normCell(raw: string): string | null {
  const t0 = raw
    .trim()
    .replace(/[\s  ]/g, '')
    .replace(/^\+/, '')
    .replace(/%$/, '');
  if (t0 === '') return null;
  let t = t0;
  const dot = t.lastIndexOf('.');
  const comma = t.lastIndexOf(',');
  if (dot >= 0 && comma >= 0) {
    if (comma > dot) {
      /* `1.234,5` — цэг мянгат, таслал аравтын */
      if (!/^-?\d{1,3}(\.\d{3})+,\d*$/.test(t)) return null;
      t = t.replace(/\./g, '').replace(',', '.');
    } else {
      /* `1,234.5` — таслал мянгат, цэг аравтын */
      if (!/^-?\d{1,3}(,\d{3})+\.\d*$/.test(t)) return null;
      t = t.replace(/,/g, '');
    }
  } else if (comma >= 0) {
    if (/^-?\d{1,3}(,\d{3}){2,}$/.test(t)) t = t.replace(/,/g, '');
    else if (isAmbiguousComma(t)) return null;
    else t = t.replace(',', '.');
  }
  return /^-?(\d+(\.\d*)?|\.\d+)$/.test(t) && Number.isFinite(Number(t)) ? t : null;
}

/**
 * Сүлжээг ХАРАГДАХ мөрүүд дээр байрлуулна.
 *
 * @param grid     `parseGrid`-ийн үр дүн
 * @param vis      харагдах мөрүүдийн ЭХ индексүүд (шүүлт/эвхэлтийн дараах)
 * @param nBld     блокийн тоо (баруун хязгаар)
 * @param startVi  `vis` доторх эхлэх байрлал (зангуу нүдний мөр)
 * @param startB   эхлэх блок
 * @param canWrite (эх мөрийн индекс, блок) → тэр нүдэнд бичиж болох уу
 */
export function planPaste(
  grid: string[][],
  vis: number[],
  nBld: number,
  startVi: number,
  startB: number,
  canWrite: (row: number, b: number) => boolean,
  opt?: PasteOpt,
): PastePlan {
  const hits: PasteHit[] = [];
  let skipped = 0;
  let bad = 0;
  let seen = 0;
  const badAt: PastePlan['badAt'] = [];
  const rejAt: PastePlan['rejAt'] = [];
  const noteBad = (row: number, b: number, raw: string, why: 'bad' | 'neg' | 'pct' = 'bad') => {
    bad += 1;
    if (badAt.length < BAD_SAMPLES) badAt.push({ row, b, raw: raw.trim() });
    rejAt.push({ row, b, raw: raw.trim(), why });
  };

  for (let gr = 0; gr < grid.length; gr++) {
    const vi = startVi + gr;
    for (let gc = 0; gc < grid[gr].length; gc++) {
      seen += 1;
      /* Хамгаалалтын дээд хязгаар — үлдсэнийг «алгасав» гэж тоолно */
      if (seen > PASTE_MAX_CELLS) { skipped += 1; continue; }
      const b = startB + gc;
      /* Хүснэгтийн доод/баруун ирмэгээс хальсан */
      if (vi >= vis.length || b >= nBld) { skipped += 1; continue; }
      const row = vis[vi];
      if (!canWrite(row, b)) {
        skipped += 1;
        /* 2026-10-01: утгатай нүд л «татгалзсан» — хоосон нь зүгээр байрлал */
        if (grid[gr][gc].trim() !== '') rejAt.push({ row, b, raw: grid[gr][gc].trim(), why: 'noWrite' });
        continue;
      }
      if (opt?.noPct && /%\s*$/.test(grid[gr][gc].trim())) { noteBad(row, b, grid[gr][gc], 'pct'); continue; }
      const t = normCell(grid[gr][gc]);
      if (t === null) {
        if (grid[gr][gc].trim() === '') skipped += 1;
        else noteBad(row, b, grid[gr][gc]);
        continue;
      }
      if (Number(t) < 0) { noteBad(row, b, grid[gr][gc], 'neg'); continue; }
      hits.push({ row, b, v: String(Number(t)) });
    }
  }
  return { hits, skipped, bad, badAt, rejAt };
}
