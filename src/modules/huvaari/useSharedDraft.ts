import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { num } from '@/lib/format';
import type { SheetRow } from '@/modules/sheet/bagtsSheet';
import type { Schema } from '@/modules/sheet/bagts.pkg';
import type { PlanRow } from '@/lib/plan';
import type { MonthRes, PkgPlan, PkgRes } from '@/lib/huvaariObyem';
import type { PlanSubmission } from '@/lib/huvaariBatlah';
import {
  readRemoteDraft, readRemoteDraftAt, saveRemoteDraft, REMOTE_MAX,
} from '@/lib/draftRemote';
import {
  cellsToMaps, hdKey, hdLocalKey, isEmpty as hdIsEmpty, mapsToCells, merge as hdMerge,
  parse as hdParse, remapDraft as hdRemapDraft, sameVal, serialize as hdSerialize, sig as hdSig, users as hdUsersOf,
  type HDApply, type HDCell, type HDCtx, type HDDraft, type HDEntries, type HDEntry, type HDRowBase,
} from '@/lib/huvaariDraft';
import type { ADraft, Draft, PlanKind, ResDraft } from './types';
import { useLatest } from './useLatest';

/**
 * ХУВААЛЦСАН НООРОГ — ArcGIS дээрх нэг мөрөнд сэргээх · дифф · бичих · мөчлөг
 * (2026-09-30: `Huvaari.tsx`-ээс механикаар салгав; логик · тайлбар ХЭВЭЭР).
 *
 * ⚠️ Энэ hook нь 6 ноорогийн Map-ыг ЭЗЭМШДЭГГҮЙ — эцэг (`Huvaari`) дамжуулна,
 *    учир нь тэдгээрийг чирэлт · popup · батлах гинж ч уншиж бичдэг. Энд зөвхөн
 *    алстай нийлүүлэх зам. Гаралтын ref-үүд (`hdTimer` · `hdFlushRef` · `hdClearRef` ·
 *    `hdSkipUnlockOnce` · `hdRemapRef` · `hdMapsRef` · `hdMeta` · `meRef`) нь эцгийн
 *    `withdraw` · `sendForApproval` · `clearPreview` · чирэлтийн цуцлалт · нэмэлт
 *    ажлын урсгалд урьдын адил хэрэглэгдэнэ.
 * ⚠️ Эффектийн ДАРААЛАЛ: энэ hook эцэг дотор `commit`/чирэлтээс ӨМНӨ дуудагддаг тул
 *    сэргээх · дифф · мөчлөгийн эффектүүд батлах гинж · урсгалын эффектүүдээс ӨМНӨ
 *    ажиллана; тэдгээр нь state-ээр (дараагийн зурагдалт) эсвэл ref-ээр л харилцдаг
 *    тул үр дүн ижил.
 */
export function useSharedDraft({
  kind, pkgKey, user, status, canEdit, locked, previewing, approving, pending,
  sc, rows, base, n, obPlan, obRes, obState, flowReady, dirtyN,
  draft, ham, aDraft, resDraft, obDraft, obResDraft,
  setDraft, setHam, setADraft, setResDraft, setObDraft, setObResDraft, setNote, pkgKeyRef, hdRemapRef,
}: {
  kind: PlanKind;
  pkgKey: string;
  user: { username?: string } | null | undefined;
  status: string;
  canEdit: boolean;
  locked: boolean;
  previewing: boolean;
  approving: number | null;
  pending: PlanSubmission | null;
  sc: Schema | null;
  rows: SheetRow[];
  base: PlanRow[];
  n: number;
  obPlan: PkgPlan;
  obRes: PkgRes;
  obState: 'loading' | 'ok' | 'fail';
  flowReady: boolean | null;
  dirtyN: number;
  draft: Draft;
  ham: Map<number, string>;
  aDraft: ADraft;
  resDraft: ResDraft;
  obDraft: Map<string, Map<string, number>>;
  obResDraft: Map<string, Map<string, MonthRes>>;
  setDraft: (v: Draft) => void;
  setHam: (v: Map<number, string>) => void;
  setADraft: (v: ADraft) => void;
  setResDraft: (v: ResDraft) => void;
  setObDraft: (v: Map<string, Map<string, number>>) => void;
  setObResDraft: (v: Map<string, Map<string, MonthRes>>) => void;
  setNote: (v: string) => void;
  /** Одоогийн багцын түлхүүр — async урсгалд (эцэгт `useLatest`) */
  pkgKeyRef: React.RefObject<string>;
  /** «Улсын комисс» шинэ жаазын oid зураглал — эцгийн `[pkg]` эффект тавьдаг, сэргээх эффект нэг удаа хэрэглэнэ */
  hdRemapRef: React.RefObject<{ pkg: string; map: Map<number, number> } | null>;
}) {
  /**
   * Хуваалцсан нооргийн СЭРГЭЭЛТ ДУУССАН түлхүүр (2026-09-29) — `hdReady` ref-ийн
   * зурагдалтад харагдах хуулбар. Буцаагдсан саналыг автоматаар буулгах эффект үүнийг
   * хүлээнэ: хамт ажиллагчийн ноорог ирэхээс өмнө буулгавал давхарлана.
   */
  const [hdReadyKey, setHdReadyKey] = useState<string | null>(null);
  /*
   * ХУВААЛЦСАН НООРОГИЙН ЭРТ ЗАРЛАГДАХ ref-үүд (2026-09-24) — доорх блокоос
   * ӨМНӨ тодорхойлогддог `sendForApproval` · `withdraw` · `clearPreview`
   * тэдгээрт хүрэх ёстой. Утгыг блок дотор л бичнэ.
   */
  const hdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hdFlushRef = useRef<() => Promise<void>>(async () => {});
  const hdClearRef = useRef<(key: string) => Promise<void>>(async () => {});
  /**
   * АЛСЫН `at`-ын СҮҮЛД ХАРСАН УТГА — нийлүүлсэн эсвэл өөрөө бичсэн.
   * ⚠️ `>`-ээр ХАРЬЦУУЛАХГҮЙ (2026-09-24): `at` нь бичигчийн цаг тул цагийн
   *    зөрүүтэй клиент бусдын бичилтийг «хуучин» гэж алгасаж дарж бичдэг
   *    байв. Одоо `at0 !== hdLastSeenAt` бол ЯМАР Ч тохиолдолд дахин уншина;
   *    өөрийн бичилтийн дараа бичсэн `t`-г тавина (сервер яг тэр утгыг
   *    хадгалдаг) — өөр хэн нэг завсарт бичсэн бол утга зөрж, дахин уншина.
   */
  const hdLastSeenAt = useRef(0);
  /**
   * БИЧИЛТИЙН ҮЕ (generation) — цэвэрлэлт/түлхүүр солигдох бүрд +1 (2026-09-24).
   * ⚠️ Явж буй `saveRemoteDraft` цэвэрлэлтийн ДАРАА буувал хаясан ноорог алсад
   *    амилдаг байв; үе зөрсөн бол бууж ирмэгц дахин цэвэрлэнэ.
   */
  const hdGen = useRef(0);
  /**
   * ТҮГЖЭЭ ТАЙЛАГДАХ дараагийн удаад Map-уудыг ХООСЛОХГҮЙ (2026-09-24):
   * `withdraw` нь илгээлтийг ноорогт буулгадаг — тэр агуулга «илгээхээс
   * өмнөх хуучин нүд» биш, зохиогчийн буцааж авсан ажил.
   */
  const hdSkipUnlockOnce = useRef(false);
  /* ══════════════ ХУВААЛЦСАН НООРОГ — ArcGIS дээр (2026-09-23) ══════════════ */
  /**
   * ⚠️ ЯАГААД (хэрэглэгч: «бөглөх хуудасныхтай адил — хэн ч, аль ч төхөөрөмжөөс
   *    явж буй нооргийг харна»): ноорог зөвхөн санах ойд байсан тул таб хаах,
   *    багц солиход устаж, хамт ажиллагчид огт харагддаггүй байв. Одоо
   *    `Selbe_Guitsetgel_Draft` хүснэгтийн (`draftRemote.ts`) ТУСДАА мөрөнд
   *    (`plan:<төрөл>:<багц>` — `|`-гүй, `huvaariDraft.ts`-ийн толгой) 1.5 с
   *    завсарлагатай бичигдэж, нээхэд сэргэж, 3 с тутам бусдын нүдтэй нийлнэ.
   *    Цэвэр логик (нүд ↔ Map, нийлүүлэлт, tombstone) — `huvaariDraft.ts`.
   *
   * ⚠️ БИЧИХГҮЙ ҮЕҮҮД (fail-closed): `canEdit` биш · ArcGIS унтраалттай ·
   *    түгжээтэй (`locked`) · урьдчилан харж байгаа (санал нь өөрийн ноорог
   *    БИШ) · батлах явцад (`approving` — `save` Map-уудыг хоослоход «цуцлалт»
   *    гэж андуурч алсын нооргийг устгах байв) · тухайн түлхүүрийн сэргээлт
   *    дуусаагүй (`hdReady` — эс бөгөөс багц/төрөл солих эффектүүд Map-уудыг
   *    хоослоход ШИНЭ түлхүүрийн алсын ноорог «хоосорлоо» гэж устгагдана).
   *
   * ⚠️ ДИФФ нь МЕТА-г хөтөлнө: 5 Map өөрчлөгдөх бүрд нүдийг өмнөхтэй тулгаж,
   *    шинэ/өөрчлөгдсөн нүдэнд «би · одоо», хасагдсанд tombstone тавина.
   *    Бичих боломжгүй үед (урьдчилан харалт г.м.) дифф ХИЙХГҮЙ, дараа нь
   *    эргэж ирэхэд суурийг ДАХИН тавина — эс бөгөөс саналын нүд бүр
   *    «миний нүд» болж, харахаа болиход бүгд tombstone болно.
   *
   * ⚠️ READ-MERGE-WRITE: бичихийн өмнө хямд `at` шалгаж, алс шинэ бол уншиж
   *    нийлүүлээд бичнэ — эс бөгөөс хоёр хүн ээлжлэн бие биенийхээ нүдийг
   *    дардаг. Өөрийн бичилтийн `t`-г `hdLastMerged` болгож, тойрог өөрийгөө
   *    дахин уншихгүй. Гарын үсэг (`sig`) ижил бол бичихгүй.
   */
  type HdStatus = { st: 'idle' | 'saving' | 'saved' | 'err' | 'big'; at?: number; err?: string };
  const [hdSt, setHdSt] = useState<HdStatus>({ st: 'idle' });
  /** Ноорогт нүд бичсэн БУСАД хүмүүс — толгойн «ноорогт: …» */
  const [hdUsers, setHdUsers] = useState<string[]>([]);
  const hdKeyCur = hdKey(kind, pkgKey);
  /* ⚠️ 2026-09-30: зурагдалтын дунд `ref.current = x` бичдэг байсныг `useLatest` (commit-ийн
     дараа, эффектээс өмнө) болгов — уншигчид нь эффект · async · хариулагч тул утга ижил. */
  const hdKeyRef = useLatest(hdKeyCur);
  const kindRef = useLatest(kind);
  const meRef = useLatest((user?.username ?? '').trim().toLowerCase());
  /**
   * Серверийн суурь — `base` (төрлийн муж) + `rows` (уялдаа · бодит · нөөц) + `obPlan`.
   * ⚠️ `months()` нь задаргаа АЧААЛАГДААГҮЙ/УНАСАН (`obState !== 'ok'`) үед
   *    `undefined` = «мэдэгдэхгүй» (тулгахгүй), ачаалагдсан бол задаргаагүй
   *    ажилд ХООСОН Map = «мэдэгдэж буй хоосон». Хоёрыг ялгахгүй бол
   *    ачаалалтын завсарт алсын бүх сарын нүд «хуучирсан» болдог (2026-09-24).
   */
  const hdCtx = useMemo<HDCtx>(() => {
    const m = new Map<number, HDRowBase>();
    const byOid = new Map(rows.map((r) => [r.oid, r]));
    for (const r of base) {
      const sr = byOid.get(r.oid);
      if (!sr) continue;
      m.set(r.oid, { spans: r.spans, ham: sr.ham, aStart: sr.aStart, aEnd: sr.aEnd, hun: sr.hun, mashin: sr.mashin });
    }
    const known = obState === 'ok';
    return {
      n,
      rows: m,
      months: (k) => {
        if (!known) return undefined;
        const cut = k.indexOf('|');
        return obPlan.get(Number(k.slice(0, cut)))?.get(k.slice(cut + 1)) ?? new Map<string, number>();
      },
      monthsRes: (k) => {
        if (!known) return undefined;
        const cut = k.indexOf('|');
        return obRes.get(Number(k.slice(0, cut)))?.get(k.slice(cut + 1)) ?? new Map<string, MonthRes>();
      },
    };
  }, [base, rows, n, obPlan, obRes, obState]);
  const hdCtxRef = useLatest(hdCtx);
  const hdMapsRef = useLatest({ draft, ham, aDraft, resDraft, obDraft, obRes: obResDraft });
  /** Нүд → хэн хэзээ (локал мета) */
  const hdMeta = useRef(new Map<string, { at: number; user: string }>());
  /** Хассан нүд → агшин (tombstone, 7 хоног) */
  const hdDel = useRef(new Map<string, number>());
  /** Сүүлд тулгасан нүдүүд — диффийн суурь ба `hdLocal`-ийн эх */
  const hdPrev = useRef(new Map<string, HDCell>());
  /**
   * ХУУЧИРСАН (`staleKeys`) нүдүүд — Map-д ч, `hdPrev`-д ч ордоггүй атлаа алсад
   * ҮЛДЭХ ёстой (2026-09-24 аудит): `hdLocal` зөвхөн `hdPrev`-ийг бичдэг,
   * `saveRemoteDraft` мөрийг БҮХЛЭЭР нь солидог тул бусдын хуучирсан нүд
   * энэ клиентийн бичилтээр алга болдог байв. Эх `at`/`user`-тайгаа хэвээр
   * (хэзээ ч «миний» биш) буцааж нийлүүлнэ; `hdPrev` давамгайлна.
   */
  const hdStale = useRef(new Map<string, HDEntry>());
  /** Сэргээлт ДУУССАН түлхүүр — үүнээс өөр үед дифф ч, бичилт ч үгүй */
  const hdReady = useRef<string | null>(null);
  /**
   * АЛСЫН `at`-ын СҮҮЛД ХАРСАН УТГА — нийлүүлсэн эсвэл өөрөө бичсэн.
   * ⚠️ `>`-ээр ХАРЬЦУУЛАХГҮЙ (2026-09-24): `at` нь бичигчийн цаг тул цагийн
   *    зөрүүтэй клиент бусдын бичилтийг «хуучин» гэж алгасаж дарж бичдэг
   *    байв. Одоо `at0 !== hdLastSeenAt` бол ЯМАР Ч тохиолдолд дахин уншина;
   *    өөрийн бичилтийн дараа бичсэн `t`-г тавина (сервер яг тэр утгыг
   *    хадгалдаг) — өөр хэн нэг завсарт бичсэн бол утга зөрж, дахин уншина.
   */
  const hdLastSig = useRef('');
  const hdBusy = useRef(false);
  const hdAgain = useRef(false);
  const hdBaseAt = useRef(0);
  /**
   * МӨР · ЗАДАРГАА СЕРВЕРЭЭС ИРСЭН АГШИН (2026-09-25 аудит) — хуучирсан нүдийг
   * устгаж болох эсэхийг шийднэ (`hdApply`). `hdBaseAt` нь сэргээлт эхэлсэн
   * агшин тул түгжээ тайлагдсаны дараах сэргээлтэд мөр нь үүнээс хуучин байж болно.
   */
  const hdRowsAt = useRef(0);
  const hdObAt = useRef(0);
  useEffect(() => { hdRowsAt.current = rows.length ? Date.now() : 0; }, [rows]);
  useEffect(() => { hdObAt.current = obState === 'ok' ? Date.now() : 0; }, [obPlan, obRes, obState]);
  const hdPrevW = useRef(false);
  /**
   * ⚠️ `pending`-ЭЭР, `locked`-ООР БИШ (2026-09-24): `locked` нь батлах явцад
   *    (`approving`) түр тайлагддаг тул «түгжээ тайлагдав» зам `save()` явж
   *    байхад Map-уудыг хоослож, батлалт «эх хуудсанд бичигдсэнгүй» гэж унадаг байв.
   */
  const hdPending = pending != null;
  const hdPrevPending = useRef(hdPending);
  /** Сэргээлт/нийлүүлэлт хориотой — илгээлт хүлээгдэж, батлагдаж эсвэл урьдчилан харагдаж байхад */
  const hdBlocked = hdPending || approving != null || previewing;
  /** Экспоненциал дахин оролдлого: 3 → 6 → 12 → … → 60 с; амжилт/шинэ дифф тэглэнэ */
  const hdBackoff = useRef(3000);
  const hdWritable = canEdit && status !== 'off' && !locked && !previewing && approving == null;
  const hdWritableRef = useLatest(hdWritable);
  /** `askSwitch`-д (2026-09-29) — харагчид «хадгалаагүй» асуулт тавихгүй */
  const canEditRef = useLatest(canEdit);
  /** Уншиж нийлүүлж болох уу — засах эрхгүй ч харж болно; түгжээ/харалт/батлалтад үгүй */
  const hdPollOk = !hdBlocked;
  const hdPollOkRef = useLatest(hdPollOk);
  const obStateRef = useLatest(obState);

  const hdSchedule = useCallback((ms: number) => {
    if (hdTimer.current) clearTimeout(hdTimer.current);
    hdTimer.current = setTimeout(() => { hdTimer.current = null; void hdFlushRef.current(); }, ms);
  }, []);
  /** Алдааны дараах дахин оролдлого — backoff-той */
  const hdRetry = useCallback(() => {
    hdSchedule(hdBackoff.current);
    hdBackoff.current = Math.min(60_000, hdBackoff.current * 2);
  }, [hdSchedule]);

  /**
   * Одоогийн нүдүүд (`hdPrev`) + мета → ноорог.
   * ⚠️ Метагүй нүдийн «одоо»-г МЕТА-д ХАДГАЛНА (2026-09-24) — урьд нь дуудлага
   *    бүрд шинэ `at` авдаг тул түгжээтэй үед орсон нүд (татсан илгээлт г.м.)
   *    үргэлж «дөнгөж бичигдсэн» болж бусдын шинэ нүдийг ч дарах байв.
   */
  const hdLocal = useCallback((): HDDraft => {
    const now = Date.now();
    const entries: HDEntries = new Map();
    /* Хуучирсан нүд — эх мета-тайгаа; доорх `hdPrev` ижил түлхүүрт дарна */
    for (const [k, e] of hdStale.current) entries.set(k, { val: e.val, bv: e.bv, at: e.at, user: e.user });
    for (const [k, c] of hdPrev.current) {
      let m = hdMeta.current.get(k);
      if (!m) { m = { at: now, user: meRef.current }; hdMeta.current.set(k, m); }
      entries.set(k, { val: c.val, bv: c.bv, at: m.at, user: m.user });
    }
    return {
      t: now, kind: kindRef.current, pkg: pkgKeyRef.current, by: { user: meRef.current, at: now },
      entries, del: new Map(hdDel.current), base: { at: hdBaseAt.current, n: hdCtxRef.current.n },
    };
  }, [hdCtxRef, kindRef, meRef, pkgKeyRef]);

  /**
   * Нооргийг 5 Map болгож state-д тавина; мета · tombstone · дифф-суурийг
   * ЗЭРЭГ шинэчилнэ — дараагийн дифф «өөрчлөлтгүй» гэж үзнэ.
   * ⚠️ Tombstone ЗӨВХӨН «серверийнхтэй ижил болсон» нүдэнд (2026-09-24).
   *    ХУУЧИРСАН (`staleKeys`) нүдэнд ТАВИХГҮЙ: хуучин суурьтай клиент бусдын
   *    хүчинтэй нүдийг бүгдэд нь устгадаг байв. Хуучирсан нүд зөвхөн энд
   *    орохгүй — алсад хэвээр, мөрөө шинэчилсэн клиент шийднэ.
   */
  const hdApply = useCallback((d: HDDraft): HDApply => {
    const ap = cellsToMaps(d.entries, hdCtxRef.current);
    const now = Date.now();
    const dropped = new Set(ap.dropped);
    const stale = new Set(ap.staleKeys);
    const meta = new Map<string, { at: number; user: string }>();
    for (const [k, e] of d.entries) if (!dropped.has(k)) meta.set(k, { at: e.at, user: e.user });
    const del = new Map(d.del);
    for (const k of dropped) if (!stale.has(k)) del.set(k, now);
    /*
     * ⚠️ МАШ ХУУЧИН «ХУУЧИРСАН» НҮДИЙГ УСТГАНА (2026-09-25 аудит). Дээрх дүрэм
     *    (хуучирсныг мөрөө шинэчилсэн клиент шийднэ) хэрэгжих зам БАЙГААГҮЙ: мөр нь
     *    шинэ клиент ч түүнийг `hdStale`-д хадгалж `hdLocal`-аар дахин бичдэг тул
     *    FillNew нийтлэл (бүх OID солигдоно) бүрийн дараа нүд мөнхөд амилж, «ноорогт:
     *    …» сүнс зохиогч харуулж, ачаалал `REMOTE_MAX` руу өсдөг байв.
     *    ШИЙДЭХ ЭРХ = ЭНЭ клиентийн суурь нүднээс ШИНЭ: нүд нь манай мөр (`s/h/a/r`)
     *    эсвэл задаргаа (`m/n`) серверээс ирэхээс `MARGIN`-аас өмнө бичигдсэн бол
     *    бичигчийн суурь манайхаас хуучин нь гарцаагүй → tombstone. Шинэ нүд (манай
     *    суурь хуучин байж болох) хэвээр — 2026-09-24-ний хамгаалалт хадгалагдана.
     *    Цагийн зөрүүнд `MARGIN` (10 мин). Бичих эрхгүй бол хөндөхгүй.
     */
    /*
     * ⚠️ 2026-09-25 аудит: «мөр алга» (шинэ жааз — бүх OID солигдсон) нүд БУСДЫН
     *    бол tombstone ХИЙХГҮЙ: хуучин жаазтай, хуудсаа шинэчлээгүй хамтрагчийн
     *    хүчинтэй ажлыг устгадаг байв. Tombstone зөвхөн (а) МИНИЙ нүд — би шинэ
     *    жаазад шилжсэн тул хуучин oid-той нүд маань гарцаагүй хуучирсан, эсвэл
     *    (б) `bv` ЗӨРСӨН нүд — мөр байгаа ч сервер бичигчийн суурийг өөрчилсөн.
     *    Бусдын «мөр алга» нүдийг эзэн нь өөрөө шинэчлэхдээ (а)-аар цэвэрлэнэ.
     */
    const bvStale = new Set(ap.bvKeys);
    const MARGIN = 10 * 60_000;
    let tomb = 0;
    const st = new Map<string, HDEntry>();
    for (const k of stale) {
      const e = d.entries.get(k);
      if (!e) continue;
      const fresh = k[0] === 'm' || k[0] === 'n' ? hdObAt.current : hdRowsAt.current;
      const mayKill = e.user === meRef.current || bvStale.has(k);
      if (mayKill && hdWritableRef.current && fresh > 0 && e.at < fresh - MARGIN) { del.set(k, now); tomb += 1; continue; }
      st.set(k, e);
    }
    hdMeta.current = meta;
    hdDel.current = del;
    hdStale.current = st;
    hdPrev.current = mapsToCells(ap.maps, hdCtxRef.current);
    setDraft(ap.maps.draft); setHam(ap.maps.ham); setADraft(ap.maps.aDraft);
    setResDraft(ap.maps.resDraft); setObDraft(ap.maps.obDraft); setObResDraft(ap.maps.obRes);
    setHdUsers(hdUsersOf(d).filter((u) => u !== meRef.current));
    /* Устгасан хуучирсан нүдийг алсад хүргэнэ — дуудагчийн товлолтоос үл хамааран */
    if (tomb) hdSchedule(1500);
    return ap;
  }, [hdSchedule, hdCtxRef, hdWritableRef, meRef, setADraft, setDraft, setHam, setObDraft, setObResDraft, setResDraft]);

  /**
   * ЦЭВЭРЛЭЛТ — илгээсэн · цуцалсан · хоосорсон. Мөрийг УСТГАХГҮЙ: хоосон
   * ноорог + бүх нүдний tombstone + `cleared` агшныг бичнэ (2026-09-24).
   * ⚠️ `clearRemoteDraft`-аар устгавал tombstone ч устаж, өөр төхөөрөмжийн
   *    localStorage хуулбар илгээгдсэн нооргийг дахин амилуулдаг байв.
   *    Локал хуулбарт ч ижил хоосон ноорог бичнэ (`t < cleared` дүрэм).
   */
  const hdClear = useCallback(async (key: string, extraKeys: Iterable<string> = []) => {
    if (hdTimer.current) { clearTimeout(hdTimer.current); hdTimer.current = null; }
    hdGen.current += 1;
    const now = Date.now();
    const del = new Map(hdDel.current);
    for (const k of hdPrev.current.keys()) del.set(k, now);
    for (const k of extraKeys) del.set(k, now);
    hdLastSig.current = '';
    hdMeta.current = new Map(); hdDel.current = del; hdPrev.current = new Map(); hdStale.current = new Map();
    const d: HDDraft = {
      t: now, kind: kindRef.current, pkg: pkgKeyRef.current, by: { user: meRef.current, at: now },
      entries: new Map(), del, base: { at: hdBaseAt.current, n: hdCtxRef.current.n }, cleared: now,
    };
    const body = hdSerialize(d);
    try { localStorage.setItem(hdLocalKey(key), body); } catch { /* хаалттай орчин */ }
    setHdSt({ st: 'idle' }); setHdUsers([]);
    if (status === 'off') return;
    const r = await saveRemoteDraft(key, now, body);
    if (key !== hdKeyRef.current) return;
    if (r.ok) { hdLastSeenAt.current = now; hdLastSig.current = hdSig(d); } else {
      setHdSt({ st: 'err', err: tr('алсын ноорог цэвэрлэгдсэнгүй — {0}', r.error) });
    }
  }, [status, hdCtxRef, hdKeyRef, kindRef, meRef, pkgKeyRef]);

  /**
   * Хадгалалтын үндсэн зам — read-merge-write, дараа нь `sig` ижил бол алгасна.
   * ⚠️ Локалыг НИЙЛҮҮЛЭХИЙН ӨМНӨ дахин уншина (2026-09-24): уншилтын завсарт
   *    хийсэн засвар урьд нь `hdApply(merged)`-ээр дэлгэцээс арилж, алсад ч
   *    очдоггүй байв.
   * ⚠️ Хоосорсон ноорог ЭНД л цэвэрлэгдэнэ — алсыг нийлүүлсний ДАРАА: дифф
   *    шууд устгавал сүүлийн 3 с-д бусдын нэмсэн нүд алдагдана.
   */
  const hdFlush = useCallback(async () => {
    if (hdBusy.current) { hdAgain.current = true; return; }
    const key = hdKeyRef.current;
    if (hdReady.current !== key || !hdWritableRef.current) return;
    const live = () => key === hdKeyRef.current && hdReady.current === key;
    hdBusy.current = true;
    try {
      const at0 = await readRemoteDraftAt(key);
      if (!live()) return;
      if (at0 === undefined) {
        setHdSt({ st: 'err', err: tr('алсын ноорогийг шалгаж чадсангүй') });
        hdRetry();
        return;
      }
      if ((at0 ?? 0) !== hdLastSeenAt.current) {
        const rr = await readRemoteDraft(key);
        if (!live()) return;
        if (!rr.ok) { setHdSt({ st: 'err', err: rr.error }); hdRetry(); return; }
        const local0 = hdLocal();
        const merged = hdMerge(rr.draft ? hdParse(rr.draft.payload) : null, local0) ?? local0;
        hdApply(merged);
        hdLastSeenAt.current = at0 ?? 0;
      }
      const local = hdLocal();
      /* Хоосон — цэвэрлэлт (нэг удаа: tombstone-ууд аль хэдийн бичигдсэн бол алгасна) */
      if (hdIsEmpty(local)) { if (hdSig(local) !== hdLastSig.current) await hdClear(key); return; }
      const body = hdSerialize(local);
      const s = hdSig(local);
      /* ⚠️ Локал хуулбар БҮХ оролдлогод — алс унасан ч энэ компьютерт үлдэнэ */
      try { localStorage.setItem(hdLocalKey(key), body); } catch { /* хаалттай орчин */ }
      if (s === hdLastSig.current) return;
      if (body.length > REMOTE_MAX) { setHdSt({ st: 'big' }); return; }
      setHdSt({ st: 'saving' });
      const gen = hdGen.current;
      /* ⚠️ 2026-09-29 аудит: optimistic lock — дээрх уншилтаас хойш өөр хүн бичсэн бол
         юу ч дарахгүй, дахин уншиж нийлүүлнэ (`conflict`). */
      const r = await saveRemoteDraft(key, local.t, body, { expectAt: hdLastSeenAt.current });
      if (!r.ok && r.conflict) { if (live()) hdAgain.current = true; return; }
      /* ⚠️ Бичилт явж байхад цэвэрлэсэн/түлхүүр солигдсон бол (2026-09-24) энэ
         бичилт хаясан нооргийг амилуулсан — тэр даруй дахин цэвэрлэнэ. */
      if (r.ok && gen !== hdGen.current) {
        const t2 = Date.now();
        const del = new Map<string, number>();
        for (const k of local.entries.keys()) del.set(k, t2);
        for (const [k, a] of local.del) del.set(k, a);
        void saveRemoteDraft(key, t2, hdSerialize({ ...local, t: t2, entries: new Map(), del, cleared: t2 }));
        return;
      }
      if (!live()) return;
      if (r.ok) {
        hdLastSig.current = s;
        /* ⚠️ Бичсэн `t`-г тавина — сервер яг тэр утгыг хадгалдаг; завсарт өөр
           хүн бичсэн бол `at0` зөрж дараагийн шалгалтад дахин уншина */
        hdLastSeenAt.current = local.t;
        hdBackoff.current = 3000;
        setHdSt({ st: 'saved', at: local.t });
      } else {
        setHdSt({ st: 'err', err: r.error });
        hdRetry();
      }
    } finally {
      hdBusy.current = false;
      if (hdAgain.current) { hdAgain.current = false; hdSchedule(300); }
    }
  }, [hdLocal, hdApply, hdClear, hdSchedule, hdRetry, hdKeyRef, hdWritableRef]);
  /* ⚠️ 2026-09-30: commit-ийн дараа (`useLayoutEffect`) — уншигчид нь товлолт (setTimeout) ба
     async урсгал тул зурагдалтын дунд бичсэнтэй ижил утга. */
  useLayoutEffect(() => { hdFlushRef.current = hdFlush; hdClearRef.current = hdClear; });
  /** Сэргээлтийг ТЭГЛЭНЭ — дараагийн зурагдалтад алсын ноорог дахин уншигдана (3 газар ижил, 2026-09-30) */
  const hdResetRestore = useCallback(() => {
    hdReady.current = null; hdLastSeenAt.current = 0; setHdReadyKey(null);
  }, []);

  /**
   * СЭРГЭЭЛТ — багц/төрөл солигдоход (мөр · задаргаа ачаалагдаж, урсгал
   * мэдэгдсэний дараа). Алс → эс бөгөөс локал хуулбар; уншилтын завсарт хийсэн
   * засвар (Map-д байгаа) нийлнэ. Түгжээтэй бол хойшилно (`locked` deps).
   * ⚠️ ТҮГЖЭЭ ТАЙЛАГДАХАД (батлагдсан/буцаагдсан) ДАХИН СЭРГЭЭНЭ (2026-09-24):
   *    урьд нь `hdReady === key` тул алгасаж, илгээхээс өмнөх хуучин нүд шинэ
   *    хуваалцсан ноорог болж бичигддэг байв. Map · мета бүгд хаягдана.
   */
  useEffect(() => {
    const key = hdKeyCur;
    const wasPending = hdPrevPending.current;
    hdPrevPending.current = hdPending;
    if (wasPending && !hdPending && hdReady.current === key) {
      if (hdSkipUnlockOnce.current) {
        /* `withdraw` — буулгасан агуулгыг хадгална; мета-г дифф тавина */
        hdSkipUnlockOnce.current = false;
      } else {
        hdReady.current = null;
        setDraft(new Map()); setHam(new Map()); setADraft(new Map()); setResDraft(new Map()); setObDraft(new Map()); setObResDraft(new Map());
      }
    }
    if (hdReady.current === key) return undefined;
    /* ⚠️ `null` (хуучин түлхүүр БИШ): b32→b33→b32 хурдан солиход хуучин утга
       «бэлэн» гэж уншигдаж сэргээлт алгасагддаг байв (2026-09-24). */
    hdReady.current = null;
    setHdReadyKey(null);
    hdMeta.current = new Map(); hdDel.current = new Map(); hdPrev.current = new Map(); hdStale.current = new Map();
    hdLastSeenAt.current = 0; hdLastSig.current = ''; hdAgain.current = false; hdBackoff.current = 3000;
    hdGen.current += 1;
    hdSkipUnlockOnce.current = false;
    if (hdTimer.current) { clearTimeout(hdTimer.current); hdTimer.current = null; }
    setHdSt({ st: 'idle' }); setHdUsers([]);
    /* ⚠️ Батлах явцад · урьдчилан харахад · илгээлт хүлээгдэж байхад ЭХЛЭХГҮЙ */
    if (!sc || !rows.length || obState === 'loading' || flowReady === null || hdBlocked) return undefined;
    hdBaseAt.current = Date.now();
    let alive = true;
    void (async () => {
      let remote: HDDraft | null = null;
      let readErr = '';
      let fromLocal = false;
      if (status !== 'off') {
        const rr = await readRemoteDraft(key);
        if (!alive) return;
        if (rr.ok) {
          remote = rr.draft ? hdParse(rr.draft.payload) : null;
          if (rr.draft) hdLastSeenAt.current = rr.draft.at;
        } else readErr = rr.error;
      }
      /* ⚠️ Локал хуулбарыг ҮРГЭЛЖ нийлүүлнэ (2026-09-24) — урьд нь зөвхөн алс
         хоосон үед; алсад ямар нэг ноорог байхад оффлайн засвар алдагддаг байв.
         Цэвэрлэлтээс (`cleared`) хуучин хуулбар ҮГҮЙ. */
      try {
        const l = hdParse(localStorage.getItem(hdLocalKey(key)));
        const clearedAt = Math.max(remote?.cleared ?? 0, l?.cleared ?? 0);
        if (l && !hdIsEmpty(l) && l.t >= clearedAt) {
          remote = remote ? hdMerge(remote, l) : l;
          fromLocal = true;
        }
      } catch { /* хаалттай орчин */ }
      /* Уншилтын завсарт хийсэн засвар — «би · одоо» гэж нийлнэ */
      const cells = mapsToCells(hdMapsRef.current, hdCtxRef.current);
      const now = Date.now();
      const localD: HDDraft | null = cells.size ? {
        t: now, kind: kindRef.current, pkg: pkgKeyRef.current, by: { user: meRef.current, at: now },
        entries: new Map([...cells].map(([k, c]) => [k, { ...c, at: now, user: meRef.current }])),
        del: new Map(), base: { at: hdBaseAt.current, n: hdCtxRef.current.n },
      } : null;
      let merged = hdMerge(remote, localD);
      /* ⚠️ «Улсын комисс» шинэ жааз (2026-09-25 аудит, `hdRemapRef`-ийн ⚠️): алс/локал
         ноорог хуучин oid-тай тул мөрд тулгахаас ӨМНӨ шинэ oid руу зөөнө; нэг удаа. */
      const rm = hdRemapRef.current;
      if (rm && rm.pkg === pkgKeyRef.current) {
        hdRemapRef.current = null;
        if (merged) merged = hdRemapDraft(merged, rm.map);
      }
      hdReady.current = key;
      /* ⚠️ `hdApply`-тай НЭГ багцад (React 18) — автомат буулгалт ноорогтой зурагдалтыг харна */
      setHdReadyKey(key);
      hdPrevW.current = hdWritableRef.current;
      if (readErr && !fromLocal) setHdSt({ st: 'err', err: readErr });
      if (!merged || hdIsEmpty(merged)) return;
      const ap = hdApply(merged);
      const parts: string[] = [];
      if (ap.applied) parts.push(tr('Ноорог сэргээв: {0} мөр', num(ap.rows)));
      if (ap.stale) parts.push(tr('{0} мөр хуучирсан тул хасав', num(ap.stale)));
      if (fromLocal && readErr) parts.push(tr('алсын ноорог уншигдсангүй — энэ компьютерийн хуулбар'));
      if (parts.length) setNote(parts.join(' · '));
      /* Локалоос сэргэсэн эсвэл ижил болсон нүд арилгах бол алсыг шинэчилнэ */
      /* ⚠️ Уншилтын завсрын засвар (`localD`, ж: татсан илгээлт) ч алсад очих ёстой */
      if ((fromLocal || localD || ap.dropped.length > ap.staleKeys.length) && hdWritableRef.current) hdSchedule(1500);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hdKeyCur, sc, rows.length > 0, obState, flowReady, hdBlocked, hdPending, status]);

  /**
   * ДИФФ — 5 Map өөрчлөгдөх бүрд мета/tombstone хөтөлж, 1.5 с дараа бичнэ.
   * ⚠️ Задаргаа ачаалагдаж байхад (`obState === 'loading'` — багц солих,
   *    `refetchServer`-ийн завсрын зурагдалт) ОГТ ажиллахгүй: суурь дутуу тул
   *    сарын нүд «алга болж» tombstone авах байв (2026-09-24).
   * ⚠️ Ноорог ХООСОРВОЛ шууд устгахгүй — `hdFlush` алсыг нийлүүлээд шийднэ.
   */
  useEffect(() => {
    const key = hdKeyCur;
    if (hdReady.current !== key || obState === 'loading') return;
    const cur = mapsToCells({ draft, ham, aDraft, resDraft, obDraft, obRes: obResDraft }, hdCtx);
    const wasW = hdPrevW.current;
    hdPrevW.current = hdWritable;
    const now = Date.now();
    /* ⚠️ Бичих боломжгүй үед (эсвэл дөнгөж боломжтой болоход) зөвхөн СУУРИЙГ
       тавина — саналын нүдэнд tombstone тавихгүй; метагүй шинэ нүдэнд «би ·
       одоо»-г нэг удаа тавина (`at` тогтвортой байхын тулд, 2026-09-24). */
    if (!hdWritable || !wasW) {
      for (const k of cur.keys()) if (!hdMeta.current.has(k)) hdMeta.current.set(k, { at: now, user: meRef.current });
      hdPrev.current = cur;
      return;
    }
    const prev = hdPrev.current;
    let changed = false;
    for (const [k, c] of cur) {
      const p = prev.get(k);
      if (!p || !sameVal(p.val, c.val)) {
        hdMeta.current.set(k, { at: now, user: meRef.current });
        hdDel.current.delete(k);
        changed = true;
      }
    }
    for (const k of prev.keys()) {
      if (!cur.has(k)) { hdMeta.current.delete(k); hdDel.current.set(k, now); changed = true; }
    }
    hdPrev.current = cur;
    if (!changed) return;
    hdBackoff.current = 3000;
    hdSchedule(!cur.size && prev.size ? 300 : 1500);
  }, [draft, ham, aDraft, resDraft, obDraft, obResDraft, hdCtx, hdKeyCur, hdWritable, obState, hdSchedule, meRef]);

  /**
   * МӨЧЛӨГ — 3 с тутам (таб харагдаж байхад) алсын `at`-ыг хямдаар шалгаж,
   * өөр бол уншиж нийлүүлнэ. Мэдэгдэлгүй — зөвхөн толгойн «ноорогт: …».
   * ⚠️ Нийлүүлсний дараа гарын үсэг өөрчлөгдсөн бол (өөрийн нүд алсад дутуу)
   *    бичилт товлоно — `sig` эрэмбэ/`by`-аас хамаардаггүй тул тойрог үүсэхгүй.
   * ⚠️ Таб нуугдах / хуудас хаагдахад хүлээгдэж буй бичилтийг ШУУД гүйцэтгэнэ
   *    (`FillNew`-тэй ижил) — 1.5 с завсарлага таб хаахад алдагдахгүй.
   */
  useEffect(() => {
    if (status === 'off') return undefined;
    const tick = async () => {
      const key = hdKeyRef.current;
      if (document.hidden || hdBusy.current || hdReady.current !== key || !hdPollOkRef.current) return;
      /* ⚠️ Мөргүй/задаргаагүй суурьтай (багц солигдож, мөр шинэчлэгдэж байгаа)
         тулгавал нүд хуучирна эсвэл суурьгүй орно */
      if (hdCtxRef.current.rows.size === 0 || obStateRef.current === 'loading') return;
      hdBusy.current = true;
      try {
        const at0 = await readRemoteDraftAt(key);
        /* ⚠️ `await` бүрийн дараа ДАХИН шалгана (2026-09-24 аудит): уншилтын завсарт
           батлалт/урьдчилан харалт эхэлсэн бол `hdApply` Map-уудыг дарж, харж
           буй санал эсвэл бичигдэж буй ноорог солигддог байв. */
        if (!hdPollOkRef.current) return;
        if (at0 === undefined || (at0 ?? 0) === hdLastSeenAt.current || key !== hdKeyRef.current) return;
        const rr = await readRemoteDraft(key);
        if (!hdPollOkRef.current) return;
        if (key !== hdKeyRef.current || hdReady.current !== key || !rr.ok) return;
        const merged = hdMerge(rr.draft ? hdParse(rr.draft.payload) : null, hdLocal());
        hdLastSeenAt.current = at0 ?? 0;
        if (!merged) return;
        hdApply(merged);
        if (hdWritableRef.current && hdSig(merged) !== hdLastSig.current) hdAgain.current = true;
      } finally {
        hdBusy.current = false;
        if (hdAgain.current) { hdAgain.current = false; hdSchedule(1500); }
      }
    };
    const id = setInterval(() => { void tick(); }, 3000);
    /* ⚠️ Таб хаагдахад урьдчилсан уншилт (`readRemoteDraftAt`) дуусдаггүй тул
       (2026-09-24) ЭХЛЭЭД локал хуулбарыг синхрон бичиж, дараа нь алсад
       уншилтгүйгээр ШУУД бичнэ — «best effort». */
    const flushNow = () => {
      if (!hdTimer.current) return;
      clearTimeout(hdTimer.current); hdTimer.current = null;
      const key = hdKeyRef.current;
      if (hdReady.current !== key || !hdWritableRef.current) return;
      const local = hdLocal();
      if (hdIsEmpty(local)) { void hdFlushRef.current(); return; }
      const body = hdSerialize(local);
      try { localStorage.setItem(hdLocalKey(key), body); } catch { /* хаалттай орчин */ }
      if (body.length > REMOTE_MAX || hdSig(local) === hdLastSig.current) return;
      const gen = hdGen.current;
      /* ⚠️ 2026-09-29: уншилтгүй бичилт ч бусдын шинэ нүдийг дарахгүй (`expectAt`) —
         зөрвөл алгасна; локал хуулбар дээр бичигдсэн тул дараагийн нээлтэд нийлнэ. */
      void saveRemoteDraft(key, local.t, body, { expectAt: hdLastSeenAt.current }).then((r) => {
        if (r.ok && gen === hdGen.current && key === hdKeyRef.current) {
          hdLastSig.current = hdSig(local); hdLastSeenAt.current = local.t;
        }
      });
    };
    const vis = () => { if (document.hidden) flushNow(); else void tick(); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('pagehide', flushNow);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('pagehide', flushNow);
    };
  }, [status, hdLocal, hdApply, hdSchedule, hdCtxRef, hdKeyRef, hdPollOkRef, hdWritableRef, obStateRef]);

  /** Хадгалалтын төлөвийн богино текст — толгойд */
  const hdLabel = hdSt.st === 'saving' ? tr('Ноорог хадгалж байна…')
    : hdSt.st === 'saved' ? tr('Ноорог хадгалагдсан {0}', (() => {
      const d = new Date(hdSt.at ?? 0);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    })())
      : hdSt.st === 'big' ? tr('ноорог хэт том — зөвхөн энэ компьютерт')
        : hdSt.st === 'err' ? tr('Ноорог алсад хадгалагдсангүй — {0}', hdSt.err ?? '')
          : '';

  /**
   * БАГЦ/ТӨРӨЛ СОЛИХ зөвшөөрөл асууна.
   *
   * ⚠️ УРЬДЧИЛАН ХАРЖ БАЙХАД ТУСДАА АСУУЛТ (2026-09-11-ний аудитын S1).
   *    Урьд нь `previewing` үед ШУУД `true` буцаадаг байв — «ноорог нь
   *    батлагчийнх тул хаяхад эвгүй зүйлгүй» гэсэн үндэслэлээр. Гэвч солих
   *    нь урьдчилан харалтыг ТАСАЛДАГ: батлагч юу харж байснаа алдаж,
   *    илгээлт хүлээгдсэн хэвээр үлдэнэ. Тиймээс чимээгүй зөвшөөрөхгүй.
   * ⚠️ Хоёр тохиолдолд ӨӨР асуулт: урьдчилан харалт нь өгөгдөл алдахгүй
   *    (сервер дээр хэвээр), ноорог нь АЛДАГДАНА.
   */
  const askSwitch = useCallback(
    () => {
      if (previewing) {
        return window.confirm(tr('Батлах урьдчилан харалт хаагдана. Илгээлт хүлээгдсэн хэвээр үлдэнэ. Үргэлжлүүлэх үү?'));
      }
      /* ⚠️ 2026-09-29 аудит: зөвхөн ХАРАГЧИД бусдын ноорог Map-д байдаг — асуухгүй, устгахгүй */
      if (dirtyN === 0 || !canEditRef.current) return true;
      const ok = window.confirm(tr('Хадгалаагүй {0} өөрчлөлт байна. Хаяад солих уу? Хуваалцсан ноорог бүх оролцогчид устна.', num(dirtyN)));
      /* ⚠️ Хаяхыг зөвшөөрвөл ХУВААЛЦСАН нооргийг ч цэвэрлэнэ (2026-09-23) — эс
         бөгөөс буцаж ирэхэд «хаясан» ноорог алсаас дахин сэргэнэ.
         ⚠️ ЗӨВХӨН бичих эрхтэй үед (2026-09-24): зөвхөн харагч ч ноорогийг
            дэлгэцэндээ авдаг тул түүнгүйгээр бусдын ажлыг устгах байв. */
      if (ok && hdWritableRef.current) void hdClear(hdKeyRef.current);
      return ok;
    },
    [dirtyN, previewing, hdClear, canEditRef, hdKeyRef, hdWritableRef],
  );

  return {
    hdSt, hdUsers, hdLabel, hdReadyKey, hdReady, hdLastSeenAt, hdFlushRef, hdClearRef,
    /* ⚠️ `*Ref` нэрээр — React Compiler ref-ийг нэрээр нь таньж, эцэгт `.current` бичихийг зөвшөөрнө */
    hdTimerRef: hdTimer, hdSkipUnlockOnceRef: hdSkipUnlockOnce, hdMapsRef, hdMeta, meRef, hdKeyRef, hdWritableRef, canEditRef,
    askSwitch, hdClear, hdResetRestore,
  };
}
