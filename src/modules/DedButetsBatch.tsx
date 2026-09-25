'use client';

/**
 * ОЛОН ОБЪЕКТЫН АТРИБУТЫГ НЭГ ДОР ЗАСАХ — маягт (2026-09-16).
 *
 * ⚠️ Хэрэглэгчийн хүсэлт: «нэг мэдээллийн олон мөрийг select хийгээд нэг
 * бөглөхөд тэр select хийсэн мэдээлэлүүд бүгд бөглөгддөг — ArcGIS Pro-гийн
 * Calculate Field шиг, гэхдээ илүү амар». Сонголт: (1) зураг дээр товшиж
 * нэмэх/хасах, (2) тэгш өнцөгт татаж дотор нь орсныг авах — хоёулаа
 * `DedButets`-д; энэ файл зөвхөн МАЯГТ.
 *
 * ⚠️ МАЯГТ ОДООГИЙН УТГААР БӨГЛӨГДӨНӨ (2026-09-16-ны засвар: хэрэглэгч
 * «мэдээлэл нь бөглөгдөхгүй байна» гэсэн — бүх талбар хоосон эхэлж байсныг
 * дан маягттай зөрүүтэй гэж уншсан). Pro-гийн attribute pane-ийн олон
 * сонголтын зан: сонгосон БҮХ мөрд ИЖИЛ утгатай талбар тэр утгаараа, ЗӨРҮҮТЭЙ
 * талбар хоосон «— олон утга —» гэж гарна. Хэрэглэгч ямар ч талбарыг
 * өөрчлөвөл тэр талбар л сонгосон бүх мөрөнд бичигдэнэ; хөндөөгүй талбар
 * (ижил ч бай, зөрүүтэй ч бай) ХЭВЭЭР үлдэнэ.
 *
 * ⚠️ ХООСЛОХ: ижил утгатай талбарыг хоослоход `null` бичигдэнэ (дан маягтын
 * `diffRow` дүрэм). Зөрүүтэй талбарыг хоосон орхих нь «бүү хөндө» — түүнийг
 * хоослох боломж энэ маягтад ЗОРИУДААР байхгүй (санамсаргүй олон мөр
 * хоослохоос сэргийлнэ); мөр бүрээр дан маягтаар хийнэ.
 *
 * ⚠️ ОРОЛТ нь дан маягттай ЯГ ИЖИЛ (`FieldInput`) — домэйн, тоон оролт,
 * уртын хязгаар хоёр газарт зөрөхгүй.
 *
 * ⚠️ БУЦААЛТ нь мөр бүрийн ӨӨРИЙН хуучин утга: мөрүүд аль хэдийн татагдсан
 * (`rows`) тул бичихээс өмнө дахин татахгүй — өөрчлөгдсөн талбар бүрийн
 * урьдын утгыг мөр тус бүрээр хадгална.
 *
 * ⚠️ БАТАЛГААЖУУЛАЛТ ЗААВАЛ: нэг товшилтоор олон мөр өөрчлөгдөнө, ArcGIS-д
 * гүйлгээний түүх байхгүй. Тоо, талбарын тоог ил хэлж асууна.
 */

import { useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { num } from '@/lib/format';
import type { Row } from '@/lib/query';
import {
  loadLayerMeta, loadRows, saveRows, validateRow,
  type LayerMeta, type Patch,
} from '@/lib/butetsEdit';
import { FieldInput, type UndoInfo } from './DedButetsEdit';
import d from './dedButets.module.css';

const str = (v: unknown): string => (v == null ? '' : String(v));

/** Талбар бүрийн эхлэл: ижил утга (мөр) эсвэл `null` = зөрүүтэй */
type Base = Record<string, string | null>;

const baseOf = (meta: LayerMeta, rows: Row[]): Base => {
  const b: Base = {};
  for (const f of meta.fields) {
    let v: string | null | undefined;
    for (const r of rows) {
      const s = str(r[f.name]);
      if (v === undefined) v = s;
      else if (v !== s) { v = null; break; }
    }
    /* ⚠️ `v ?? ''' БИШ: `null` нь «мөрүүд ЗӨРҮҮТЭЙ» гэсэн тэмдэг бөгөөд
       хоосон мөр рүү хувиргавал «— олон утга —» тайлбар ХЭЗЭЭ Ч гарахгүй.
       Зөвхөн МӨР ОГТ БАЙХГҮЙ үед (`undefined`) хоосон болно. */
    b[f.name] = v === undefined ? '' : v;
  }
  return b;
};

export function DedButetsBatch({
  layerId, oids, canEdit, onDone, onPartial,
}: {
  layerId: string;
  /** Сонгосон объектуудын дугаар — нэг давхаргынх */
  oids: number[];
  canEdit: boolean;
  /**
   * Амжилттай бичсэний дараа: хэдэн МӨР бичигдсэн, хэдэн ТАЛБАР, буцаалт.
   * ⚠️ `undo.rows` нь зөвхөн бодитоор бичигдсэн мөрүүд (багц дундаа унавал
   * өмнөх багцууд бичигдсэн байдаг — `saveRows`-ийн тайлбар).
   */
  onDone: (rows: number, fields: number, undo: UndoInfo | null) => void;
  /**
   * ХЭСЭГЧИЛСЭН бичилт — зарим багц бичигдээд дараагийнх унасан (2026-09-25).
   * ⚠️ `undo` нь зөвхөн БИЧИГДСЭН мөрүүдийнх. Маягт хаагдахгүй (дахин
   *    «Хадгалах» боломжтой) — дуудагч давхаргаа дахин уншуулж, буцаалт тавина.
   */
  onPartial?: (undo: UndoInfo | null) => void;
}) {
  const [meta, setMeta] = useState<LayerMeta | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [base, setBase] = useState<Base>({});
  const [p, setP] = useState<Patch>({});
  const [load, setLoad] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const [fail, setFail] = useState('');

  /* ⚠️ `oids` нь дуудагч талд шинэ массив ирж болно — агуулгаар харьцуулна */
  const oidKey = useMemo(() => [...oids].sort((a, b) => a - b).join(','), [oids]);

  /**
   * БИЧИХИЙН ӨМНӨХ АСУУЛТ — маягт дотор мөр («Тийм»/«Үгүй»).
   *
   * ⚠️ 2026-09-23: `window.confirm` хөтчид хаагдсан үед («энэ хуудас дахин
   * харилцах цонх гаргахыг хориглох») үргэлж `false` буцаан ОЛНООР ХАДГАЛАХ
   * ЧИМЭЭГҮЙ зогсдог байв. Асуултыг самбарт гаргана; талбар засвал арилна.
   */
  const [ask, setAsk] = useState(false);

  /**
   * СҮҮЛД АМЖИЛТТАЙ УНШСАН сонголтын түлхүүр (`layerId|oidKey`).
   *
   * ⚠️ 2026-09-25: `write()` нь ОДООГИЙН `oids`-ийг СҮҮЛД уншсан `meta`/`rows`/
   *    `base`-тэй хольдог байв. Асуулт нээлттэй байхад сонголт солигдож дахин
   *    уншиж байх зуур (эсвэл уншилт унасны дараа) «Тийм» дарвал өмнөх
   *    давхаргын схемээр шинэ OID-д бичиж (өөр объект засагдана), шинэ
   *    объектууд буцаалтгүй үлддэг байв. Одоо түлхүүр таарахгүй бол бичихгүй.
   */
  const [loadedKey, setLoadedKey] = useState('');
  const curKey = `${layerId}|${oidKey}`;
  const stale = loadedKey !== curKey;

  /**
   * СХЕМ + СОНГОСОН МӨРҮҮД — сонголт солигдох бүрд.
   *
   * ⚠️ Хэрэглэгчийн БИЧСЭН зүйлийг ХАДГАЛНА: объект нэмж/хасахад маягт
   * тэглэгдвэл олон объект түүж явах зуур бичсэн утга алга болно. Зөвхөн
   * хөндөөгүй талбарууд шинэ ижил утгаараа шинэчлэгдэнэ.
   */
  useEffect(() => {
    let alive = true;
    /* ⚠️ Хуучин сонголтын асуулт ХААГДАНА — «Тийм» нь шинэ сонголтын тоогоор биш
       хуучин асуултаар бичилт явуулах байв (`loadedKey`-ийн тайлбар) */
    setLoad(true); setFail(''); setErr({}); setAsk(false);
    (async () => {
      const m = await loadLayerMeta(layerId);
      const rs = oids.length ? await loadRows(m, oids) : [];
      return { m, rs };
    })()
      .then(({ m, rs }) => {
        if (!alive) return;
        const b = baseOf(m, rs);
        setMeta(m); setRows(rs); setBase(b);
        setLoadedKey(`${layerId}|${oidKey}`);
        /* ⚠️ ӨӨР ДАВХАРГА (2026-09-25) — өмнөх давхаргад бичсэн утга ижил нэртэй
           талбараар энд «өөрчилсөн» болж орохгүй: хуучин `base` нь өөр схемийнх.
           (Дуудагч `key={layerId}`-ээр аль хэдийн шинэ инстанц үүсгэдэг — энэ нь
           нөөц хамгаалалт.) `loadedKey` нь өмнөх амжилттай уншилтынх. */
        const sameLayer = loadedKey.split('|')[0] === layerId;
        setP((prev) => {
          const next: Patch = {};
          for (const f of m.fields) {
            const typed = sameLayer ? prev[f.name] : undefined;
            /* Хэрэглэгч хөндсөн (өмнөх эхлэлээс өөр) бол үлдээнэ, үгүй бол шинэ эхлэл */
            const untouched = typed === undefined || typed === (base[f.name] ?? '');
            next[f.name] = untouched ? (b[f.name] ?? '') : typed;
          }
          return next;
        });
      })
      .catch((e) => alive && setFail(String((e as Error).message || e)))
      .finally(() => alive && setLoad(false));
    return () => { alive = false; };
    // ⚠️ `base` нь энд ЗӨВХӨН хуучин эхлэлийг харьцуулахад — deps-д авбал
    //    өөрөө өөрийгөө сэргээж гогцоо үүснэ. `oidKey` нь `oids`-ийг орлоно.
    //    `loadedKey` мөн адил (өмнөх уншилтын давхаргыг л уншина).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerId, oidKey]);

  const set = (name: string, v: string) => {
    setP((x) => ({ ...x, [name]: v }));
    setErr((x) => ({ ...x, [name]: '' }));
    setFail('');
    setAsk(false);
  };

  /** ӨӨРЧЛӨГДСӨН талбарууд — эхлэлээс өөр утгатай нь л бичигдэнэ */
  const changed = useMemo(() => {
    if (!meta) return [] as string[];
    return meta.fields
      .map((f) => f.name)
      .filter((k) => (p[k] ?? '') !== (base[k] ?? ''));
  }, [meta, p, base]);

  /** Шалгуур давбал асуулт гарна; бичилт нь `write`-д («Тийм»-ээс) */
  /** Сонголт уншигдаж дуусаагүй/унасан үеийн мэдэгдэл (`loadedKey`-ийн тайлбар) */
  const staleMsg = () => tr('Сонгосон объектуудын утга уншигдаагүй байна. Сонголтоо шинэчлээд дахин оролдоно уу.');

  const submit = () => {
    if (!meta || !rows || !oids.length) return;
    if (stale) { setFail(staleMsg()); return; }
    if (!changed.length) { setFail(tr('Өөрчилсөн талбар алга.')); return; }
    /* Шалгуур — зөвхөн өөрчилсөн талбарт (`validateRow`-ийн дүрэм) */
    const sub: Patch = {};
    for (const k of changed) sub[k] = p[k] ?? '';
    const e = validateRow({ ...meta, fields: meta.fields.filter((f) => changed.includes(f.name)) }, sub);
    setErr(e);
    if (Object.values(e).some(Boolean)) return;
    setAsk(true);
  };

  const write = async () => {
    if (!meta || !rows || !oids.length) return;
    setAsk(false);
    /* ⚠️ Уншсан сонголт ОДООГИЙНХТОЙ таарахгүй бол бичихгүй (`loadedKey`) */
    if (stale) { setFail(staleMsg()); return; }
    const fieldOf = new Map(meta.fields.map((f) => [f.name, f]));
    const attrs: Record<string, unknown> = {};
    for (const k of changed) {
      const v = p[k] ?? '';
      /* ⚠️ Хоосон → `null` (`diffRow`-ийн дүрэм) — ижил утгыг хоослох зам */
      attrs[k] = v === '' ? null : fieldOf.get(k)?.kind === 'number' ? Number(v) : v;
    }

    /* Буцаалт — мөр бүрийн өөрийн хуучин утга (аль хэдийн татагдсан `rows`).
       ⚠️ `try`-ийн ГАДНА — хэсэгчилсэн алдааны `catch`-д ч хэрэгтэй. */
    const undoRows = rows.map((row) => {
      const oid = Number(row[meta.oidField]);
      const back: Record<string, unknown> = {};
      for (const k of changed) {
        const was = str(row[k]);
        if (was === String(p[k] ?? '')) continue;
        back[k] = was === '' ? null : fieldOf.get(k)?.kind === 'number' ? Number(was) : was;
      }
      return { oid, attrs: back };
    });
    const undoOf = (written: number[]): UndoInfo | null => {
      const doneSet = new Set(written);
      const u = undoRows.filter((r) => doneSet.has(r.oid) && Object.keys(r.attrs).length);
      return u.length ? { kind: 'batch', rows: u } : null;
    };
    /* ⚠️ Бичих OID нь УНШСАН мөрүүдийнх (2026-09-25) — буцаалт (`undoRows`) ч
       яг тэднээс бэлтгэгддэг тул буцаалтгүй бичигдэх мөр үлдэхгүй. */
    const writeOids = undoRows.map((r) => r.oid).filter((n) => Number.isFinite(n));

    setBusy(true); setFail('');
    try {
      const done = await saveRows(meta, writeOids, attrs);
      const undo = undoOf(done);
      /* Бичигдсэн утга одоо бүх мөрд ижил — эхлэл нь шинэ утга болно */
      const nb: Base = { ...base };
      for (const k of changed) nb[k] = p[k] ?? '';
      setBase(nb);
      /* ⚠️ Амжилтын мэдэгдлийг ЭНД гаргахгүй: дуудагч тал хадгалсны дараа
         сонголтыг цэвэрлэдэг тул энэ бүрэлдэхүүн тэр агшинд САЛНА. Мэдэгдэл
         нь самбарын түвшинд (`DedButets` §mselOk) амьдарна. */
      onDone(done.length, changed.length, undo);
    } catch (x) {
      /* ⚠️ Маягт ХААГДАХГҮЙ — бичсэн зүйл үлдэнэ */
      const partial = (x as { done?: number[] }).done;
      const msg = String((x as Error).message || x);
      /* ⚠️ Бичигдсэн багцуудыг дуудагчид мэдэгдэнэ (2026-09-25, `onPartial`) —
         давхарга дахин уншигдаж, бичигдсэн мөрүүдэд буцаалт тавигдана. */
      if (partial?.length) onPartial?.(undoOf(partial));
      setFail(partial?.length
        ? tr('Эхний {0} мөр бичигдсэн, дараа нь алдаа: {1}. Дахин «Хадгалах» дарвал үлдсэнийг бичнэ.', partial.length, msg)
        : msg);
    } finally {
      setBusy(false);
    }
  };

  if (load && !meta) return <p className={d.modalMsg}>{tr('Ачаалж байна…')}</p>;
  if (!meta) return <p className={d.modalMsg}>{fail || tr('Схем татагдсангүй.')}</p>;

  return (
    <div className={d.form}>
      {meta.fields.length === 0 ? (
        <p className={d.modalMsg}>{tr('Энэ давхаргад засагдах атрибут байхгүй.')}</p>
      ) : (
        <>
          <p className={d.fHint}>
            {load
              ? tr('Сонгосон объектуудын утгыг уншиж байна…')
              : tr('Ижил утгатай талбар утгаараа, зөрүүтэй нь «— олон утга —» гэж гарна. Өөрчилсөн талбар л бүгдэд бичигдэнэ.')}
          </p>
          {meta.fields.map((f) => {
            const mixed = base[f.name] === null;
            const dirty = changed.includes(f.name);
            return (
              <FieldInput
                key={f.name}
                f={f}
                value={p[f.name] ?? ''}
                err={err[f.name]}
                disabled={!canEdit || busy || load}
                onChange={(v) => set(f.name, v)}
                placeholder={mixed ? tr('— олон утга —') : undefined}
                hint={dirty && (
                  <span className={d.fHint}>
                    {tr('{0} объектод бичигдэнэ', num(oids.length))}
                  </span>
                )}
              />
            );
          })}
        </>
      )}
      {!meta.canUpdate && (
        <div className={d.formErr} role="alert">{tr('Энэ давхарга засварыг зөвшөөрөхгүй байна')}</div>
      )}
      {fail && <div className={d.formErr} role="alert">{fail}</div>}
      {/* Самбарын асуулт — `ask`-ийн тайлбар */}
      {ask && (
        <div className={d.askRow} role="alertdialog">
          <span className={d.askMsg}>
            {tr(
              '{0} объектын {1} талбарыг бичих үү? Бүх сонгосон объектод ижил утга орно.',
              num(oids.length), num(changed.length),
            )}
          </span>
          {/* ⚠️ Дахин уншиж байх зуур / уншилт таараагүй үед хаалттай (`loadedKey`) */}
          <button type="button" className={d.primary} onClick={() => { void write(); }}
            disabled={busy || load || stale}>
            {tr('Тийм')}
          </button>
          <button type="button" className={d.btn} onClick={() => setAsk(false)} disabled={busy}>
            {tr('Үгүй')}
          </button>
        </div>
      )}
      <div className={d.actions}>
        <span className={d.spacer} />
        <button
          type="button"
          className={d.primary}
          onClick={submit}
          disabled={busy || load || !canEdit || !meta.canUpdate || !oids.length || !changed.length}
          title={!changed.length ? tr('Эхлээд өөрчлөх талбараа бөглөнө үү') : undefined}
        >
          {busy
            ? tr('Хадгалж байна…')
            : changed.length
              ? tr('{0} талбарыг {1} объектод бичих', num(changed.length), num(oids.length))
              : tr('{0} объектод бичих', num(oids.length))}
        </button>
      </div>
    </div>
  );
}
