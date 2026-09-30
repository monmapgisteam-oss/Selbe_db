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
  decideObyem, loadPending as loadObyemPending, loadPayload as loadObyemPayload,
  submitObyem, type ObyemSubmission, type ObyemPayload,
} from '@/lib/obyemBatlah';
import { t as tr } from "@/lib/i18nCore";

export function useObyem({ pkg, pkgKeyRef, rows, sc, user, locked }: {
  pkg: Pkg;
  /** ОДОО сонгогдсон багцын түлхүүр — синхрон (FillNew-ийн `pkgKeyRef`-ийн ⚠️) */
  pkgKeyRef: RefObject<string>;
  rows: SheetRow[];
  sc: Schema | null;
  user: { username: string } | null;
  locked: boolean;
}) {
  /**
   * Инженерийн обьёмын НООРОГ — `oid` → бичсэн текст ("" = цэвэрлэх).
   * ⚠️ Түлхүүр нь `oid` ДАНГААРАА: талбар нь мөрд ганц скаляр тул
   *    гүйцэтгэлийн `${oid}:${b}` хэлбэр энд хэрэггүй.
   */
  const [pvPend, setPvPend] = useState<Record<number, string>>({});
  /** Хүлээгдэж буй илгээлт — байвал багана ТҮГЖИГДЭНЭ */
  const [pvSub, setPvSub] = useState<ObyemSubmission | null>(null);
  /** Батлагчийн урьдчилан харах агуулга (`oid` → утга) */
  const [pvPreview, setPvPreview] = useState<Map<number, number | null> | null>(null);
  const [pvBusy, setPvBusy] = useState(false);
  const [pvErr, setPvErr] = useState("");
  const [pvNote, setPvNote] = useState("");

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
  }, [pkg.key, pkgKeyRef]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: `refreshObyem` async — setState нь `await`-ийн ДАРАА (шалгуурын худал эерэг); синхрон setState байхгүй
  useEffect(() => { void refreshObyem(); }, [refreshObyem]);

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
      if (!r.ok) { setPvErr(r.error ?? tr('Илгээгдсэнгүй.')); return; }
      /* ⚠️ Ноорогийг ЦЭВЭРЛЭНЭ: агуулга нь одоо серверт хадгалагдсан тул
         локалд үлдээвэл дахин илгээх эсвэл батлагдсаны дараа хуучин
         ноорог дахин бичигдэх эрсдэлтэй. */
      setPvPend({});
      setPvNote(tr('Инженерийн обьём батлуулахаар илгээгдлээ — батлагч шийдвэрлэнэ.'));
      await refreshObyem();
    } catch (e) {
      if (pkgKeyRef.current === pkg.key) setPvErr(String((e as Error).message || e));
    } finally {
      setPvBusy(false);
    }
  }, [pvCells, pvBusy, pkg.key, pkg.group, user, refreshObyem, rows, pkgKeyRef]);

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
    try {
      if (approve) {
        const fld = sc.f.plannedVol;
        if (!fld) {
          setPvErr(tr('Энэ багцын үйлчилгээнд талбар байхгүй тул батлах боломжгүй.'));
          return;
        }
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
        await applyUpdates(pkg, upd);
        pvSkipped = skippedN;
      }
      const r = await decideObyem({
        oid: pvSub.oid,
        approve,
        approver: user?.username ?? '',
        author: pvSub.author,
        reason,
      });
      if (!here()) return;
      if (!r.ok) { setPvErr(r.error ?? tr('Шийдвэр хадгалагдсангүй.')); return; }
      setPvNote(approve
        ? tr('Инженерийн обьём батлагдаж, үндсэн өгөгдөлд бичигдлээ.')
          + (pvSkipped ? ' ' + tr('{0} мөр архивын сүүлийн жаазад тулгагдаагүй тул бичигдсэнгүй.', pvSkipped) : '')
        : tr('Буцаагдлаа — инженер засаад дахин илгээнэ.'));
      await refreshObyem();
    } catch (e) {
      pvErrHere(String((e as Error).message || e));
    } finally {
      setPvBusy(false);
    }
  }, [pvSub, pvBusy, sc, rows, pkg, user, refreshObyem, locked, pkgKeyRef]);
  return {
    pvPend, setPvPend, pvSub, setPvSub, pvPreview, setPvPreview, pvBusy, pvErr, setPvErr, pvNote, setPvNote,
    pvCells, sendObyem, decideObyemHere,
  };
}
