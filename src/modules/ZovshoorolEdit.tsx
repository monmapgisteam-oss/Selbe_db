'use client';

/**
 * ЗӨВШӨӨРӨЛ НЭМЭХ / ЗАСАХ МАЯГТ.
 *
 * ⚠️ Зарчим: маягт нь хэрэглэгчийн оруулсныг ЧИМЭЭГҮЙ ЗАСАХГҮЙ. Зөрчлийг
 * зөвхөн хэлж, хаана байгааг нэрлэж өгнө. Автоматаар «зөв болгосон» утга нь
 * хэрэглэгчийн мэдэлгүй өөр өгөгдөл болж хадгалагдана.
 *
 * ⚠️ Хадгалах амжилтгүй бол маягт ХААГДАХГҮЙ — оруулсан утга алдагдахгүй.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusTrap } from '@/lib/useFocusTrap';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { buildPacks } from '@/modules/Bagts';
import { useBuildings } from '@/modules/BuildingPanel';
import {
  TOLOV, ZovClashError, deleteZov, loadOneZov, loadZovFieldLens, saveZov, validateZov,
  type Tolov, type Zov, type ZovDraft, type ZovFieldLens,
} from '@/lib/zovshoorol';
import { setNavDirty } from '@/lib/navGuard';
import s from './zovshoorol.module.css';
import { userError } from '@/components/ui';
import { DateField } from '@/modules/huvaari/DateField';
import { isLostResponse } from '@/lib/butetsEdit';
import { invalidate } from '@/lib/dataBus';

/** ms → YYYY-MM-DD (UTC). Огноогүй бол хоосон. */
const toInput = (ms: number | null): string => {
  if (ms == null) return '';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
};

/** YYYY-MM-DD → ms (UTC). ⚠️ Орон нутгийн бүсээр уншвал нэг хоног ухарна. */
const fromInput = (v: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

const TOLOV_LIST: Exclude<Tolov, 'unknown'>[] = [TOLOV.wait, TOLOV.ok, TOLOV.no];

/* ⚠️ 2026-09-25: төлөв нь ArcGIS-ийн ӨГӨГДӨЛ — товчинд `tr()`-ийн статик
   түлхүүрээр харуулна (`Zovshoorol.TOLOV_TEXT`-ийн ижил шалтгаан; тэр файл энэ
   файлыг импортолдог тул эргэх импорт үүсгэхгүйн тулд энд давтав). */
const TOLOV_LABEL: Record<Exclude<Tolov, 'unknown'>, () => string> = {
  [TOLOV.wait]: () => tr('Хүлээгдэж буй'),
  [TOLOV.ok]: () => tr('Зөвшөөрсөн'),
  [TOLOV.no]: () => tr('Зөвшөөрөөгүй'),
};

export function ZovshoorolEdit({ init, all, onDone, onCancel }: {
  init: ZovDraft;
  all: Zov[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<ZovDraft>(init);
  /* ⚠️ 2026-09-25 аудит: МАЯГТ НЭЭГДЭХ ҮЕИЙН АГШИН — `saveZov`-ийн ялгааны суурь.
     Урьд нь суурь өгөхгүй тул `saveZov` ШИНЭ мөрийг уншиж жишдэг байв: маягт
     нээгдсэний дараа өөр хүний зассан талбар «ялгаа» болж, маягтын ХУУЧИН утгаар
     чимээгүй дарагдана. Одоо зөвхөн ЭНЭ хэрэглэгчийн өөрчилсөн талбар бичигдэнэ. */
  const [before] = useState<Zov | null>(() =>
    (init.oid ? all.find((r) => r.oid === init.oid) ?? null : null));
  /**
   * ⚠️ ХӨНДӨГДСӨН ЭСЭХ — санамсаргүй хаалтаас хамгаална. Гадуур дарах,
   * Esc дарах нь маягтыг ХААДАГ тул урт тайлбар бичсэн хүн нэг товшилтоор
   * бүгдийг алдаж болно. Өөрчлөлт байвал баталгаажуулна.
   */
  const dirty = useRef(false);
  /* ⚠️ 2026-09-30: `navGuard` — харагдац солих / лого / «Гарах» үед ч асууна (урьд нь
     зөвхөн модал хаах, F5-д). Маягт хаагдахад (unmount) туг арилна. */
  const markDirty = () => {
    dirty.current = true;
    setNavDirty('zovshoorol', true, tr('Зөвшөөрөл'));
  };
  useEffect(() => () => setNavDirty('zovshoorol', false), []);
  /* ⚠️ Фокусын урхи (2026-09-03-ны хүртээмжийн аудит) — `aria-modal` нь
     хөтчийн Tab-д нөлөөлдөггүй, урхигүй бол фокус ард руу гарна. */
  const mdRef = useRef<HTMLDivElement>(null);
  useFocusTrap(mdRef);
  const [err, setErr] = useState<Partial<Record<keyof ZovDraft, string>>>({});
  const [fail, setFail] = useState('');
  const [busy, setBusy] = useState(false);
  /* ⚠️ 2026-10-06: ШИНЭ зөвшөөрлийн хариу алдагдсан (timeout/сүлжээ) — сервер бичсэн эсэх
     ТОДОРХОЙГҮЙ. Хэрэглэгч шалгаж баталгаажуулах хүртэл «Хадгалах» хаалттай; эс бөгөөс
     дахин дарахад ДАВХАРДСАН зөвшөөрөл үүсдэг байв (`DedButetsEdit`-ийн `unsure` загвар). */
  const [unsure, setUnsure] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);
  const editing = init.oid != null;
  /* ⚠️ 2026-10-09: текст талбарын дээд урт — метадатагаас (`zovshoorol.loadZovFieldLens`);
     уншигдаагүй бол хуучин хатуу утга НӨӨЦ (хязгааргүй болгохгүй). */
  const [lens, setLens] = useState<ZovFieldLens>({});
  useEffect(() => {
    let alive = true;
    void loadZovFieldLens().then((l) => { if (alive) setLens(l); });
    return () => { alive = false; };
  }, []);

  useEffect(() => { firstRef.current?.focus(); }, []);
  /** Хаахыг оролдох — өөрчлөлт байвал асууна. */
  const tryClose = useCallback(() => {
    if (busy) return;
    if (dirty.current && !window.confirm(tr('Хадгалаагүй өөрчлөлт байна. Хаах уу?'))) return;
    onCancel();
  }, [busy, onCancel]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') tryClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [tryClose]);

  /*
   * ⚠️ Нийтлээгүй засвартай байхад таб ХААХАД/дахин ачаалахад хөтөч
   *    анхааруулна. `tryClose` нь зөвхөн МОДАЛ хаах үед асуудаг тул F5,
   *    таб хаах, буцах товчинд бөглөсөн маягт ЧИМЭЭГҮЙ алдагддаг байв
   *    (2026-09-02 аудит). Finance · Huvaari · FillNew · Pivot · UserAdmin
   *    бүгд ийм хамгаалалттай — эдгээр маягт л гацсан байсан.
   * ⚠️ `dirty` нь ref тул render дахин хийгддэггүй. Тиймээс сонсогчийг
   *    БАЙНГА бүртгэж, дотроос нь ref-ээ уншина: `dirty.current`-ыг deps-д
   *    тавьбал өөрчлөлт мэдрэгдэхгүй.
   */
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  /**
   * БАГЦЫН СОНГОЛТ — «Багцын гүйцэтгэл» харагдацын ЯГ ТЭР жагсаалтаас.
   *
   * ⚠️ Урьд нь `PKG_GROUPS` (бөглөх хуудсуудын 7 багц) ашиглаж байв. Тэр нь
   * ЗӨВХӨН барилга угсралтын багцууд — дэд бүтэц, нийгмийн барилга, өндөржилт
   * огт байхгүй. Зөвшөөрөл нь бүх төрлийн багцад шаардлагатай тул хяналтын
   * жагсаалтаас авна: ингэснээр нэрс ч ижил бичигдэж, хоёр хуудас хоорондоо
   * тааруулагдана.
   *
   * ⚠️ Бүртгэлд аль хэдийн байгаа багцыг ч нэмнэ — давхарга уншигдаагүй
   * эсвэл нэр өөрчлөгдсөн үед хуучин мөр сонголтоос алга болох ёсгүй.
   */
  const bq = useBuildings();
  /* ⚠️ Хамаарал нь `bq` БИШ мөрүүд өөрсдөө: `useAsync` нь зурагдал бүрд
     ШИНЭ объект буцаадаг тул `bq`-ээр хамаарвал memo ажиллахгүй, багцын
     жагсаалт товшилт бүрд дахин угсрагдана. */
  const bRows = bq.state === 'ready' ? bq.data.rows : null;
  const bagtsOpts = useMemo(() => {
    const set = new Set<string>(buildPacks(bRows).map((p) => p.name));
    for (const r of all) if (r.bagts) set.add(r.bagts);
    return [...set].sort((a, b) => a.localeCompare(b, 'mn', { numeric: true }));
  }, [all, bRows]);

  /**
   * Багц солиход ДАРААЛЛЫГ санал болгоно (сүүлийнх + 1).
   * ⚠️ Энэ нь САНАЛ — хэрэглэгч гараар өөрчилж болно.
   */
  const nextShat = (bagts: string): number => {
    const mine = all.filter((r) => r.bagts === bagts && r.oid !== d.oid);
    return mine.length ? Math.max(...mine.map((r) => r.shat)) + 1 : 1;
  };

  const set = (k: keyof ZovDraft, v: unknown) => {
    markDirty();
    setD((p) => ({ ...p, [k]: v }) as ZovDraft);
    setErr((p) => ({ ...p, [k]: undefined }));
    setFail('');
  };

  /** Огнооны талбарт бичсэн текст огноо болж задрахгүй байна (`DateField.onBad`) */
  const [badDate, setBadDate] = useState(false);
  /**
   * ⚠️ 2026-10-05: ТӨЛӨВ СОЛИХ. «Хүлээгдэж буй» руу шилжихэд огноог ЭНД (товшилтын
   *    хариуд, сануулгатай) арилгана — урьд нь `validateZov` «огноо байх ёсгүй» гэж
   *    унаж, хэрэглэгч огноог гараар хоослох хүртэл хадгалагддаггүй байв. Арилгасан
   *    огноог санаж, буцаад «Зөвшөөрсөн/Зөвшөөрөөгүй» болгоход сэргээнэ (андуурч дарсан
   *    товшилт огноог алдагдуулахгүй). `validateZov` хэвээр — тэр засдаггүй, зөвхөн хэлдэг.
   */
  const stashOgnoo = useRef<number | null>(null);
  const [ognooCleared, setOgnooCleared] = useState(false);
  const setTolov = (t: ZovDraft['tolov']) => {
    markDirty();
    let ognoo = d.ognoo;
    if (t === TOLOV.wait && d.ognoo != null) {
      stashOgnoo.current = d.ognoo;
      ognoo = null;
      setOgnooCleared(true);
    } else if (t !== TOLOV.wait) {
      if (d.tolov === TOLOV.wait && d.ognoo == null && stashOgnoo.current != null) ognoo = stashOgnoo.current;
      setOgnooCleared(false);
    }
    setD((p) => ({ ...p, tolov: t, ognoo }));
    setErr((p) => ({ ...p, tolov: undefined, ognoo: undefined }));
    setFail('');
  };

  const submit = async () => {
    /*
     * ⚠️ 2026-09-08: ЗАСВАРЫН зам нь `remove`-тэй ИЖИЛ хамгаалалттай болов.
     *    `loadZov` OBJECTID уншиж чадаагүй үед `oid = 0` болдог ч
     *    `editing = init.oid != null` тул маягт «Засах» горимд нээгддэг.
     *    Тэр үед «Хадгалах» дарвал `saveZov`-ийн `if (d.oid)` нь `0` дээр
     *    ХУДАЛ болж `updates` биш `adds` явуулж, хуучин мөр хэвээр үлдэн
     *    ДАВХАРДСАН ШИНЭ зөвшөөрөл үүсдэг байв — алдаа ч гарахгүй, «хадгаллаа»
     *    гэж хаагдана (`zovshoorol.ts:36-44`-т яг энэ ангиллын алдаа
     *    2026-09-04-нд амьдаар тохиолдсоныг баримтжуулсан).
     *    Устгах нь хамгаалагдсан атлаа хадгалах нь хамгаалалтгүй үлдсэн байв.
     */
    if (editing && !d.oid) {
      setFail(tr('Мөрийн OBJECTID уншигдаагүй тул засах боломжгүй.'));
      return;
    }
    const e = validateZov(d, all);
    /* ⚠️ 2026-10-05: буруу бичсэн огноо эцгийн утгыг ХӨНДДӨГГҮЙ (`DateField`) — хуучин
       огноо чимээгүй хадгалагдахаас сэргийлж хадгалалтыг хаана. */
    if (badDate) e.ognoo = tr('Огноо буруу — жишээ: 2026-10-04');
    setErr(e);
    if (Object.values(e).some(Boolean)) return;
    /* ⚠️ 2026-10-05: ИРЭЭДҮЙН шийдвэрийн огноо — ихэвчлэн он/сарын гарын алдаа. Хориг биш
       (цагийн бүс, урьдчилж бүртгэх тохиолдол), асууна. Өнөөдөр = хэрэглэгчийн хуанлийн өдөр,
       харьцуулалт хадгалалтын хэлбэрээр (UTC шөнө дунд). */
    if (d.ognoo != null) {
      const now = new Date();
      const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
      if (d.ognoo > today
        && !window.confirm(tr('Шийдвэрлэсэн огноо ({0}) өнөөдрөөс ХОЙШ байна. Зөв үү?', toInput(d.ognoo)))) return;
    }
    setBusy(true);
    setFail('');
    try {
      await saveZov({ ...d, ner: d.ner.trim(), bagts: d.bagts.trim() }, before);
      onDone();
    } catch (x) {
      /* ⚠️ 2026-10-09: бичсэний ДАРАА давхардал илэрсэн (`saveZov` → `resolveAddClash`). Манай мөр
         серверт ҮЛДСЭН бол маягтыг хаана — дахин «Хадгалах» дарвал урьдчилсан шалгалт өөрийн
         мөртэй нь давхацна; мессежийг заавал харуулна. Устгагдсан бол маягт нээлттэй (шат солих). */
      if (x instanceof ZovClashError) {
        if (x.kept) {
          window.alert(x.message);
          onDone();
          return;
        }
        setFail(x.message);
        return;
      }
      /* ⚠️ 2026-10-06: шинэ мөрийн хариу алдагдсан бол дахин илгээхийг хаана (`unsure`) */
      if (!editing && isLostResponse(x)) {
        setUnsure(true);
        setFail('');
        return;
      }
      setFail(userError(x));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    /*
     * ⚠️ 2026-09-04: урьд нь энд `if (!d.oid) return;` гэж ЧИМЭЭГҮЙ буцдаг
     *    байв. `loadZov` OBJECTID уншиж чадаагүй үед (үйлчилгээний OID багана
     *    FID/OBJECTID_1 болох, эрх солигдох) `oid = 0` болдог ч
     *    `editing = init.oid != null` тул «Устгах» товч ЗУРАГДСАН хэвээр —
     *    хэрэглэгч дарахад баталгаажуулах цонх ч гарахгүй, алдаа ч гарахгүй,
     *    консолд ч юу ч үлдэхгүй байлаа. `deleteZov` дотор нэмсэн шалгуур
     *    (zovshoorol.ts:316) энэ мөрийн улмаас ХЭЗЭЭ Ч хүрэхгүй байсан тул
     *    шалтгааныг ЭНД шууд хэлнэ (мессежийг `deleteZov`-ийнхтэй ЯГ ижлээр
     *    үлдээв — нэг шалтгаан, нэг өгүүлбэр, i18n-д нэг түлхүүр).
     */
    if (!d.oid) {
      setFail(tr('Мөрийн OBJECTID уншигдаагүй тул устгах боломжгүй.'));
      return;
    }
    if (!window.confirm(tr('«{0}» зөвшөөрлийг бүрмөсөн устгах уу? Буцаах боломжгүй.', d.ner))) return;
    setBusy(true);
    setFail('');
    try {
      await deleteZov(d.oid);
      onDone();
    } catch (x) {
      /* ⚠️ 2026-10-09: ХАРИУ АЛДАГДСАН устгалт (timeout/сүлжээ) — сервер устгасан эсэх
         ТОДОРХОЙГҮЙ. Урьд нь шууд алдаа гаргаж, хэрэглэгч дахин дарахад «мөр олдсонгүй»
         гэх мэт ойлгомжгүй алдаа авдаг байв. Мөрийг OID-оор ДАХИН асууна: алга бол
         устгал амжилттай; байгаа бол анхны алдаа; асуулт ч унавал «тодорхойгүй». */
      if (isLostResponse(x)) {
        let still: Zov | null | undefined;
        try { still = await loadOneZov(d.oid); } catch { still = undefined; }
        if (still === null) {
          invalidate('ZOVSHOOROL');
          onDone();
          return;
        }
        if (still === undefined) {
          setFail(tr('Серверээс хариу ирсэнгүй — зөвшөөрөл устгагдсан эсэх ТОДОРХОЙГҮЙ. Хуудсыг дахин ачаалж шалгана уу.'));
          return;
        }
        /* ⚠️ 2026-10-09: мөр ХЭВЭЭР байна — гэхдээ сервер устгалыг одоо ч боловсруулж байж болох
           тул «алдаа» биш «тодорхойгүй». Түүхий timeout мессеж хэрэглэгчийг төөрөгдүүлдэг байв. */
        setFail(tr('Серверээс хариу ирсэнгүй — үр дүн тодорхойгүй: зөвшөөрөл одоогоор устгагдаагүй харагдаж байна. Хуудсыг дахин ачаалж шалгаад шаардлагатай бол дахин устгана уу.'));
        return;
      }
      setFail(userError(x));
    } finally {
      setBusy(false);
    }
  };

  const field = (k: keyof ZovDraft, label: string, node: ReactNode, hint?: string) => (
    <label className={s.f}>
      <span className={s.fLabel}>{label}</span>
      {node}
      {err[k] ? <span className={s.fErr}>{err[k]}</span> : hint ? <span className={s.fHint}>{hint}</span> : null}
    </label>
  );

  /* ⚠️ 2026-09-25: ТӨЛӨВ `<label>` ДОТОР БИШ — label доторх товчийн аль ч хэсэгт
     (эсвэл шошгон дээр) дарахад хөтөч label-ийн ЭХНИЙ товчийг (`Хүлээгдэж буй`)
     идэвхжүүлж, сонголт чимээгүй «хүлээгдэж буй» руу үсэрдэг байв. */
  /* ⚠️ 2026-10-06: `d.tolov = null` (танигдаагүй, сонгоогүй) үед аль ч товч идэвхгүй —
     Tab-ын фокус эхний товчинд, сум нь эхний/сүүлчийн товчийг сонгоно. */
  const tolovIdx = Math.max(0, d.tolov ? TOLOV_LIST.indexOf(d.tolov) : -1);
  const tolovKey = (e: ReactKeyboardEvent) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = d.tolov == null
      ? TOLOV_LIST[step > 0 ? 0 : TOLOV_LIST.length - 1]
      : TOLOV_LIST[(tolovIdx + step + TOLOV_LIST.length) % TOLOV_LIST.length];
    setTolov(next);
    const grp = e.currentTarget as HTMLElement;
    requestAnimationFrame(() => grp.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus());
  };

  return (
    <div className={s.backdrop} role="dialog" aria-modal="true" aria-labelledby="zov-edit-title" onClick={tryClose}>
      <div ref={mdRef} className={s.modal + ' ' + s.modalWide} onClick={(e) => e.stopPropagation()}>
        <div className={s.modalHead}>
          <span id="zov-edit-title" className={s.modalTitle}>
            {editing ? tr('Зөвшөөрөл засах') : tr('Зөвшөөрөл нэмэх')}
          </span>
          <button type="button" className={s.close} onClick={tryClose} disabled={busy} aria-label={tr('Хаах')}>✕</button>
        </div>

        <div className={s.form}>
          <div className={s.grid2}>
            {field('bagts', tr('Багц'), (
              <select
                className={s.input}
                value={d.bagts}
                onChange={(e) => {
                  const b = e.target.value;
                  markDirty();
                  /* ⚠️ 2026-10-07: багцыг ЦЭВЭРЛЭХЭД дараалал 1-д үлдэнэ (0 руу унадаггүй), бусад
                     талбарын алдаа арилахгүй — зөвхөн `bagts`-ийнх. */
                  setD((p) => ({ ...p, bagts: b, shat: p.oid || !b ? p.shat : nextShat(b) }));
                  setErr((p) => ({ ...p, bagts: undefined }));
                }}
              >
                <option value="">{tr('— сонгох —')}</option>
                {bagtsOpts.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            ))}
            {field('shat', tr('Дараалал'), (
              <input
                className={s.input}
                type="number"
                min={1}
                step={1}
                /* ⚠️ 2026-10-07: талбарыг цэвэрлэхэд 0 руу унадаггүй — хоосон (`NaN`) хэвээр,
                   `validateZov` «1-ээс эхлэх бүхэл тоо» гэж барина */
                value={Number.isNaN(d.shat) ? '' : String(d.shat)}
                onChange={(e) => set('shat', e.target.value === '' ? NaN : Number(e.target.value))}
              />
            ), tr('Гинжин дэх байрлал — 1-ээс эхэлнэ'))}
          </div>

          {field('ner', tr('Зөвшөөрлийн нэр'), (
            <input
              ref={firstRef}
              className={s.input}
              value={d.ner}
              maxLength={lens.ner ?? 200}
              placeholder={tr('жиш. Барилга барих зөвшөөрөл')}
              onChange={(e) => set('ner', e.target.value)}
            />
          ))}

          <div className={s.grid2}>
            <div className={s.f}>
              <span id="zov-edit-tolov" className={s.fLabel}>{tr('Төлөв')}</span>
              <div className={s.radios} role="radiogroup" aria-labelledby="zov-edit-tolov" onKeyDown={tolovKey}>
                {TOLOV_LIST.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={d.tolov === t}
                    tabIndex={t === TOLOV_LIST[tolovIdx] ? 0 : -1}
                    className={s.radio + ' ' + (d.tolov === t ? s.radioOn : '')}
                    onClick={() => setTolov(t)}
                  >
                    {TOLOV_LABEL[t]()}
                  </button>
                ))}
              </div>
              {err.tolov ? <span className={s.fErr}>{err.tolov}</span>
                : d.tolov == null ? <span className={s.fHint}>{tr('Одоогийн төлөв танигдаагүй — сонгоно уу')}</span> : null}
            </div>
            {/* ⚠️ 2026-10-05: `<input type="date">` → хуваалцсан `DateField` (YYYY-MM-DD текст +
                📅) — натив оролтын хэлбэр хөтчийн хэлнээс хамаарч өдөр/сар андуурагддаг байв.
                Хадгалах хэлбэр ХЭВЭЭР (UTC шөнө дунд, `fromInput`).
                ⚠️ `<label>` ДОТОР БИШ (`field()` биш) — календарийн товч/цонхны товшилт
                label-ээр дамжиж оролтыг идэвхжүүлэхгүй (Төлөвийн ижил шалтгаан). */}
            <div className={s.f}>
              <span className={s.fLabel}>{tr('Шийдвэрлэсэн огноо')}</span>
              <DateField
                label={tr('Шийдвэрлэсэн огноо')}
                value={toInput(d.ognoo)}
                disabled={busy}
                onBad={setBadDate}
                onChange={(v) => { setOgnooCleared(false); set('ognoo', fromInput(v)); }}
              />
              {err.ognoo ? <span className={s.fErr}>{err.ognoo}</span>
                : ognooCleared ? <span className={s.fHint}>{tr('«Хүлээгдэж буй» болсон тул огноог арилгав')}</span>
                  : d.tolov === TOLOV.wait ? <span className={s.fHint}>{tr('Хүлээгдэж буй үед хоосон')}</span> : null}
            </div>
          </div>

          <div className={s.grid2}>
            {field('dugaar', tr('Зөвшөөрлийн дугаар'), (
              <input className={s.input} value={d.dugaar} maxLength={lens.dugaar ?? 100}
                onChange={(e) => set('dugaar', e.target.value)} />
            ), d.tolov === TOLOV.ok && !d.dugaar.trim()
              ? tr('Зөвшөөрсөн боловч дугаар бичээгүй байна')
              : undefined)}
            {field('baiguullaga', tr('Шийдвэрлэх байгууллага'), (
              <input className={s.input} value={d.baiguullaga} maxLength={lens.baiguullaga ?? 150}
                onChange={(e) => set('baiguullaga', e.target.value)} />
            ))}
          </div>

          <div className={s.grid2}>
            {field('hariutsagch', tr('Байгууллагын хариуцагч'), (
              <input className={s.input} value={d.hariutsagch} maxLength={lens.hariutsagch ?? 100}
                onChange={(e) => set('hariutsagch', e.target.value)} />
            ))}
            {field('selbe', tr('Сэлбэ талын хариуцагч'), (
              <input className={s.input} value={d.selbe} maxLength={lens.selbe ?? 100}
                onChange={(e) => set('selbe', e.target.value)} />
            ))}
          </div>

          {field('tailbar', tr('Тайлбар'), (
            <textarea className={s.input + ' ' + s.area} rows={3} value={d.tailbar} maxLength={lens.tailbar ?? 2000}
              onChange={(e) => set('tailbar', e.target.value)} />
          ))}

          {fail && <div className={s.formErr} role="alert">{fail}</div>}
          {/* ⚠️ 2026-10-06: хариу алдагдсан «Нэмэх» — `unsure`-ийн тайлбар */}
          {unsure && (
            /* ⚠️ 2026-10-09: `alertdialog` БИШ — модал доторх мөрийн мэдэгдэл (өөрөө диалог биш) */
            <div className={s.formErr} role="alert">
              {tr('Серверээс хариу ирсэнгүй — зөвшөөрөл нэмэгдсэн эсэх ТОДОРХОЙГҮЙ. Дахин хадгалахаас өмнө хуудсыг дахин ачаалж, зөвшөөрөл үүссэн эсэхийг шалгана уу.')}
              {' '}
              <button type="button" className={s.btn} onClick={() => setUnsure(false)} disabled={busy}>
                {tr('Шалгасан — үүсээгүй, дахин нэмэх')}
              </button>
            </div>
          )}
        </div>

        <div className={s.actions}>
          {editing && (
            <button type="button" className={s.danger} onClick={remove} disabled={busy}>
              {tr('Устгах')}
            </button>
          )}
          <span className={s.spacer} />
          <button type="button" className={s.btn} onClick={tryClose} disabled={busy}>
            {tr('Болих')}
          </button>
          <button type="button" className={s.primary} onClick={submit} disabled={busy || unsure}>
            {busy ? tr('Хадгалж байна…') : tr('Хадгалах')}
          </button>
        </div>
      </div>
    </div>
  );
}
