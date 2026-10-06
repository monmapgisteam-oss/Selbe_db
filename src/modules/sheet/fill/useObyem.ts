/*
 * ⚠️ 2026-09-30: `FillNew.tsx` (6.9k мөр) задарсан — ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМ — гүйцэтгэлээс бүрэн тусдаа 2 шатат урсгал (ноорог · илгээх · батлах).
 *    Код ЯГ хэвээр зөөгдсөн, зан төлөв өөрчлөгдөөгүй; `draft.check.mjs` ·
 *    `shareDraft.check.mjs` эх кодын шалгуураа FillNew.tsx + fill/* нийлбэрээс уншина.
 */
import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import type { Pkg, Schema } from "../bagts.pkg";
import { applyUpdates, loadRows, type SheetRow } from "../bagtsSheet";
import { buildOidMap, rowKeyOf } from "../sheetFrame";
import {
  claimObyem, decideObyem, loadHistory as loadObyemHistory, loadPending as loadObyemPending, loadPayload as loadObyemPayload,
  submitObyem, withdrawObyem, OBYEM_STATUS, type ObyemSubmission, type ObyemPayload,
} from '@/lib/obyemBatlah';
import { t as tr } from "@/lib/i18nCore";
/* ⚠️ 2026-10-06 аудит: түүхий серверийн мөрийг (`Token Required` г.м.) `userError`-оор л харуулна */
import { userError } from '@/components/ui';

/**
 * ОБЬЁМЫН ТӨЛӨВ (зөвхөн `useState`) — 2026-10-01: `useObyem`-ээс САЛГАВ.
 * ⚠️ FillNew-ийн ачаалах эффект багц солиход `setPv*`-ээр эдгээрийг ТЭГЛЭДЭГ тул тэр эффектээс
 *    ДЭЭР зарлагдах ёстой (React Compiler: «зарлагдахаас өмнө хандсан»). Эффект · урсгалтай
 *    `useObyem` нь ХУУЧИН байрлалдаа — эффектүүдийн дараалал хэвээр; энд зөвхөн төлөвийн
 *    зарлалт тул зан төлөв өөрчлөгдөхгүй.
 */
export function useObyemState() {
  /**
   * Инженерийн обьёмын НООРОГ — `oid` → бичсэн текст ("" = цэвэрлэх).
   * ⚠️ Түлхүүр нь `oid` ДАНГААРАА: талбар нь мөрд ганц скаляр тул
   *    гүйцэтгэлийн `${oid}:${b}` хэлбэр энд хэрэггүй.
   */
  const [pvPend, setPvPend] = useState<Record<number, string>>({});
  /** Хүлээгдэж буй илгээлт — байвал багана ТҮГЖИГДЭНЭ */
  const [pvSub, setPvSub] = useState<ObyemSubmission | null>(null);
  /**
   * СҮҮЛИЙН ШИЙДВЭР НЬ БУЦААЛТ бол тэр илгээлт (2026-10-01, хэрэглэгч: бүгдийг зас).
   * ⚠️ ЯАГААД: буцаагдсаны дараа `pending` алга болж баннер ч арилдаг тул инженер
   *    обьём нь буцаагдсаныг ч, ЯАГААД гэдгийг ч хуудсанд хардаггүй байв (шалтгаан нь
   *    зөвхөн ArcGIS-ийн `butsaasan_shaltgaan` талбарт). Шинэ илгээлт (pending) гармагц
   *    түүнд дарагдана.
   */
  const [pvReturned, setPvReturned] = useState<ObyemSubmission | null>(null);
  /** Батлагчийн урьдчилан харах агуулга (`oid` → утга) */
  const [pvPreview, setPvPreview] = useState<Map<number, number | null> | null>(null);
  const [pvBusy, setPvBusy] = useState(false);
  const [pvErr, setPvErr] = useState("");
  const [pvNote, setPvNote] = useState("");
  return {
    pvPend, setPvPend, pvSub, setPvSub, pvReturned, setPvReturned, pvPreview, setPvPreview,
    pvBusy, setPvBusy, pvErr, setPvErr, pvNote, setPvNote,
  };
}
export type ObyemState = ReturnType<typeof useObyemState>;

export function useObyem({ st, pkg, pkgKeyRef, rows, sc, user, locked, todayFillMs, setRows }: {
  /** ⚠️ 2026-10-01: төлөв — FillNew ачаалах эффектээс ДЭЭР `useObyemState()`-ээр зарлана */
  st: ObyemState;
  pkg: Pkg;
  /** ОДОО сонгогдсон багцын түлхүүр — синхрон (FillNew-ийн `pkgKeyRef`-ийн ⚠️) */
  pkgKeyRef: RefObject<string>;
  rows: SheetRow[];
  sc: Schema | null;
  user: { username: string } | null;
  locked: boolean;
  /**
   * ⚠️ 2026-09-30: ӨДӨР солигдоход FillNew-ийн ачаалах эффект `pvSub`-ийг ТЭГЛЭДЭГ (багц
   *    солихын дүрэм) атлаа энэ дахин уншигддаггүй тул шөнө дунд өнгөрсөн табд хүлээгдэж
   *    буй обьёмын баннер · «Обьём батлах» товч алга болж, багана ТАЙЛАГДДАГ байв.
   */
  todayFillMs?: number;
  /** ⚠️ 2026-09-30: батлагдсан утгыг хуудасны мөрт тусгах (`decideObyemHere`) */
  setRows?: (u: (rs: SheetRow[]) => SheetRow[]) => void;
}) {
  /* ⚠️ 2026-10-01: төлөвийн зарлалт `useObyemState`-д (дээрх ⚠️) — нэрс урьдынхаараа */
  const {
    pvPend, setPvPend, pvSub, setPvSub, pvReturned, setPvReturned, pvPreview, setPvPreview,
    pvBusy, setPvBusy, pvErr, setPvErr, pvNote, setPvNote,
  } = st;

  /* ══════════ ИНЖЕНЕРИЙН ОБЬЁМЫН УРСГАЛ ══════════ */

  /**
   * Хүлээгдэж буй илгээлтийг татах — багц солигдох ба шийдвэрийн дараа.
   *
   * ⚠️ БАГЦЫН ХАМГААЛАЛТ ЗААВАЛ (2026-09-16-ны аудит). Хоёр дараалсан
   *    `await` (`loadObyemPending` → `loadObyemPayload`) хамгаалалтгүй
   *    байсан тул багц А-гийн ХОЦОРСОН хариу Б дээр буудаг байв:
   *      · `locked={!!pvSub}` → Б-гийн «Төлөвлөсөн обьём» багана ЗАСАГДАХГҮЙ
   *        болж, шалтгаан нь эндүү тайлбартай («А-гийн илгээлт» гэж)
   *      · баннер А-гийн нүдний тоо ба илгээгчийг Б дээр харуулна
   *      · `preview` нь А-гийн утгыг Б-гийн мөрүүд рүү ObjectID ТААРВАЛ
   *        давхарлана (oid нь давхаргаар дараалсан тул тааралдана)
   *    Гарах цорын ганц зам нь багц дахин солих эсвэл хуудас шинэчлэх байв.
   *
   * ⚠️ `pkgKeyRef` (БИШ `loadedPkgRef`, 2026-09-17): `loadedPkgRef` нь мөрүүд
   *    ачаалагдтал `""` тул энэ жижиг query үргэлж түрүүлж ирээд хаягдаж,
   *    хүлээгдэж буй илгээлт багц нээхэд ХЭЗЭЭ Ч харагдахгүй байв.
   */
  const refreshObyem = useCallback(async () => {
    const want = pkg.key;
    try {
      const sub = await loadObyemPending(want);
      if (pkgKeyRef.current !== want) return;
      setPvSub(sub);
      /* ⚠️ 2026-10-01: хүлээгдэж буй илгээлт БАЙХГҮЙ бол сүүлийн шийдвэрийг шалгана —
         буцаалт бол шалтгааныг инженерт харуулна (`pvReturned`-ийн ⚠️). Уншилт унавал
         хуучин төлөв хэвээр (доорх `catch`). */
      if (sub) setPvReturned(null);
      else {
        const last = (await loadObyemHistory(want, 1))[0] ?? null;
        if (pkgKeyRef.current !== want) return;
        setPvReturned(last && last.status === OBYEM_STATUS.returned ? last : null);
      }
      /* Батлагч бол агуулгыг нь урьдчилан харуулна */
      if (sub) {
        const pl = await loadObyemPayload(sub.oid);
        if (pkgKeyRef.current !== want) return;
        setPvPreview(pl ? new Map(pl.cells) : null);
      } else {
        setPvPreview(null);
      }
    } catch {
      /* ⚠️ Уншиж чадсангүй ≠ илгээлт алга. Хуучин төлөвийг ХЭВЭЭР үлдээнэ —
         эс бөгөөс сүлжээ тасрахад багана нээгдэж, батлагдаагүй утга дээр
         дахин засвар эхэлнэ. */
    }
    /* ⚠️ 2026-10-01: setter-үүд `st`-ээс (тогтвортой useState) — хамаарлын жагсаалтад нэмсэн нь утга өөрчлөхгүй */
  }, [pkg.key, pkgKeyRef, setPvSub, setPvReturned, setPvPreview]);

  /* ⚠️ 2026-09-30: `todayFillMs` — өдөр солигдоход ч дахин уншина (параметрийн ⚠️) */
  /* ⚠️ 2026-10-01: `set-state-in-effect` disable ХАСАГДАВ — setter-үүд `st`-ээс ирдэг тул шалгуур
     тэднийг танихгүй болсон («unused directive»); `refreshObyem` async хэвээр (setState нь `await`-ийн ДАРАА). */
  useEffect(() => { void refreshObyem(); }, [refreshObyem, todayFillMs]);

  /* ⚠️ `refreshAjil`/`sendAjil`/батлагдсан-буцаагдсан мөр буулгах эффект/
     `withdrawAjilHere` ХАСАГДАВ (2026-09-24): нэмэлт ажлын урсгал бүхэлдээ
     «Хуваарь»-д; батлагдсан мөр `ajilApply.materializeAdds`-аар шууд үндсэн
     хүснэгтэд орж, энд `loadRows`-оор ердийн мөр болж ирнэ. */

  /** Ноорогт өөрчлөгдсөн нүд — тоо ба payload-ын эх */
  const pvCells = useMemo(() => {
    const out: [number, number | null][] = [];
    const byOid = new Map(rows.map((r) => [r.oid, r]));
    for (const [k, raw] of Object.entries(pvPend)) {
      const oid = Number(k);
      const r = byOid.get(oid);
      if (!r) continue;
      const t = raw.trim();
      const v = t === "" ? null : Number(t);
      if (v !== null && !Number.isFinite(v)) continue;
      /* Хадгалагдсантайгаа ижил бол өөрчлөлт БИШ */
      if ((r.plannedVol ?? null) === v) continue;
      out.push([oid, v]);
    }
    return out;
  }, [pvPend, rows]);

  /** «Обьём батлуулах» — үндсэн өгөгдөлд ЮУ Ч бичихгүй */
  const sendObyem = useCallback(async () => {
    if (!pvCells.length || pvBusy) return;
    setPvBusy(true); setPvErr(""); setPvNote("");
    try {
      /* ⚠️ МӨРИЙН ТАНИГЧ ХАМТ ЯВНА (2026-09-25-ны аудит): payload нь мөрийг
         ЗӨВХӨН oid-оор заадаг тул илгээснээс хойш архивт шинэ жааз орвол
         батлагч тэр oid-ийг хуучин (архивласан) мөрөнд бичдэг, эсвэл «мөр
         олдсонгүй» гэж мөнхөд гацдаг байв. `rowKeys` (хуудасны дарааллаар) нь
         `decideObyemHere`-д шинэ жааз руу зөөх ганц зам. */
      const pvOids = new Set(pvCells.map(([o]) => o));
      const payload: ObyemPayload & { rowKeys: [number, string][] } = {
        v: 1,
        pkgKey: pkg.key,
        cells: pvCells,
        rowKeys: rows.filter((r) => pvOids.has(r.oid)).map((r): [number, string] => [r.oid, rowKeyOf(r)]),
      };
      const r = await submitObyem({
        pkgKey: pkg.key,
        pkgGroup: pkg.group,
        author: user?.username ?? '',
        payload,
      });
      /* ⚠️ БАГЦЫН ХАМГААЛАЛТ (2026-09-25-ны аудит, `refreshObyem`-ийн ⚠️): илгээх
         хооронд багц солигдсон бол доорх `setPvPend({})` Б-гийн ШИНЭ обьёмын
         ноорогийг (ноорогт хадгалагддаггүй — сэргээх аргагүй) арчиж, А-гийн
         мэдэгдэл/алдаа Б дээр гарах байв. А-гийн ноорог багц солиход аль хэдийн
         цэвэрлэгдсэн тул энд хийх зүйлгүй. */
      if (pkgKeyRef.current !== payload.pkgKey) return;
      if (!r.ok) { setPvErr(r.error ? userError(r.error) : tr('Илгээгдсэнгүй.')); return; }
      /* ⚠️ Ноорогийг ЦЭВЭРЛЭНЭ: агуулга нь одоо серверт хадгалагдсан тул
         локалд үлдээвэл дахин илгээх эсвэл батлагдсаны дараа хуучин
         ноорог дахин бичигдэх эрсдэлтэй. */
      setPvPend({});
      setPvNote(tr('Инженерийн обьём батлуулахаар илгээгдлээ — батлагч шийдвэрлэнэ.'));
      await refreshObyem();
    } catch (e) {
      if (pkgKeyRef.current === pkg.key) setPvErr(userError(e));
    } finally {
      setPvBusy(false);
    }
  }, [pvCells, pvBusy, pkg.key, pkg.group, user, refreshObyem, rows, pkgKeyRef, setPvBusy, setPvErr, setPvNote, setPvPend]);

  /**
   * ШИЙДВЭР — батлах эсвэл буцаах.
   *
   * ⚠️ ДАРААЛАЛ: батлахад ЭХЛЭЭД үндсэн өгөгдөлд бичиж, ЗӨВХӨН амжилттай
   *    болсны дараа `decideObyem`-ээр `approved` болгоно. Эсрэгээр хийвэл
   *    бичилт унасан үед «батлагдсан» гэж харагдах атлаа обьём хуучин
   *    хэвээр үлдэнэ (`huvaariBatlah`-ийн ижил дүрэм).
   */
  const decideObyemHere = useCallback(async (approve: boolean, reason?: string) => {
    /* ⚠️ `locked` — хяналтын харагдацаас шийдвэр гаргахгүй (товчны ⚠️, 2026-09-25) */
    if (!pvSub || pvBusy || !sc || locked) return;
    /* ⚠️ 2026-09-29 (аудит 10): БАГЦЫН ХАМГААЛАЛТ (`refreshObyem`/`sendObyem`-ийн ⚠️) —
       батлах хооронд багц солигдвол А-гийн мэдэгдэл/алдаа Б дээр гардаг байв.
       Бичилт (А руу) хэвээр дуусна; зөвхөн `setPv*` мэдэгдлийг алгасна. */
    const want = pkg.key;
    const here = () => pkgKeyRef.current === want;
    const pvErrHere = (s: string) => { if (here()) setPvErr(s); };
    setPvBusy(true); setPvErr(""); setPvNote("");
    /** Сүүлийн жаазад тулгагдаагүй тул бичигдээгүй нүдний тоо (доорх ⚠️) */
    let pvSkipped = 0;
    /** ⚠️ 2026-10-04: үндсэн өгөгдөлд АЛЬ ХЭДИЙН бичигдсэн эсэх — шийдвэр унавал мессежид */
    let wroteMain = false;
    /** Бичигдсэний ДАРАА шийдвэр унасан үеийн тайлбар — юу болсон, яах вэ */
    const afterWrite = (why: string) => tr('Утгууд үндсэн өгөгдөлд АЛЬ ХЭДИЙН бичигдсэн, гэхдээ илгээлтийг «Батлагдсан» болгож чадсангүй ({0}). Хуудсаа шинэчлээд «Обьём батлах»-ыг дахин дарна уу — ижил утга дахин бичигдэх тул аюулгүй. Давтан унавал админд мэдэгдэнэ үү.', why);
    try {
      if (approve) {
        const fld = sc.f.plannedVol;
        if (!fld) {
          setPvErr(tr('Энэ багцын үйлчилгээнд талбар байхгүй тул батлах боломжгүй.'));
          return;
        }
        /* ⚠️ 2026-09-30: ҮНДСЭН ӨГӨГДӨЛД БИЧИХЭЭС ӨМНӨ бүх дүрмийг СЕРВЕРЭЭР шалгана
           (`decideObyem.dryRun`-ийн ⚠️). Урьд нь `applyUpdates` ЭХЭЛЖ явдаг тул зохиогч
           өөрийн илгээлтийг (super эсвэл хоёр эрхтэй), эсвэл хуучирсан дэлгэцээс өөр
           батлагчийн аль хэдийн буцаасан/баталсан илгээлтийг «батлахад» утга нь
           үндсэн өгөгдөлд БИЧИГДЭЭД, дараа нь л «өөрөө батлах боломжгүй» / «аль хэдийн
           шийдвэрлэсэн» гэж татгалзагддаг байв (05 §6). Доорх жинхэнэ `decideObyem`
           бичилтийн ДАРАА дахин шалгана — хоёр дахь шалгалт хэвээр. */
        const pre = await decideObyem({
          oid: pvSub.oid,
          approve: true,
          approver: user?.username ?? '',
          author: pvSub.author,
          dryRun: true,
        });
        if (!pre.ok) { pvErrHere(pre.error ? userError(pre.error) : tr('Шийдвэр хадгалагдсангүй.')); return; }
        const pl = await loadObyemPayload(pvSub.oid);
        if (!pl) { pvErrHere(tr('Илгээлтийн агуулга уншигдсангүй.')); return; }
        /* ⚠️ ЗӨВХӨН БАЙГАА мөрөнд бичнэ: илгээснээс хойш агшин солигдож
           oid шилжсэн бол тэр мөрийг АЛГАСНА — буруу мөрөнд бичихээс
           бүрэн алгасах нь дээр.
           ⚠️ АРХИВЫН СҮҮЛИЙН ЖААЗАД (2026-09-25-ны аудит): урьд нь батлагчийн
           ОДОО харж буй `rows`-оор шүүж бичдэг байв — хуудас нь хуучин (F0)
           жаазан дээр байвал `applyUpdates` АРХИВЛАСАН мөрөнд бичиж, шинэ жааз
           (F1) утгагүй үлдэх атлаа «үндсэн өгөгдөлд бичигдлээ» гэж мэдэгддэг;
           дахин ачаалсан батлагч «мөрүүд олдсонгүй»-д мөнхөд гацдаг байв. Одоо
           сүүлийн жаазыг ТАТАЖ, oid нь тэнд байхгүй бол (№ ¦ Ажил)-аар зөөнө:
             · илгээлтийн oid бүгд ЭНЭ хуудсанд байвал — хуудасны БҮТЭН мөрийн
               жагсаалтаар (`publish`-ийн `oidMap`-тай ижил, давхардсан шошго ч
               дарааллаараа яг таарна);
             · эс бөгөөс payload-ын `rowKeys`-ээр — СИЙРЭГ жагсаалт тул шинэ
               жаазад ДАВХАРДСАН шошготой мөрийг ЗӨӨХГҮЙ (буруу мөрөнд бичихээс
               алгасах нь дээр — дээрх ⚠️).
           Зөөгдөөгүй нүдийг тоолж ил хэлнэ. */
        const base = await loadRows(pkg, sc);
        const freshOids = new Set(base.rows.map((r) => r.oid));
        const pageOids = new Set(rows.map((r) => r.oid));
        let map = new Map<number, number>();
        if (pl.cells.some(([oid]) => !freshOids.has(oid))) {
          if (pl.cells.every(([oid]) => pageOids.has(oid))) {
            map = buildOidMap(rows.filter((r) => r.oid >= 0).map((r): [number, string] => [r.oid, rowKeyOf(r)]), base.rows);
          } else {
            const rk0 = (pl as { rowKeys?: unknown }).rowKeys;
            const rk = Array.isArray(rk0)
              ? rk0.filter((e): e is [number, string] => Array.isArray(e) && Number.isInteger(e[0]) && typeof e[1] === 'string')
              : [];
            const cnt = new Map<string, number>();
            for (const r of base.rows) cnt.set(rowKeyOf(r), (cnt.get(rowKeyOf(r)) ?? 0) + 1);
            map = buildOidMap(rk.filter(([, k]) => cnt.get(k) === 1), base.rows);
          }
        }
        let skippedN = 0;
        const upd: Record<string, unknown>[] = [];
        for (const [oid, v] of pl.cells) {
          const to = freshOids.has(oid) ? oid : map.get(oid);
          if (to == null || !freshOids.has(to)) { skippedN++; continue; }
          upd.push({ [sc.f.oid]: to, [fld]: v });
        }
        if (!upd.length) {
          pvErrHere(tr('Илгээлтийн мөрүүд одоогийн хуудсанд олдсонгүй — хуудсаа шинэчилнэ үү.'));
          return;
        }
        /* ⚠️ 2026-10-05: БИЧИХИЙН ЯГ ӨМНӨ ТҮГЖИНЭ (`obyemBatlah.claimObyem`, `huvaariBatlah.claimPlan`-ийн
           загвар). Дээрх `dryRun` шалгалт ба энэ бичилтийн завсарт (агуулга · сүүлийн жааз татах
           хэдэн секунд) зохиогч ТАТАХ, өөр батлагч БУЦААХ боломжтой байсан — утга нь үндсэн өгөгдөлд
           орсон атлаа «батлагдсан» бичлэг үүсэхгүй, «дахин батлах» хэзээ ч амжилтгүй. Түгжээ нь
           төлвийг ДАХИН уншиж (`pending` хэвээр) өөр дээрээ тавиад, бичсэний дараа баталгаажуулна;
           түгжээтэй үед `withdrawObyem` ба өөр батлагчийн `decideObyem` татгалзана.
           ⚠️ Бичилт унасан ч түгжээг ТАЙЛАХГҮЙ: `applyUpdates` хэсэгчлэн бичсэн байж болох тул
           тайлбал зохиогч хагас бичигдсэн илгээлтээ татна. Энэ батлагч шууд дахин дарж болно;
           бусдад 10 минутын дараа өөрөө тайлагдана. */
        const claim = await claimObyem({ oid: pvSub.oid, approver: user?.username ?? '' });
        if (!claim.ok) { pvErrHere(claim.error ? userError(claim.error) : tr('Шийдвэр хадгалагдсангүй.')); return; }
        await applyUpdates(pkg, upd);
        wroteMain = true;
        pvSkipped = skippedN;
        /* ⚠️ 2026-09-30: БИЧИГДСЭН утгыг хуудасны мөрт ч тусгана — урьд нь зөвхөн
           `refreshObyem` явдаг тул баннер алга болмогц багана ХУУЧИН утгаа харуулж,
           батлалт «хэрэгжээгүй» мэт харагддаг байв (хуудас дахин ачаалтал). */
        if (here() && setRows) {
          const wrote = new Map(upd.map((u) => [Number(u[sc.f.oid]), (u[fld] ?? null) as number | null]));
          setRows((rs) => rs.map((r) => (wrote.has(r.oid) ? { ...r, plannedVol: wrote.get(r.oid) ?? null } : r)));
        }
      }
      const r = await decideObyem({
        oid: pvSub.oid,
        approve,
        approver: user?.username ?? '',
        author: pvSub.author,
        reason,
      });
      if (!here()) return;
      /* ⚠️ 2026-10-04: бичээд → тэмдэглэх дараалал (дээрх ⚠️) хэвээр; харин тэмдэглэл унавал
         «хадгалагдсангүй» биш — утга АЛЬ ХЭДИЙН бичигдсэнийг ба яах ёстойг хэлнэ. */
      if (!r.ok) { setPvErr(wroteMain ? afterWrite(userError(r.error ?? '')) : (r.error ? userError(r.error) : tr('Шийдвэр хадгалагдсангүй.'))); return; }
      setPvNote(approve
        ? tr('Инженерийн обьём батлагдаж, үндсэн өгөгдөлд бичигдлээ.')
          + (pvSkipped ? ' ' + tr('{0} мөр архивын сүүлийн жаазад тулгагдаагүй тул бичигдсэнгүй.', pvSkipped) : '')
        : tr('Буцаагдлаа — инженер засаад дахин илгээнэ.'));
      await refreshObyem();
    } catch (e) {
      const m = userError(e);
      pvErrHere(wroteMain ? afterWrite(m) : m);
    } finally {
      setPvBusy(false);
    }
  }, [pvSub, pvBusy, sc, rows, pkg, user, refreshObyem, locked, pkgKeyRef, setRows, setPvBusy, setPvErr, setPvNote]);

  /**
   * ТАТАН АВАХ — инженер өөрийн хүлээгдэж буй обьёмын илгээлтийг цуцална (2026-10-04).
   * ⚠️ Багцад нэг л хүлээгдэж буй илгээлт байдаг тул батлагч ирэхгүй бол инженер гацдаг байв.
   *    Дүрэм (зөвхөн зохиогч · зөвхөн pending) нь lib-д (`withdrawObyem`).
   */
  const withdrawObyemHere = useCallback(async () => {
    if (!pvSub || pvBusy) return;
    if (!window.confirm(tr('Обьёмын илгээлтээ ({0} нүд) татаж авах уу? Батлагч үүнийг цаашид харахгүй; засаад дахин илгээж болно.', String(pvSub.cellCount)))) return;
    const want = pkg.key;
    setPvBusy(true); setPvErr(""); setPvNote("");
    try {
      const r = await withdrawObyem({ oid: pvSub.oid, me: user?.username ?? '' });
      if (pkgKeyRef.current !== want) return;
      if (!r.ok) { setPvErr(r.error ? userError(r.error) : tr('Татаж авч чадсангүй.')); return; }
      setPvNote(tr('Обьёмын илгээлтийг татаж авлаа.'));
      await refreshObyem();
    } catch (e) {
      if (pkgKeyRef.current === want) setPvErr(userError(e));
    } finally {
      setPvBusy(false);
    }
  }, [pvSub, pvBusy, pkg.key, user, refreshObyem, pkgKeyRef, setPvBusy, setPvErr, setPvNote]);
  return {
    pvPend, setPvPend, pvSub, setPvSub, pvPreview, setPvPreview, pvBusy, pvErr, setPvErr, pvNote, setPvNote,
    pvCells, sendObyem, decideObyemHere, withdrawObyemHere,
    /* 2026-10-01: ЗӨВХӨН энэ багцынх (уншилт унавал өмнөх багцын баннер наалдахгүй) */
    pvReturned: pvReturned && pvReturned.pkgKey === pkg.key ? pvReturned : null,
  };
}
