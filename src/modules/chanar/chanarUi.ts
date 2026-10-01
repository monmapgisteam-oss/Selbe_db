/**
 * ЧАНАРЫН БАРИМТЫН ДЭЛГЭЦИЙН ЦЭВЭР ТУСЛАХУУД — `Chanar.tsx` ба дэд маягтууд.
 *
 * ⚠️ 2026-09-28: React үгүй, сүлжээ үгүй — `chanarUi.check.mjs` Node дээр
 *    ачаална. Урсгалын дүрэм ЭНД БИШ (`chanarMs.ts`); энд зөвхөн жагсаалтын
 *    шүүлт, хураангуйн тоо, огнооны хөрвүүлэлт, хэвлэх маягтын гарын үсгийн
 *    мөрүүд — дэлгэцийн тооцоо.
 */

import { t as tr } from '@/lib/i18nCore';
import {
  KINDS, MS_STATUS, latest, isAnOpen, REVIEWERS_OF, verdictCode,
  type DocKind, type InspCheck, type MaBody, type MaMaterial, type MsDoc, type Sig, type VerdictCode,
} from '@/lib/chanarMs';
import { MA_CATEGORIES, MA_REQUIRED, type MaCategory } from '@/lib/chanarTemplates';

/** epoch мс → `YYYY-MM-DD`; хоосон бол «—» */
export const ymd = (ms: number | null | undefined): string => {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** epoch мс → `<input type=date>`-ийн утга (хоосон бол '') */
export const toDateInput = (ms: number | null | undefined): string => (ms ? ymd(ms) : '');

/** `<input type=date>`-ийн утга → epoch мс (орон нутгийн шөнө дунд); хоосон/буруу → null */
export const fromDateInput = (v: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? '').trim());
  if (!m) return null;
  const ms = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Number.isFinite(ms) ? ms : null;
};

/** Хайлт — дугаар эсвэл нэрэнд (том жижиг үсэг ялгахгүй); хоосон хайлт бүгдийг */
export function matchesSearch(doc: Pick<MsDoc, 'docNo' | 'title'>, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return doc.docNo.toLowerCase().includes(s) || doc.title.toLowerCase().includes(s);
}

/**
 * Багцын жагсаалт — ноорог ЗӨВХӨН зохиогчид (эсвэл super); бусад бүх төлөв.
 * ⚠️ `chanarMs.MS_STATUS`-ийн «draft — хэнд ч харагдахгүй» дүрэм (2026-09-25).
 */
export function visibleInPkg(docs: readonly MsDoc[], pkg: string, me: string, isSuper: boolean): MsDoc[] {
  const u = me.trim().toLowerCase();
  return docs.filter((d) => d.bagts === pkg && (d.status !== MS_STATUS.draft || isSuper || (!!u && d.author === u)));
}

/** Төрөл бүрийн СҮҮЛИЙН хувилбарын тоо — таб дээрх тоо */
export function kindCounts(docs: readonly MsDoc[]): Record<DocKind, number> {
  const out = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<DocKind, number>;
  for (const d of latest(docs)) out[d.kind] += 1;
  return out;
}

/** Баримтын шийдвэрийн код — REP байвал түүнээс, үгүй бол хянагчдын нэгтгэл; шийдвэргүй → null */
export function docVerdict(doc: Pick<MsDoc, 'kind' | 'status' | 'reviews' | 'rep'>): VerdictCode | null {
  /* ⚠️ 2026-09-29 (аудит 10): ШИЙДВЭРЛЭГДЭЭГҮЙ төлөвт `rep`-ийг тооцохгүй. NCR-ийн
     залруулга/дахин нээлт нь REP дугаарын lineage-ийн тулд ӨМНӨХ хариуг мөрөнд
     үлдээдэг (`chanarStore.submitCorrection`) — тэр нь одоогийн шийдвэр биш. */
  if (doc.status !== MS_STATUS.approved && doc.status !== MS_STATUS.returned) return null;
  if (doc.rep) return doc.rep.verdict;
  const rs = REVIEWERS_OF[doc.kind].map((r) => doc.reviews[r]).filter((r) => r != null);
  if (!rs.length) return null;
  const codes = rs.map((r) => verdictCode(r.verdict));
  return codes.includes('R') ? 'R' : codes.includes('AN') ? 'AN' : 'A';
}

/**
 * MA хураангуй (баримтаар) — A / AN / R / хүлээгдэж буй (review) / нээлттэй.
 * ⚠️ 2026-09-28: НЭЭЛТТЭЙ = ноорог + review + буцаагдсан + AN-тай батлагдсан
 *    (нөхцөл биелээгүй, `closeAn` хийгдээгүй) — практикийн OPEN/CLOSED.
 */
export function maSummary(heads: readonly MsDoc[]): { A: number; AN: number; R: number; pending: number; open: number; anOpen: number } {
  const out = { A: 0, AN: 0, R: 0, pending: 0, open: 0, anOpen: 0 };
  for (const d of heads) {
    if (d.status === MS_STATUS.review) out.pending += 1;
    if (d.status !== MS_STATUS.approved || isAnOpen(d)) out.open += 1;
    if (isAnOpen(d)) out.anOpen += 1;
    const v = docVerdict(d);
    if (v) out[v] += 1;
  }
  return out;
}

export type MaCatProgress = { approved: number; required: number };

/**
 * MA хураангуй МАТЕРИАЛААР (2026-09-28, бүртгэлийн KPI): ангилал бүрд батлагдсан
 * (A/AN) материалын мөрийн тоо / шаардлагатай тоо (`MA_REQUIRED`). Тоолол
 * СҮҮЛИЙН хувилбарын биеэр — `docs` = `{ head, category, materials }`
 * (дуудагч `loadBodyOf`-оор биеийг цуглуулна; `category` = `meta.category`).
 * Материалын `verdict` хоосон бол баримтын шийдвэр (approved → A).
 * Танигдахгүй ангилал `other`-т.
 */
export function maMaterialSummary(
  docs: readonly { head: Pick<MsDoc, 'kind' | 'status' | 'reviews' | 'rep'>; category: string; materials: readonly Pick<MaMaterial, 'verdict'>[] }[],
): { byCategory: Record<MaCategory, MaCatProgress>; other: number; approved: number; required: number } {
  const byCategory = Object.fromEntries(MA_CATEGORIES.map((c) => [c, { approved: 0, required: MA_REQUIRED[c] }])) as Record<MaCategory, MaCatProgress>;
  let other = 0;
  for (const d of docs) {
    if (d.head.status !== MS_STATUS.approved) continue;
    const dv = docVerdict(d.head);
    const n = d.materials.filter((m) => {
      const v = m.verdict ?? dv ?? 'A';
      return v === 'A' || v === 'AN';
    }).length;
    if ((MA_CATEGORIES as readonly string[]).includes(d.category)) byCategory[d.category as MaCategory].approved += n;
    else other += n;
  }
  const approved = MA_CATEGORIES.reduce((s, c) => s + byCategory[c].approved, 0);
  const required = MA_CATEGORIES.reduce((s, c) => s + byCategory[c].required, 0);
  return { byCategory, other, approved, required };
}

/** NCR хураангуй — нээлттэй (хаагдаагүй бүх төлөв) / хаагдсан */
export function ncrSummary(heads: readonly MsDoc[]): { open: number; closed: number } {
  let closed = 0;
  for (const d of heads) if (d.status === MS_STATUS.approved) closed += 1;
  return { open: heads.length - closed, closed };
}

/** OK/NA/X тэмдгийн товшилтын мөчлөг: null → OK → NA → X → null */
export const nextCheck = (cur: InspCheck | null): InspCheck | null =>
  (cur === null ? 'OK' : cur === 'OK' ? 'NA' : cur === 'NA' ? 'X' : null);

/** Тэмдгийн шошго — маягтын бичиглэл */
export const checkLabel = (c: InspCheck | null): string => (c === 'NA' ? 'N/A' : c ?? '—');

/** Гарын үсгийн мөрийн текст — «Үүрэг — Нэр, албан тушаал» (хоосон бол зөвхөн үүрэг) */
const sigLine = (role: string, sig?: Sig): string => {
  const who = [sig?.name, sig?.position].filter((x) => !!x?.trim()).join(', ');
  return who ? `${role} — ${who}` : role;
};

/**
 * ХЭВЛЭХ МАЯГТЫН ГАРЫН ҮСГИЙН МӨРҮҮД — практикийн маягтуудаас (тулгалт 2026-09-28):
 *   MS/QMP/PRC — гүйцэтгэгчийн 3 (Боловсруулсан · Хянасан · Баталсан) + захиалагчийн хянагчид
 *   MA — гүйцэтгэгчийн мөрүүд `body.signatures`-аас (нэр·албан тушаал; хоосон бол 3 хоосон
 *        мөр, `reviewed2` бөглөгдсөн бол 4) + захиалагч: «Боловсруулсан — ЧХХ хяналтын
 *        инженер» · «Зөвшөөрсөн — ЧХХ менежер» · «Танилцсан — ТУГ төслийн менежер»;
 *        сонголтоор `opts.consultant` (Зохиогч — гүйцэтгэгчийн зөвлөх), `opts.equipment`
 *        (тоноглол: ХАБЭА өргөх байгууламжийн инженер · ТУГ ахлах архитектор)
 *   MIR/FIC — гүйцэтгэгчийн QC → хяналтын инженер → чанарын инженер
 *   NCR — нээгч 2 + ТМ «Хянасан» + гүйцэтгэгчийн 2 (хаалт)
 * Мөр бүр хоосон (нэр · албан тушаал · гарын үсэг · огноо) — цаасан дээр бөглөнө.
 */
export function printSigRoles(kind: DocKind, opts: { ma?: Pick<MaBody, 'signatures'> | null; consultant?: boolean; equipment?: boolean } = {}): string[] {
  if (kind === 'MA') {
    const sg = opts.ma?.signatures;
    const contractor = [
      sigLine(tr('Боловсруулсан (гүйцэтгэгч)'), sg?.prepared),
      sigLine(tr('Хянасан (гүйцэтгэгч)'), sg?.reviewed),
      ...(sg?.reviewed2 && (sg.reviewed2.name || sg.reviewed2.position) ? [sigLine(tr('Хянасан 2 (гүйцэтгэгч)'), sg.reviewed2)] : []),
      sigLine(tr('Баталсан (гүйцэтгэгч)'), sg?.approved),
    ];
    const client = [
      tr('Боловсруулсан — ЧХХ хяналтын инженер'), tr('Зөвшөөрсөн — ЧХХ менежер'), tr('Танилцсан — ТУГ төслийн менежер'),
      ...(opts.consultant ? [tr('Зохиогч — гүйцэтгэгчийн зөвлөх')] : []),
      ...(opts.equipment ? [tr('Хянасан — ХАБЭА өргөх байгууламжийн инженер'), tr('Хянасан — ТУГ ахлах архитектор')] : []),
    ];
    return [...contractor, ...client];
  }
  if (kind === 'MIR' || kind === 'FIC') {
    return [tr('Гүйцэтгэгчийн чанарын инженер'), tr('Захиалагчийн хяналтын инженер'), tr('Захиалагчийн чанарын инженер')];
  }
  if (kind === 'NCR') {
    return [
      tr('Нээсэн: Хяналтын инженер'), tr('Нээсэн: Чанарын менежер'), tr('Хянасан: Төслийн менежер'),
      tr('Гүйцэтгэгчийн БУ менежер'), tr('Гүйцэтгэгчийн чанарын инженер'),
    ];
  }
  return [
    tr('Боловсруулсан (гүйцэтгэгч)'), tr('Хянасан (гүйцэтгэгч)'), tr('Баталсан (гүйцэтгэгч)'),
    tr('ТУХ — инженер · менежер'), tr('Чанарын хэлтэс'), tr('ХАБЭА'),
  ];
}

/** REP (захиалагчийн хариу) хэвлэлийн гарын үсгийн мөр — 2026-04 маягт + гүйцэтгэгчийн хүлээн авалт */
export function repSigRoles(): string[] {
  return [
    tr('Боловсруулсан — ЧХХ хяналтын инженер'), tr('Зөвшөөрсөн — ЧХХ менежер'), tr('Танилцсан — ТУГ төслийн менежер'),
    tr('Хариу хүлээн авсан гүйцэтгэгчийн ажилтан'),
  ];
}

/** Шинэ баримтын товчны нэр — төрлөөр */
export function newLabel(kind: DocKind): string {
  if (kind === 'QMP') return tr('+ Шинэ чанарын удирдлагын төлөвлөгөө');
  if (kind === 'PRC') return tr('+ Шинэ процедур');
  if (kind === 'MA') return tr('+ Шинэ материал баталгаажуулалт');
  if (kind === 'MIR') return tr('+ Шинэ материалын үзлэг');
  if (kind === 'FIC') return tr('+ Шинэ талбайн үзлэг');
  if (kind === 'NCR') return tr('+ Шинэ үл тохирол');
  return tr('+ Шинэ аргачлал');
}

/** Хоосон жагсаалтын зурвас — төрлөөр */
export function emptyLabel(kind: DocKind): string {
  if (kind === 'QMP') return tr('Энэ багцад чанарын удирдлагын төлөвлөгөө алга.');
  if (kind === 'PRC') return tr('Энэ багцад процедур алга.');
  if (kind === 'MA') return tr('Энэ багцад материал баталгаажуулалт алга.');
  if (kind === 'MIR') return tr('Энэ багцад материалын үзлэг алга.');
  if (kind === 'FIC') return tr('Энэ багцад талбайн үзлэг алга.');
  if (kind === 'NCR') return tr('Энэ багцад үл тохирол алга.');
  return tr('Энэ багцад аргачлал алга.');
}

/** Мөрийн жагсаалт (алхмууд) ↔ олон мөрт текст */
export const linesToList = (v: string): string[] => v.split('\n').map((x) => x.trim()).filter(Boolean);
export const listToLines = (xs: readonly string[]): string => xs.join('\n');

/**
 * ОЛОН МӨРТ ТАЛБАРЫН ТҮҮХИЙ ТЕКСТ (2026-09-30) — гаднаас ирсэн жагсаалт (`joined`)
 * өөрчлөгдөхөд оролтын текстийг (`txt`) хэвээр үлдээх үү, солих уу.
 * ⚠️ ЯАГААД: NCR-ийн «Хийсэн алхмууд» `value={listToLines(steps)}` + `linesToList` гэж
 *    ШУУД холбогдсон тул товчлуур бүрд мөрийн төгсгөлийн зай ТАСРАЛТГҮЙ хасагдаж
 *    («Арматур солив» → «Арматурсолив»), Enter-ийн хоосон мөр шүүгдэн ШИНЭ МӨР
 *    нэмэх боломжгүй байв. Текст нь ижил жагсаалт руу задрах бол ХЭВЭЭР (хэрэглэгч
 *    бичиж байна), эс бөгөөс гаднаас өөрчлөгдсөн (өөр баримт) — солино.
 */
export const keepLinesText = (txt: string, joined: string): string =>
  (listToLines(linesToList(txt)) === joined ? txt : joined);
