'use client';

/**
 * ДУЛААН АВАХ ОГНОО (2026-11-23, хэрэглэгч: «ТУХ-ийн дулаан авах хавтан системээс гардаггүй — шинэ цэсэнд оруулдаг болго»).
 * Блокийн давхаргын (`BUILDING`, Bagts_ajluud/0) хоёр огноо:
 *   · `dulaan_avah_ognoo`  — ТӨЛӨВЛӨСӨН (энэ өвөл дулаан авах)
 *   · `dulaan_avsan_ognoo` — БОДИТ (дулаанд холбогдсон өдөр)
 * ТУХ-ийн «… оны өвөл дулаан авах» хавтан эндээс тоолно (`loadHeatBlocks`). Засах нь `dulaanEdit` эрхтэй аккаунтад.
 */

import { useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { num } from '@/lib/format';
import { cached } from '@/lib/live';
import { useAsync } from '@/lib/useAsync';
import { queryFeatures } from '@/lib/query';
import { BUILDING } from '@/lib/services';
import { applyAll } from '@/lib/tableWrite';
import { invalidate } from '@/lib/dataBus';
import { hasCap, subscribeCaps } from '@/lib/caps';
import { setNavDirty } from '@/lib/navGuard';
import { askConfirm } from '@/lib/confirm';
import { useAuth } from '@/components/AuthGate';
import { Data, userError } from '@/components/ui';
import { dayOf, parseDay } from '@/lib/zuragTosol';
import s from './dulaanOgnoo.module.css';

type Row = Record<string, unknown>;
const F = BUILDING.fields;
const OID = BUILDING.oid;
const DATE_FIELDS = [F.heatPlan, F.heatDone] as const;
type DateField = (typeof DATE_FIELDS)[number];
const OUT = [OID, F.bagts, F.block, F.households, ...DATE_FIELDS];
const VIEW = 'dulaan';

const LABEL: Record<DateField, () => string> = {
  [F.heatPlan]: () => tr('Дулаан авах огноо'),
  [F.heatDone]: () => tr('Дулаан авсан огноо'),
};

export const loadHeatRows = cached(
  async () => queryFeatures(BUILDING.url, { outFields: OUT, orderBy: `${F.bagts} ASC, ${F.block} ASC` }),
  5 * 60_000,
  ['BUILDING'],
);

/** Халаалтын улирал: `year`-ийн 5/16 – дараа оны 5/15 (ТУХ-ийн `heatWinterYear`-тэй нэг дүрэм) */
const seasonOf = (year: number): [string, string] => [`${year}-05-16`, `${year + 1}-05-15`];

/**
 * ТУХ-ийн хавтанд — тухайн өвөлд дулаан авахаар ТӨЛӨВЛӨСӨН блок ба тэднээс АВСАН блокийн тоо.
 * Огноо огт бөглөөгүй бол `planned: null` (хавтан «—» харуулна).
 */
export async function loadHeatBlocks(year: number): Promise<{ planned: number | null; done: number }> {
  const rows = await loadHeatRows();
  const [lo, hi] = seasonOf(year);
  const anyPlan = rows.some((r) => dayOf(r[F.heatPlan] as number | null));
  if (!anyPlan) return { planned: null, done: 0 };
  let planned = 0;
  let done = 0;
  for (const r of rows) {
    const d = dayOf(r[F.heatPlan] as number | null);
    if (!d || d < lo || d > hi) continue;
    planned += 1;
    if (dayOf(r[F.heatDone] as number | null)) done += 1;
  }
  return { planned, done };
}

type Edits = Record<number, Partial<Record<DateField, string>>>;

export function DulaanOgnoo() {
  const q = useAsync(loadHeatRows, []);
  return (
    <div className={s.wrap}>
      <header className={s.head}>
        <h1 className={s.h1}>{tr('Дулаан авах огноо')}</h1>
        <p className={s.sub}>{tr('Блок бүрийн дулаан авах (төлөвлөсөн) ба авсан (бодит) огноог оруулна. ТУХ-ийн «… оны өвөл дулаан авах» үзүүлэлт эндээс бодогдоно.')}</p>
      </header>
      <Data q={q} loading={tr('Ачаалж байна…')} minH={240}>
        {(rows) => <Body rows={rows} reload={() => q.retry?.()} />}
      </Data>
    </div>
  );
}

function Body({ rows, reload }: { rows: Row[]; reload: () => void }) {
  const [edits, setEdits] = useState<Edits>({});
  const [busy, setBusy] = useState(false);
  /** Дутуу бөглөсөн огнооны нүд (`validity.badInput`) — «${oid}|${f}». Хоосон гэж хадгалахгүй, алдаа гэж тэмдэглэнэ */
  const [partial, setPartial] = useState<ReadonlySet<string>>(() => new Set());
  /**
   * Хадгалсны дараа шинэ мөр ирэх хүртэл засварыг ХАРУУЛСААР (хуучин огноо анивчихгүй) — мөр шинэчлэгдэхэд цэвэрлэнэ.
   */
  const [awaiting, setAwaiting] = useState(false);
  const [seenRows, setSeenRows] = useState(rows);
  if (rows !== seenRows) {
    setSeenRows(rows);
    if (awaiting) { setAwaiting(false); setEdits({}); setBusy(false); }
  }
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [find, setFind] = useState('');

  const { user } = useAuth();
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((x) => x + 1)), []);
  const canEdit = useMemo(
    () => hasCap(user?.username, 'dulaanEdit'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, capN],
  );

  const byOid = useMemo(() => new Map(rows.map((r) => [Number(r[OID]), r] as const)), [rows]);
  const orig = (oid: number, f: DateField) => dayOf(byOid.get(oid)?.[f] as number | null);
  const textOf = (oid: number, f: DateField) => edits[oid]?.[f] ?? orig(oid, f);

  /** Үнэхээр өөрчлөгдсөн нүднүүд л */
  const changes = useMemo(() => {
    const out: { oid: number; f: DateField; text: string }[] = [];
    for (const [k, fs] of Object.entries(edits)) {
      const oid = Number(k);
      for (const f of DATE_FIELDS) {
        const t = fs[f];
        if (t != null && t !== dayOf(byOid.get(oid)?.[f] as number | null)) out.push({ oid, f, text: t });
      }
    }
    return out;
  }, [edits, byOid]);
  const dirty = new Set([...changes.map((c) => `${c.oid}|${c.f}`), ...partial]).size;

  useEffect(() => {
    setNavDirty(VIEW, dirty > 0, tr('Хадгалаагүй засвар: {0}', tr('Дулаан авах огноо')));
    if (!dirty) return undefined;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  useEffect(() => () => setNavDirty(VIEW, false), []);

  const groups = useMemo(() => {
    const needle = find.trim().toLowerCase();
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const pkg = String(r[F.bagts] ?? '').trim() || tr('Багцгүй');
      const hay = `${pkg} ${r[F.block] ?? ''}`.toLowerCase();
      if (needle && !hay.includes(needle)) continue;
      const a = m.get(pkg) ?? [];
      a.push(r);
      m.set(pkg, a);
    }
    return [...m.entries()];
  }, [rows, find]);

  const edit = (oid: number, f: DateField, text: string, badInput = false) => {
    if (!canEdit || busy) return;
    setMsg(null);
    const k = `${oid}|${f}`;
    /* Дутуу огноо (жишээ нь он нь бүтэн биш) — хөтөч '' өгдөг; «арилгасан» гэж хадгалахгүй, алдаа гэж тэмдэглэнэ */
    /* Утга нь '' (хөтөчтэй ижил — controlled input-ийг сэргээж бичилтийг таслахгүй), харин «дутуу» гэж тэмдэглэнэ */
    setPartial((cur) => { if (badInput === cur.has(k)) return cur; const nx = new Set(cur); if (badInput) nx.add(k); else nx.delete(k); return nx; });
    setEdits((e) => ({ ...e, [oid]: { ...e[oid], [f]: text } }));
  };

  const discard = async () => {
    if (busy || !dirty) return;
    if (!(await askConfirm(tr('Хадгалаагүй {0} нүдний засварыг буцаах уу?', dirty), { ok: tr('Буцаах') }))) return;
    setEdits({});
    setPartial(new Set());
    setErr(null);
    setMsg(null);
  };

  const save = async () => {
    if (busy || !dirty || !canEdit) return;
    setErr(null);
    setMsg(null);
    /* Огноо шалгах — дутуу бөглөсөн нүд ба буруу утга */
    if (partial.size) {
      setErr(tr('Огноо дутуу бөглөгдсөн ({0} нүд) — бүтэн оруулна уу эсвэл арилгана уу.', partial.size));
      return;
    }
    const bad = changes.filter((c) => !parseDay(c.text).ok);
    if (bad.length) {
      setErr(tr('Огноо буруу (YYYY-MM-DD): {0}', bad.slice(0, 5).map((c) => `${byOid.get(c.oid)?.[F.block] ?? c.oid}`).join(', ')));
      return;
    }
    const pairBad = [...new Set(changes.map((c) => c.oid))].filter((oid) => {
      const p = textOf(oid, F.heatPlan);
      const d = textOf(oid, F.heatDone);
      return !!d && !p;
    });
    if (pairBad.length) {
      setErr(tr('Дулаан авсан огноотой блокт дулаан авах (төлөвлөсөн) огноо заавал хэрэгтэй: {0}', pairBad.slice(0, 5).map((o) => String(byOid.get(o)?.[F.block] ?? o)).join(', ')));
      return;
    }
    setBusy(true);
    let done = false;
    try {
      const oids = [...new Set(changes.map((c) => c.oid))];
      /* Зэрэг засварын хамгаалалт — энэ хооронд өөр хүн өөрчилсөн бол бичихгүй */
      const fresh = await queryFeatures(BUILDING.url, { where: `${OID} IN (${oids.join(',')})`, outFields: OUT });
      const freshBy = new Map(fresh.map((r) => [Number(r[OID]), r] as const));
      const clash = changes.filter((c) => dayOf(freshBy.get(c.oid)?.[c.f] as number | null) !== orig(c.oid, c.f));
      if (clash.length || fresh.length !== oids.length) {
        setErr(tr('Өөр хэрэглэгч энэ хооронд өөрчилсөн байна ({0}). Дахин ачаалж шинэ утгаар засна уу.',
          [...new Set(clash.map((c) => String(byOid.get(c.oid)?.[F.block] ?? c.oid)))].slice(0, 5).join(', ') || tr('мөр олдсонгүй')));
        return;
      }
      const updates = oids.map((oid) => {
        const u: Record<string, unknown> = { [OID]: oid };
        for (const c of changes) if (c.oid === oid) { const p = parseDay(c.text); u[c.f] = p.ok ? p.v : null; }
        return u;
      });
      const { n } = await applyAll(BUILDING.url, OID, { updates }, { cap: 'dulaanEdit' });
      invalidate('BUILDING');
      setMsg(tr('{0} блок хадгалагдав', n));
      /* Шинэ мөр ирэх хүртэл засвар харагдсаар, түгжээтэй; ирэхгүй бол 8 сек дараа түгжээ тайлагдана */
      done = true;
      setAwaiting(true);
      reload();
      setTimeout(() => { setAwaiting(false); setBusy(false); }, 8000);
    } catch (x) {
      setErr(userError(x));
    } finally {
      if (!done) setBusy(false);
    }
  };

  if (!rows.length) {
    return <div className={s.notice}><b>{tr('Блок алга байна.')}</b></div>;
  }

  const filled = (f: DateField) => rows.filter((r) => textOf(Number(r[OID]), f)).length;

  return (
    <div className={s.card}>
      <div className={s.tools}>
        <input
          className={s.search}
          type="search"
          value={find}
          placeholder={tr('Багц, блокоор хайх')}
          aria-label={tr('Багц, блокоор хайх')}
          onChange={(e) => setFind(e.target.value)}
        />
        <span className={s.sum}>
          {tr('{0} блок · төлөвлөсөн {1} · авсан {2}', num(rows.length), num(filled(F.heatPlan)), num(filled(F.heatDone)))}
        </span>
        <span className={s.spacer} />
        {!canEdit && <span className={s.ro}>{tr('Зөвхөн харах')}</span>}
        <button
          type="button"
          className={s.ghost}
          disabled={busy}
          onClick={() => invalidate('BUILDING')}
          title={tr('Дахин ачаалах')}
          aria-label={tr('Дахин ачаалах')}
        >↻</button>
      </div>

      <div className={s.scroll}>
        <table className={s.tbl}>
          <thead>
            <tr>
              <th>{tr('Блок')}</th>
              <th className={s.r}>{tr('Айл')}</th>
              {DATE_FIELDS.map((f) => <th key={f}>{LABEL[f]()}</th>)}
            </tr>
          </thead>
          <tbody>
            {groups.map(([pkg, list]) => (
              <GroupRows key={pkg} pkg={pkg} list={list} canEdit={canEdit} busy={busy} textOf={textOf} orig={orig} edit={edit} partial={partial} />
            ))}
          </tbody>
        </table>
        {groups.length === 0 && <p className={s.hint}>{tr('Тохирох мөр алга.')}</p>}
      </div>

      {canEdit && (
        <div className={s.bar}>
          {err && <span className={s.err} role="alert">{err}</span>}
          {msg && <span className={s.ok} role="status">{msg}</span>}
          <span className={s.spacer} />
          <button type="button" className={s.ghost} disabled={busy || !dirty} onClick={discard}>{tr('Буцаах')}</button>
          <button type="button" className={s.save} disabled={busy || !dirty} onClick={save}>
            {busy ? tr('Хадгалж байна…') : tr('Хадгалах ({0})', dirty)}
          </button>
        </div>
      )}
    </div>
  );
}

function GroupRows({ pkg, list, canEdit, busy, textOf, orig, edit, partial }: {
  pkg: string;
  list: Row[];
  canEdit: boolean;
  busy: boolean;
  textOf: (oid: number, f: DateField) => string;
  orig: (oid: number, f: DateField) => string;
  edit: (oid: number, f: DateField, text: string, badInput?: boolean) => void;
  /** Дутуу бөглөсөн огнооны нүд — «oid|талбар» */
  partial: ReadonlySet<string>;
}) {
  const ail = list.reduce((a, r) => a + (Number(r[F.households]) || 0), 0);
  return (
    <>
      <tr className={s.pkgRow}>
        <td colSpan={2 + DATE_FIELDS.length}>
          {pkg}
          <span className={s.sum}>{tr('{0} блок · {1} айл', num(list.length), num(ail))}</span>
        </td>
      </tr>
      {list.map((r) => {
        const oid = Number(r[OID]);
        return (
          <tr key={oid} className={s.leafRow}>
            <td>{String(r[F.block] ?? '—')}</td>
            <td className={s.r}>{r[F.households] == null ? '—' : num(Number(r[F.households]))}</td>
            {DATE_FIELDS.map((f) => {
              const v = textOf(oid, f);
              if (!canEdit) return <td key={f}>{v || '—'}</td>;
              const changed = v !== orig(oid, f) || partial.has(`${oid}|${f}`);
              const bad = !parseDay(v).ok || partial.has(`${oid}|${f}`);
              return (
                <td key={f}>
                  <input
                    className={`${s.inp} ${s.inpDate} ${changed ? s.inpDirty : ''} ${bad ? s.inpBad : ''}`}
                    type="date"
                    value={v}
                    readOnly={busy}
                    aria-invalid={bad || undefined}
                    aria-label={`${pkg} ${String(r[F.block] ?? '')} ${LABEL[f]()}`}
                    onChange={(e) => edit(oid, f, e.target.value, e.target.validity.badInput)}
                  />
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}
