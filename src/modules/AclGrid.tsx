'use client';

/**
 * «БАГЦ × ҮҮРЭГ/ШАТ» ЭРХИЙН ХҮСНЭГТ — админ порталын багцаар олгодог БҮХ
 * хуудасны нийтлэг бүрэлдэхүүн (2026-09-30).
 *
 * ⚠️ ЗАГВАР нь `GuitsetgelAcl` (хэрэглэгчийн баталсан): мөр = багц, багана =
 *    үүрэг/шат, нүд бүрд тэр багцын тэр үүргийн аккаунтууд ДООШОО чипээр
 *    (нэр · туг · ✕); «+» нүдний баруун дээд буланд — порталд БАЙГАА
 *    аккаунтаас сонгоно; хоосон нүдэнд «—», ажил гацах бол бүдэг шар.
 *    «Бүх багц»-тай аккаунт мөр бүрд бүдэг чипээр (үйлдэл нь hover-т).
 *    «Бүх багц» МӨР БАЙХГҮЙ (хэрэглэгч татгалзсан, 2026-09-30).
 * ⚠️ ЯАГААД НЭГ БҮРЭЛДЭХҮҮН: урьд нь Хуваарь · Обьём · Нэмэлт ажил · Чанар ·
 *    QAQC · Дэд бүтэц бүр өөрийн хөзрийн загвартай байв (`PkgCol` ·
 *    `RoleBlock` · `PackBlock` гурван хуулбар). Нэгийг засахад бусад нь
 *    хоцордог тул («засвар нь ижил кодын НЭГД нь л хүрнэ» — `scopedAcl.ts`)
 *    харагдац ЭНД, дүрэм нь дуудагчид (`aclOps.*CellOp`).
 * ⚠️ БИЧИЛТГҮЙ: энэ файл зөвхөн зурна; нэмэх/хасах бүр дуудагчийн `onAdd` ·
 *    `onRemove`-оор (түгжээ, асуулт, op тэнд).
 */

import { useState, type CSSProperties, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import s from './guitsetgel.module.css';

/** Багана — үүрэг эсвэл шат */
export type GridCol = { key: string; label: string; count?: number };

/** Мөр — багц. `warn` нь мөрийн гацааны анхааруулгууд (толгойд ⚠, хүснэгтийн доор бүтэн) */
export type GridRow = { key: string; label: string; warn?: string[] };

/** Нүдэн дэх аккаунт */
export type GridHolder = {
  user: string;
  /** «Бүх багц»-аар хамарсан — бүдэг, шошготой */
  viaAll: boolean;
  /** Устгагдсан аккаунтын өнчин мөр — ✕-ээр цэвэрлэнэ */
  gone: boolean;
  /** Хатуу super — багцын хязгаар үйлчлэхгүй (remote-ийн хуучин мөр) */
  admin?: boolean;
  /** ArcGIS бичилт унасан */
  failed: boolean;
  /** Эрхийн мөр ArcGIS-т хүрээгүй (`permissions` dirty-set) */
  dirty: boolean;
};

/** Сонгогчийн мөр */
export type GridCand = { value: string; label: string };

export type AclGridProps = {
  rows: GridRow[];
  cols: GridCol[];
  /** Зүүн дээд булангийн шошго («Багц») */
  corner: string;
  /** (мөр, багана) нүдний аккаунтууд */
  holders: (row: string, col: string) => GridHolder[];
  /** Нүд гацаж буй эсэх (бүдэг шар) — хоосон байх нь заавал гацаа биш */
  stuck: (row: string, col: string, hs: GridHolder[]) => boolean;
  /** Гацсан нүдний tooltip */
  stuckTitle: (row: string, col: string) => string;
  /** «+» дарахад санал болгох аккаунтууд (зөвхөн нээлттэй нүдэнд дуудагдана) */
  candidates: (row: string, col: string) => GridCand[];
  onAdd: (row: string, col: string, user: string) => void;
  onRemove: (row: string, col: string, h: GridHolder) => void;
  /** «+»-ийн tooltip */
  addTitle: (row: GridRow, col: GridCol) => string;
  /** Чипэн дэх нэмэлт туг (жишээ нь «Зөвхөн харна») — ✕-ийн өмнө */
  flag?: (h: GridHolder, row: string, col: string) => ReactNode;
  /** Бичилт/түгжээ — бүх товч идэвхгүй */
  off: boolean;
  /** «+» нээх агшинд түгжээ шалгах — false бол нээхгүй (дуудагч зурвас тавина) */
  canOpen?: () => boolean;
  /** Эхний баганын өргөн (px) — дэд бүтцийн урт нэрэнд өргөн */
  rowWidth?: number;
};

/** Нэг баганын доод өргөн — нийт `min-width` = эхний багана + багана × энэ */
const COL_MIN = 148;
/** Цөөн баганатай (≤ 2) хүснэгтийг дэлгэц дүүрэн сунгахгүй — нэг баганын дээд өргөн */
const COL_MAX_FEW = 340;

export function AclGrid({
  rows, cols, corner, holders, stuck, stuckTitle, candidates, onAdd, onRemove, addTitle, flag, off, canOpen,
  rowWidth = 96,
}: AclGridProps) {
  /** Нээлттэй «+» сонгогч — `мөр|багана` (нэг л удаад нэг) */
  const [open, setOpen] = useState<string | null>(null);

  const tableStyle: CSSProperties = { minWidth: rowWidth + cols.length * COL_MIN };
  /* ⚠️ 1–2 баганатай (QAQC · Дэд бүтэц · Хуваарь г.м.) хүснэгт бүтэн өргөнд сунвал чип
     нь 600px урт болж уншихад хэцүү — хүрээг баганын тоогоор барина */
  const wrapStyle: CSSProperties | undefined = cols.length <= 2
    ? { maxWidth: rowWidth + cols.length * COL_MAX_FEW }
    : undefined;
  const warned = rows.filter((r) => r.warn?.length);

  const cell = (row: GridRow, col: GridCol) => {
    const key = `${row.key}|${col.key}`;
    const hs = holders(row.key, col.key);
    const bad = stuck(row.key, col.key, hs);
    const cands = open === key ? candidates(row.key, col.key) : [];
    return (
      <td key={col.key} className={`${s.ggCell} ${bad ? s.ggEmpty : ''}`} title={bad ? stuckTitle(row.key, col.key) : undefined}>
        <div className={s.ggChips}>
          {hs.map((h) => (
            <Chip key={h.user} h={h} off={off}
              flag={flag?.(h, row.key, col.key)}
              onRemove={() => onRemove(row.key, col.key, h)} />
          ))}
          {/* ⚠️ хоосон нүдэнд «—» — «+» баруун дээд буланд тусдаа тул нүд хоосон харагдахгүй */}
          {!hs.length && open !== key && <span className={s.ggDash}>—</span>}
          {open === key ? (
            /* ⚠️ Гараар бичихгүй — порталд БАЙГАА аккаунтаас л сонгоно. */
            <select
              className={s.ggSelect}
              autoFocus
              value=""
              disabled={off}
              onBlur={() => setOpen(null)}
              onKeyDown={(e) => { if (e.key === 'Escape') setOpen(null); }}
              onChange={(e) => {
                const u = e.target.value;
                setOpen(null);
                if (u) onAdd(row.key, col.key, u);
              }}
            >
              <option value="">{cands.length ? tr('Аккаунт сонгох…') : tr('Нэмэх аккаунт алга')}</option>
              {cands.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          ) : (
            <button type="button" className={s.ggAdd} disabled={off} title={addTitle(row, col)}
              onClick={() => { if (canOpen && !canOpen()) return; setOpen(key); }}>
              +
            </button>
          )}
        </div>
      </td>
    );
  };

  return (
    <>
      {/* ⚠️ Толгой мөр ба эхний багана НААЛДАНА — гар утсанд хэвтээ гүйлгэнэ */}
      <div className={s.ggWrap} style={wrapStyle}>
        <table className={s.gg} style={tableStyle}>
          <colgroup><col style={{ width: rowWidth }} />{cols.map((c) => <col key={c.key} />)}</colgroup>
          <thead>
            <tr>
              <th className={s.ggCorner}>{corner}</th>
              {cols.map((c) => (
                <th key={c.key} className={s.ggHead} title={c.label}>
                  <span>{c.label}</span>
                  {c.count !== undefined && <span className={s.aclCount}>{c.count}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th className={`${s.ggRow} ${r.warn?.length ? s.ggRowWarn : ''}`}
                  title={r.warn?.length ? [r.label, ...r.warn].join('\n') : r.label}>
                  {r.label}
                  {!!r.warn?.length && <span className={s.ggWarn} aria-label={r.warn.join(' · ')}>⚠</span>}
                </th>
                {cols.map((c) => cell(r, c))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* ⚠️ Мөрийн гацааны анхааруулга хүснэгтийн ДООР бүтэн текстээр — толгойн ⚠ нь зөвхөн заагч */}
      {warned.length > 0 && (
        <div className={s.ggWarns}>
          {warned.flatMap((r) => r.warn!.map((m) => (
            <div key={`${r.key}|${m}`} className={s.aclErr} role="alert"><b>{r.label}:</b> {m}</div>
          )))}
        </div>
      )}
    </>
  );
}

/** Нүдэн дэх аккаунтын чип — нэр · тэмдгүүд · туг · ✕ */
function Chip({ h, off, flag, onRemove }: {
  h: GridHolder; off: boolean; flag?: ReactNode; onRemove: () => void;
}) {
  const notes = [
    h.viaAll ? tr('бүх багц') : '',
    h.gone ? tr('устгагдсан аккаунт — томилгоог ✕-ээр цэвэрлэнэ үү') : '',
    h.admin ? tr('админ — багцын хязгаар үйлчлэхгүй') : '',
    h.failed ? tr('ArcGIS-т хадгалагдсангүй — зөвхөн энэ browser-т') : '',
    h.dirty ? tr('Эрхийн мөр ArcGIS-т хадгалагдсангүй — «Хэрэглэгчдийн эрх удирдах» → «Дахин синк»') : '',
  ].filter(Boolean);
  const cls = [s.ggChip, h.viaAll ? s.ggChipAll : '', h.gone || h.admin ? s.ggChipOdd : '', h.failed || h.dirty ? s.ggChipBad : '']
    .filter(Boolean).join(' ');
  return (
    <span className={cls} title={[h.user, ...notes].join(' · ')}>
      <span className={s.ggName}>{h.user}</span>
      {h.viaAll && <span className={s.ggTag}>{tr('бүх')}</span>}
      {(h.failed || h.dirty) && <span className={s.ggWarn} aria-label={notes.join(' · ')}>!</span>}
      {flag}
      <button
        type="button"
        className={s.ggX}
        disabled={off}
        title={h.viaAll ? tr('Энэ багцаас хасах («бүх багц» → бусад багцын жагсаалт болно)') : tr('Энэ нүднээс хасах')}
        aria-label={`${tr('Энэ нүднээс хасах')}: ${h.user}`}
        onClick={onRemove}
      >
        ✕
      </button>
    </span>
  );
}
