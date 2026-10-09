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
  applyClear, cellsToMaps, coversMark, dropCleared, hdClearMarkKey, hdKey, hdLocalKey, hlcNext, identityRemap, isEmpty as hdIsEmpty,
  mapsToCells, maxStamp, merge as hdMerge, mergeMark, parse as hdParse, parseKey, parseMark, remapDraft as hdRemapDraft, sameVal,
  serialize as hdSerialize, serializeMark, sig as hdSig, users as hdUsersOf,
  type HDApply, type HDCell, type HDClearMark, type HDCtx, type HDDraft, type HDEntries, type HDEntry, type HDRowBase, type HDRowKey,
} from '@/lib/huvaariDraft';
import type { ADraft, Draft, PlanKind, ResDraft } from './types';
import { useLatest } from './useLatest';
import { remapRowsFull } from './savePrep';

/** «Саяхан» — хамтрагчийн нүдийг дарсан мэдэгдлийн цонх (мс, 2026-10-08) */
const HD_RECENT = 10 * 60_000;

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
  sc, rows, base, n, obPlan, obRes, obState, flowReady, dirtyN, dragging = false,
  draft, ham, aDraft, resDraft, obDraft, obResDraft,
  setDraft, setHam, setADraft, setResDraft, setObDraft, setObResDraft, setNote, pkgKeyRef, hdRemapRef, onRemote,
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
  /** Чирэлт явж байна (2026-10-04) — мөчлөгийн нийлүүлэлт Map-уудыг дарахгүй, чирэлт дуусахыг хүлээнэ */
  dragging?: boolean;
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
  /**
   * ⚠️ 2026-10-09: ХАМТРАГЧИЙН нүд нийлүүлэлтээр (`hdApply`) ӨӨРЧЛӨГДСӨН түлхүүрүүд (`s:`/`h:`/`a:`/`r:`/`m:`/`n:`) —
   *    эцэг буцаалтын агшинг (`Huvaari.undoSnap`) хүчингүй болгоно: тэр агшин нь нийлүүлэлтээс ӨМНӨХ утга
   *    тул Ctrl+Z хамтрагчийн шинэ утгыг хуучнаар дарах байв. Өөрийн нүд тоологдохгүй.
   */
  onRemote?: (keys: ReadonlySet<string>) => void;
}) {
  /* ⚠️ 2026-10-09: `hdApply`-ийн deps-ийг хөдөлгөхгүйн тулд ref-ээр */
  const onRemoteRef = useLatest(onRemote);
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
  const hdClearRef = useRef<(key: string, mark?: HDClearMark | null) => Promise<void>>(async () => {});
  /** Хүлээгдэж буй алсын цэвэрлэлт (`hdRunClear`) — товлолт/сэргээлтээс (2026-10-04) */
  const hdRunClearRef = useRef<(key: string) => Promise<boolean>>(async () => true);
  /** Хуудас нуух/хаах/unmount-ын синхрон бичилт (`flushNow`) — 2026-10-04 */
  const hdFlushNowRef = useRef<() => void>(() => {});
  /**
   * ГИБРИД ЛОГИК ЦАГ — харсан бүх агшны (нүдний `at` · tombstone · `t` · `cleared`) MAX
   * (2026-10-04 аудит). Шинэ мета · tombstone · `cleared` · `t` бүгд `hdStamp()`-аар —
   * `Date.now()`-ээр БИШ: цаг нь хоцорсон машины засвар бусдын хуучин нүднээс бага `at`
   * авч нийлүүлэлтэд ялагддаг, tombstone нь хуучин нүдийг хаяж чаддаггүй байв.
   * ⚠️ Түлхүүр солигдоход тэглэхгүй — нэг чиглэлд л өснө (HLC-ийн дүрэм).
   */
  const hdClock = useRef(0);
  const hdStamp = useCallback(() => { const t = hlcNext(hdClock.current); hdClock.current = t; return t; }, []);
  /**
   * Ноорогт харагдсан агшнаар цагийг урагшлуулна.
   * ⚠️ Одооноос 1 хоногоос ЦААШ ирээдүйн агшныг дагахгүй — эвдэрсэн/цаг нь буруу
   *    машины нэг утга бүх клиентийн цагийг мөнхөд «ирээдүй» рүү түлхэнэ.
   */
  const hdSee = useCallback((d: HDDraft | null | undefined) => {
    const m = Math.min(maxStamp(d), Date.now() + 24 * 3600_000);
    if (m > hdClock.current) hdClock.current = m;
  }, []);
  /**
   * ИЛГЭЭХ ЯВЦАД НООРОГ ЗОГСООНО (2026-10-04 аудит, HIGH): `submitPlan`-ийн завсарт 3 с-ийн
   * мөчлөг бусдын нүдийг Map-д нийлүүлж, `hdFlush` бичсээр байв — агуулга нь илгээлтээс
   * ӨМНӨ угсрагдсан тул тэр нүд илгээлтэд ороогүй атлаа цэвэрлэлтээр устдаг байв.
   * `hdSubmitBegin` асааж, `hdSubmitEnd` унтраана; завсарт товлогдсон бичилт дараа нь явна.
   */
  const hdHold = useRef(false);
  const hdHeldAgain = useRef(false);
  /** Цэвэрлэлт бүрд +1 (`hdGen`-ээс ТУСДАА — сэргээлт/түлхүүр солих нь цэвэрлэлт биш, 2026-10-04) */
  const hdClearSeq = useRef(0);
  /** Сүүлийн амжилттай алсын бичилтийн ЛОКАЛ цаг — толгойн «хадгалагдсан HH:MM» */
  const hdLastOkAt = useRef(0);
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
  /*
   * ⚠️ 2026-10-04 аудит: `pending` = засвар ЛОКАЛ хуулбарт байгаа ч алсад ХАРААХАН биш
   *    (товлолт хүлээгдэж эсвэл алсын уншилт удааширч байна). Урьд нь энэ завсарт толгой
   *    өмнөх «хадгалагдсан HH:MM»-ийг харуулсаар байв — уншилт гацвал худал.
   */
  type HdStatus = { st: 'idle' | 'pending' | 'saving' | 'saved' | 'err' | 'big'; at?: number; err?: string };
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
      /* ⚠️ 2026-10-09: танихуун (`des` · № · нэр) — шинэ жаазад зөөхөд (`identityRemap`) */
      m.set(r.oid, { spans: r.spans, ham: sr.ham, aStart: sr.aStart, aEnd: sr.aEnd, hun: sr.hun, mashin: sr.mashin, des: sr.des, no: sr.no, work: sr.work });
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
  /**
   * ЭНЭ ТҮЛХҮҮРИЙН СҮҮЛИЙН ЦЭВЭРЛЭЛТИЙН АГШИН (`cleared`) — харсан утгуудын MAX.
   * ⚠️ 2026-10-01 аудит: `hdApply` үүнийг хадгалдаггүй, `hdLocal` гаргадаггүй тул
   *    илгээх/цуцлах/батлахын ДАРААХ анхны энгийн бичилт алсын мөрөөс `cleared`-ийг
   *    арилгадаг байв (`saveRemoteDraft` мөрийг бүхлээр нь солино). Tombstone-ууд
   *    (`HD_DEL_TTL`, 7 хоног) дууссаны дараа өөр компьютерийн хуучин localStorage
   *    хуулбар (`t < cleared` дүрмээр л хаагддаг) хуучин нүдийг амилуулна.
   *    `hdApply` · `hdClear` · сэргээлт MAX-аар өсгөнө; түлхүүр солигдоход тэглэнэ.
   */
  const hdCleared = useRef(0);
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
  /**
   * Ижил агшны HLC утга (2026-10-04) — «миний» нүдний хугацааны дүрэм (`hdApply`) бичигчийн
   * `at`-тай (HLC) харьцуулна, локал `Date.now()`-тэй БИШ.
   */
  const hdRowsHlc = useRef(0);
  const hdObHlc = useRef(0);
  useEffect(() => { hdRowsAt.current = rows.length ? Date.now() : 0; hdRowsHlc.current = rows.length ? hdStamp() : 0; }, [rows, hdStamp]);
  useEffect(() => { hdObAt.current = obState === 'ok' ? Date.now() : 0; hdObHlc.current = obState === 'ok' ? hdStamp() : 0; }, [obPlan, obRes, obState, hdStamp]);
  /**
   * ХУУЧИРСАН НҮДИЙГ АНХ ХАРСАН ЛОКАЛ ЦАГ (2026-10-04 аудит) — `түлхүүр → {at, t}`.
   * ⚠️ БУСДЫН `bv` зөрсөн нүдийг устгах эсэхийг ӨӨР машины цагаар (`e.at`) биш, ЭНЭ
   *    клиентийн ажиглалтаар шийднэ (`hdApply`): нүд (ижил `at`-тай) манай мөр серверээс
   *    ирэхээс ӨМНӨ аль хэдийн ноорогт байсан бол бичигчийн суурь манайхаас гарцаагүй хуучин.
   */
  const hdSeen = useRef(new Map<string, { at: number; t: number }>());
  /**
   * ЦЭВЭРЛЭЛТИЙН ДАРААХ ХООСОН Map-ыг ХҮЛЭЭНЭ (2026-10-04): `hdClear` дуудагдах агшинд эцэг
   * Map-уудыг хоосолсон ч зурагдаагүй — `hdMapsRef` хуучин нүдтэй. Энэ хооронд дифф
   * (`hdDiff`) тэдгээрийг «шинэ, миний» гэж амилуулахгүй; хоосон Map ирмэгц суурь болно.
   */
  const hdExpectEmpty = useRef(false);
  /** Түгжигдэх агшинд алсад очоогүй засвар үлдсэн — бичих боломж эргэж ирэхэд товлоно (2026-10-04) */
  const hdOwed = useRef(false);
  /** Сэргээлтэд уншсан локал хуулбарын дээд агшин (`hdWriteLocal`-ийн ⚠️, 2026-10-04) */
  const hdLocalSeen = useRef(0);
  /** «Ноорог хэт том» мэдэгдлийг нэг удаа л (2026-10-08) */
  const hdBigNoted = useRef(false);
  /**
   * ⚠️ 2026-10-09: ЖААЗ СОЛИГДОХОД НООРОГ АЛДАГДАХГҮЙ (хэрэглэгч: «шинэ жааз ирэхэд ноорог алга болж байна»).
   *    · `hdRk` — сүүлд нийлүүлсэн ноорогийн мөрийн танихуун (`HDDraft.rk`): энэ клиентийн мөрөнд
   *      ОЛДОХГҮЙ (хуучирсан) нүдний танихууныг дараагийн бичилтэд АЛДАХГҮЙ дамжуулна.
   *    · `hdLostRef` — сүүлийн нийлүүлэлтэд (`hdApply`) танихуунаар ч зөөгдөөгүй мөрүүд (сэргээлтийн мэдэгдэлд).
   *    · `hdRemapHold` — `rows` шинэ жааз болж Map-уудыг шинэ oid руу зөөх зуур (дараагийн зурагдалт хүртэл)
   *      дифф ХИЙХГҮЙ: эс бөгөөс хуучин түлхүүртэй Map шинэ суурьтай тулгагдаж бүх нүд tombstone авдаг байв.
   *    · `hdOrphan` — зөөгдөөгүй мөрийн oid → «№ нэр» (эцгийн «өнчин ноорог» мэдэгдэлд нэрээр).
   */
  const hdRk = useRef(new Map<number, HDRowKey>());
  const hdLostRef = useRef<{ lost: string[]; unknown: number; moved: number }>({ lost: [], unknown: 0, moved: 0 });
  const hdRemapHold = useRef<{ draft: Draft } | null>(null);
  const hdRowsPrev = useRef<{ key: string; rows: SheetRow[] }>({ key: '', rows: [] });
  const [hdOrphan, setHdOrphan] = useState<Map<number, string>>(() => new Map());
  const draggingRef = useLatest(dragging);
  const statusRef = useLatest(status);
  /** Хүлээгдэж буй цэвэрлэлтийн дахин оролдлого (2026-10-04)
   * ⚠️ 2026-10-04 (шүүлт): ТҮЛХҮҮР ТУС БҮРТ (Map) — урьд нь ганц таймер/тоолуур хуваалцдаг тул
   *    B багцын цэвэрлэлт A багцын хүлээгдэж буй дахин оролдлогыг цуцалж, тоолуурыг тэглэдэг байв. */
  const hdClearTimer = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const hdClearTries = useRef(new Map<string, number>());
  const hdClearBusy = useRef(false);
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
    /* ⚠️ 2026-10-04: бичилт хүлээгдэж байна — «хадгалагдсан» гэж харуулахгүй (алдаа/хэт том хэвээр) */
    setHdSt((s) => (s.st === 'err' || s.st === 'big' || s.st === 'pending' || s.st === 'saving' ? s : { st: 'pending' }));
  }, []);
  /** Бичих зүйлгүй (алсынхтай ижил) — «хадгалагдсан» төлөвт буцаана */
  const hdMarkSynced = useCallback(() => {
    setHdSt((s) => (s.st === 'saved' || s.st === 'idle' ? s
      : hdLastOkAt.current ? { st: 'saved', at: hdLastOkAt.current } : { st: 'idle' }));
  }, []);

  /**
   * ЛОКАЛ ХУУЛБАР — НИЙЛҮҮЛЖ бичнэ (2026-10-04 аудит). Ижил багцыг хоёр табад нээхэд нэг
   * түлхүүрийг ээлжлэн ДАРЖ бичиж, нэг табын засвар энэ компьютерийн хуулбараас алга
   * болдог байв. Одоо байгаа хуулбартай `merge` (нүд бүрээр шинэ нь ялна, tombstone
   * хүчинтэй) → `mark` өгвөл хэсэгчилсэн цэвэрлэлтийг давхар хэрэглэнэ.
   * ⚠️ Синхрон — `pagehide`/unmount/«Ноорог хаях»-д шууд дуудагдана.
   * ⚠️ Хуучин хуулбараас зөвхөн СЭРГЭЭЛТЭЭС ХОЙШ бичигдсэн нүд (`at > hdLocalSeen` — нөгөө
   *    таб) нийлнэ: түүнээс өмнөх нь сэргээлтээр санах ойд аль хэдийн орсон тул энэ таб
   *    хассан бол (tombstone-ийн 7 хоног дууссан ч) хуулбараас дахин амилахгүй.
   */
  const hdWriteLocal = useCallback((key: string, d: HDDraft, mark?: HDClearMark | null) => {
    try {
      let prev = hdParse(localStorage.getItem(hdLocalKey(key)));
      if (prev && key === hdKeyRef.current && hdLocalSeen.current) {
        const ent: HDEntries = new Map();
        for (const [k, e] of prev.entries) if (e.at > hdLocalSeen.current) ent.set(k, e);
        prev = { ...prev, entries: ent };
      }
      let m = hdMerge(d, prev) ?? d;
      if (mark) m = applyClear(m, mark.keys, mark.ts);
      localStorage.setItem(hdLocalKey(key), hdSerialize(m));
    } catch { /* хаалттай орчин */ }
  }, [hdKeyRef]);
  /* Хүлээгдэж буй цэвэрлэлтийн тэмдэг (`HDClearMark`) — localStorage */
  const hdReadMark = useCallback((key: string): HDClearMark | null => {
    try { return parseMark(localStorage.getItem(hdClearMarkKey(key))); } catch { return null; }
  }, []);
  const hdPutMark = useCallback((key: string, m: HDClearMark | null) => {
    try {
      if (m) localStorage.setItem(hdClearMarkKey(key), serializeMark(m));
      else localStorage.removeItem(hdClearMarkKey(key));
    } catch { /* хаалттай орчин */ }
  }, []);
  /**
   * Алсад бичигдсэн ноорог тэмдгийг бүрэн агуулсан бол тэмдгийг арилгана.
   * ⚠️ Өмнө эхэлсэн бичилт явж байвал (`hdBusy`) ҮЛДЭЭНЭ — тэр бууж ирээд цэвэрлэлтийг
   *    дарж болох тул дахин цэвэрлэлт (`hdClearSeq`-ийн шалгалт) тэмдгийг шаардана.
   */
  const hdSettleMark = useCallback((key: string, written: HDDraft, self = false) => {
    const mk = hdReadMark(key);
    if (mk && (self || !hdBusy.current) && coversMark(written, mk)) { hdPutMark(key, null); hdClearTries.current.delete(key); }
  }, [hdReadMark, hdPutMark]);

  /**
   * ЗӨӨЛӨН МЭДЭГДЭЛ (2026-10-08) — энэ hook-ийн мэдэгдлүүд 2 секундээс ЗАЛУУ мэдэгдлийг дарахгүй
   * (хойшилно). Хамтрагчийн нүд дарсан тухай («N нүд…») мэдэгдлийг дифф бүрд биш, богино хойшлолын
   * дараа НЭГ удаа нэгтгэж бичнэ (`hdDiff`-ийн ⚠️). ⚠️ Зөвхөн ЭНЭ hook-ийн тавьсан мэдэгдлийн агшныг
   * мэднэ — эцгийн мэдэгдлийг хамгаалах нь эцгийн асуудал.
   */
  const hdNoteAt = useRef(0);
  const hdSoftNote = useCallback((msg: string) => {
    const wait = 2000 - (Date.now() - hdNoteAt.current);
    if (wait > 0) { setTimeout(() => { hdNoteAt.current = Date.now(); setNote(msg); }, wait); return; }
    hdNoteAt.current = Date.now();
    setNote(msg);
  }, [setNote]);
  const hdOverAgg = useRef<{ n: number; users: Set<string> }>({ n: 0, users: new Set() });
  const hdOverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hdOverFlush = useCallback(() => {
    if (hdOverTimer.current) return;
    hdOverTimer.current = setTimeout(() => {
      hdOverTimer.current = null;
      const { n, users } = hdOverAgg.current;
      hdOverAgg.current = { n: 0, users: new Set() };
      if (!n) return;
      hdSoftNote(n === 1
        ? tr('{0} энэ мөрийг саяхан өөрчилсөн — таны утга дарлаа', [...users].join(', '))
        : tr('{0} нүд: {1} саяхан өөрчилсөн — таны утга дарлаа', num(n), [...users].join(', ')));
    }, 300);
  }, [hdSoftNote]);
  useEffect(() => () => { if (hdOverTimer.current) clearTimeout(hdOverTimer.current); }, []);

  /**
   * ДИФФ — Map-уудыг (`hdMapsRef` — commit-ийн ХАМГИЙН СҮҮЛИЙН утга) `hdPrev`-тэй тулгаж
   * мета · tombstone хөтөлнө; өөрчлөлт байсан эсэхийг буцаана (2026-10-04 аудит).
   * ⚠️ ЯАГААД ТУСДАА: урьд нь зөвхөн идэвхгүй (`useEffect`) эффект хийдэг байсан тул
   *    `hdLocal` (мөчлөг · flush) `hdPrev`-ийг уншихад сүүлийн чирэлтийн алхам ороогүй
   *    байж болох ба нийлүүлсэн үр дүн (`hdApply`) тэр алхмыг Map-аас буцааж арилгадаг
   *    байв. Одоо `hdLocal` бүр эхлээд үүнийг дуудна.
   * ⚠️ Бичих боломжгүй/суурь шинэчлэгдэж байгаа үед ЮУ Ч ХИЙХГҮЙ — эффект суурийг тавина.
   */
  const hdDiff = useCallback((): boolean => {
    if (hdReady.current !== hdKeyRef.current || obStateRef.current === 'loading') return false;
    if (!hdWritableRef.current || !hdPrevW.current || hdExpectEmpty.current) return false;
    /* ⚠️ 2026-10-09: жааз солигдож Map-ууд шинэ oid руу зөөгдөж байна (`hdRemapHold`-ийн ⚠️) */
    if (hdRemapHold.current) return false;
    const cur = mapsToCells(hdMapsRef.current, hdCtxRef.current);
    const prev = hdPrev.current;
    let changed = false;
    let now = 0;
    const stamp = () => (now || (now = hdStamp()));
    /* ⚠️ 2026-10-08: ХАМТРАГЧИЙН САЯХНЫ НҮДИЙГ ДАРСАН бол ил хэлнэ (зохиомж хэвээр — нүд бүрээр
       шинэ `at` ялна; цонх нээлттэй байхад нийлсэн нүдийг «Тавих» чимээгүй дардаг байв).
       ⚠️ 2026-10-08 (нэгтгэл): нүд бүрд БИШ — урт гинжээр (уялдаа · бүлгийн шилжилт) нэг чирэлт олон
       арван нүд дарахад дифф бүр шинэ мэдэгдэл бичиж, бусад мэдэгдлийг (сэргээлт · алдаа) дардаг байв.
       Одоо нүд ба хүнийг `hdOverAgg`-д хуримтлуулж, богино хойшлолын дараа НЭГ мэдэгдэл («N нүд»). */
    for (const [k, c] of cur) {
      const p = prev.get(k);
      if (!p || !sameVal(p.val, c.val)) {
        const old = hdMeta.current.get(k);
        if (old?.user && old.user !== meRef.current && stamp() - old.at < HD_RECENT) {
          hdOverAgg.current.n += 1;
          hdOverAgg.current.users.add(old.user);
        }
        hdMeta.current.set(k, { at: stamp(), user: meRef.current });
        hdDel.current.delete(k);
        changed = true;
      }
    }
    for (const k of prev.keys()) {
      if (!cur.has(k)) { hdMeta.current.delete(k); hdDel.current.set(k, stamp()); changed = true; }
    }
    hdPrev.current = cur;
    if (hdOverAgg.current.n) hdOverFlush();
    return changed;
  }, [hdStamp, hdKeyRef, obStateRef, hdWritableRef, hdMapsRef, hdCtxRef, meRef, hdOverFlush]);
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
    /* ⚠️ 2026-10-04: эхлээд ОДООГИЙН Map-аар дифф (`hdDiff`-ийн ⚠️). Өөрчлөлт гарсан ч
       товлолт байхгүй бол (мөчлөг/askSwitch-аас) бичилт товлоно — flush дотор бол өөрөө бичнэ. */
    if (hdDiff() && !hdBusy.current && !hdTimer.current) hdSchedule(1500);
    const now = hdStamp();
    const entries: HDEntries = new Map();
    /* Хуучирсан нүд — эх мета-тайгаа; доорх `hdPrev` ижил түлхүүрт дарна */
    for (const [k, e] of hdStale.current) entries.set(k, { val: e.val, bv: e.bv, at: e.at, user: e.user });
    for (const [k, c] of hdPrev.current) {
      let m = hdMeta.current.get(k);
      if (!m) { m = { at: now, user: meRef.current }; hdMeta.current.set(k, m); }
      entries.set(k, { val: c.val, bv: c.bv, at: m.at, user: m.user });
    }
    /* ⚠️ 2026-10-09: мөрийн танихуун — одоогийн мөрөөс, олдохгүй (хуучирсан) бол өмнө нийлүүлсэн ноорогийнхоор */
    const rk = new Map<number, HDRowKey>();
    const ctxRows = hdCtxRef.current.rows;
    for (const k of entries.keys()) {
      const p = parseKey(k);
      if (!p || p.type === 'm' || p.type === 'n' || rk.has(p.oid)) continue;
      const r = ctxRows.get(p.oid);
      const id = r ? { des: r.des ?? null, no: r.no ?? '', work: r.work ?? '' } : hdRk.current.get(p.oid);
      if (id) rk.set(p.oid, id);
    }
    return {
      t: now, kind: kindRef.current, pkg: pkgKeyRef.current, by: { user: meRef.current, at: now },
      entries, del: new Map(hdDel.current), base: { at: hdBaseAt.current, n: hdCtxRef.current.n },
      /* ⚠️ 2026-10-01: `cleared`-ийг ҮРГЭЛЖ дамжуулна (`hdCleared`-ийн ⚠️) — `sig`-д
         ордоггүй тул нэмэлт бичилт үүсгэхгүй, зөвхөн дараагийн бичилтэд үлдэнэ. */
      ...(hdCleared.current ? { cleared: hdCleared.current } : {}),
      ...(rk.size ? { rk } : {}),
    };
  }, [hdCtxRef, kindRef, meRef, pkgKeyRef, hdDiff, hdSchedule, hdStamp]);

  /**
   * Нооргийг 5 Map болгож state-д тавина; мета · tombstone · дифф-суурийг
   * ЗЭРЭГ шинэчилнэ — дараагийн дифф «өөрчлөлтгүй» гэж үзнэ.
   * ⚠️ Tombstone ЗӨВХӨН «серверийнхтэй ижил болсон» нүдэнд (2026-09-24).
   *    ХУУЧИРСАН (`staleKeys`) нүдэнд ТАВИХГҮЙ: хуучин суурьтай клиент бусдын
   *    хүчинтэй нүдийг бүгдэд нь устгадаг байв. Хуучирсан нүд зөвхөн энд
   *    орохгүй — алсад хэвээр, мөрөө шинэчилсэн клиент шийднэ.
   */
  const hdApply = useCallback((d0: HDDraft): HDApply => {
    hdSee(d0);
    /*
     * ⚠️ 2026-10-09: ШИНЭ ЖААЗ РУУ ЗӨӨНӨ (`identityRemap`) — нүдний oid энэ клиентийн мөрөнд байхгүй бол
     *    танихуунаар (код → № + нэр) одоогийн мөр рүү. Урьд нь «мөр алга» нүд хуучирсан гэж хасагдаж,
     *    МИНИЙ нүд 10 мин-ийн дараа tombstone авч ноорог ор мөргүй устдаг байв. Зөөгдсөн МИНИЙ хуучин
     *    түлхүүр tombstone авна (давхардахгүй); БУСДЫН хуучин түлхүүр ҮЛДЭНЭ — хуучин жаазтай хамтрагчид
     *    хүчинтэй (2026-09-25-ны дүрэм, `remapDraft`-ийн `keep`). Мөр ачаалагдаагүй үед зөөхгүй.
     */
    let d = d0;
    const ctx0 = hdCtxRef.current;
    let movedN = 0;
    if (ctx0.rows.size) {
      const im = identityRemap(d0, ctx0);
      hdLostRef.current = { lost: im.lost, unknown: im.unknown, moved: im.map.size };
      if (im.map.size) {
        d = hdRemapDraft(d0, im.map, hdStamp(), (_k, e) => e.user !== meRef.current);
        /* ⚠️ Зөвхөн ШИНЭЭР үүссэн түлхүүр/tombstone тоологдоно — үлдээсэн хамтрагчийн хуучин нүд нийлүүлэлт
           бүрд дахин зураглагдах тул бүгдийг тоолбол 1.5 с тутам бичилт товлогдох тойрог үүснэ. */
        const newRows = new Set<number>();
        for (const k of d.entries.keys()) {
          if (d0.entries.has(k)) continue;
          movedN += 1;
          const p = parseKey(k);
          if (p && p.type !== 'm' && p.type !== 'n') newRows.add(p.oid);
        }
        for (const k of d.del.keys()) if (!d0.del.has(k)) movedN += 1;
        /* Мэдэгдэлд — ШИНЭЭР зөөгдсөн мөр л (урьд зөөгдсөн хуулбар дахин тоологдохгүй) */
        hdLostRef.current = { ...hdLostRef.current, moved: newRows.size };
      }
    }
    hdRk.current = new Map(d.rk ?? []);
    const ap = cellsToMaps(d.entries, hdCtxRef.current);
    /* ⚠️ 2026-10-04: HLC — харсан бүх нүднээс ХОЖУУ tombstone (`hdStamp`-ийн ⚠️) */
    const now = hdStamp();
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
    /*
     * ⚠️ 2026-10-04 аудит — ӨӨР МАШИНЫ ЦАГААС ХАМААРАХГҮЙ: урьд нь бүх нүдийг бичигчийн
     *    `e.at`-ыг ЭНЭ клиентийн `Date.now()`-тэй (мөр ирсэн агшин) харьцуулдаг тул цаг нь
     *    10+ мин хоцорсон хамтрагчийн ШИНЭ суурьтай хүчинтэй нүд устдаг байв.
     *      · МИНИЙ нүд (а) — бичигч нь би (ихэвчлэн энэ машин); `at` нь HLC тул мөр ирсэн
     *        агшны HLC утгатай (`hdRowsHlc`) `MARGIN`-тай харьцуулна (урьдын дүрэм).
     *      · БУСДЫН `bv` зөрсөн нүд (б) — ЛОКАЛ ажиглалтаар: ижил `at`-тай нүдийг манай мөр
     *        серверээс ирэхээс ӨМНӨ харсан (`hdSeen`) бол бичигчийн суурь манайхаас хуучин
     *        → tombstone. Анх харж байгаа бол (сэргээлт) ХЭВЭЭР — мөр дахин ачаалагдахад
     *        (`refetchServer` · хуудас шинэчлэх) шийдэгдэнэ; эзэн нь (а)-аар ч цэвэрлэнэ.
     */
    const bvStale = new Set(ap.bvKeys);
    const MARGIN = 10 * 60_000;
    let tomb = 0;
    const st = new Map<string, HDEntry>();
    const seen = new Map<string, { at: number; t: number }>();
    const tNow = Date.now();
    for (const k of stale) {
      const e = d.entries.get(k);
      if (!e) continue;
      const ob = k[0] === 'm' || k[0] === 'n';
      const fresh = ob ? hdObAt.current : hdRowsAt.current;
      const freshHlc = ob ? hdObHlc.current : hdRowsHlc.current;
      const s0 = hdSeen.current.get(k);
      const s = s0 && s0.at === e.at ? s0 : { at: e.at, t: tNow };
      let kill = false;
      if (hdWritableRef.current && fresh > 0) {
        if (e.user === meRef.current) kill = freshHlc > 0 && e.at < freshHlc - MARGIN;
        else if (bvStale.has(k)) kill = s.t < fresh;
      }
      if (kill) { del.set(k, now); tomb += 1; continue; }
      seen.set(k, s);
      st.set(k, e);
    }
    /* ⚠️ 2026-10-08: ХАМТРАГЧ МИНИЙ САЯХНЫ НҮДИЙГ ХОЖУУ УТГААР ДАРСАН бол ил хэлнэ (нийлүүлэлтийн
       дүрэм хэвээр — `merge`: нүд бүрээр ШИНЭ `at` ялна). Сэргээлтэд мета хоосон тул дуугарахгүй. */
    const lost = new Set<string>();
    for (const [k, e] of d.entries) {
      if (dropped.has(k)) continue;
      const old = hdMeta.current.get(k);
      if (!old || old.user !== meRef.current || e.user === meRef.current || e.at <= old.at) continue;
      if (sameVal(hdPrev.current.get(k)?.val, e.val)) continue;
      lost.add(e.user);
    }
    /* ⚠️ 2026-10-08: зөөлөн мэдэгдэл (`hdSoftNote`) — залуу мэдэгдлийг дарахгүй */
    if (lost.size) hdSoftNote(tr('{0} таны саяхан зассан нүдийг хожуу утгаараа дарлаа', [...lost].join(', ')));
    /* ⚠️ 2026-10-09: хамтрагчийн өөрчилсөн нүд (утга нь сүүлийн нийлүүлэлтийн суурьтай зөрсөн) — эцгийн
       буцаалтын агшинд (`onRemote`-ийн ⚠️). Сэргээлтэд (`hdPrev` хоосон) бүгд «өөрчлөгдсөн» — тэр үед агшин алга. */
    {
      const remote = new Set<string>();
      for (const [k, e] of d.entries) {
        if (dropped.has(k) || e.user === meRef.current) continue;
        if (!sameVal(hdPrev.current.get(k)?.val, e.val)) remote.add(k);
      }
      /* ⚠️ 2026-10-09: ХАМТРАГЧИЙН БУЦААЛТ (tombstone) ч мөн — `hdPrev`-д байсан нүд шинэ `d.del`-ээр арилсан бол
         (миний өөрийн tombstone биш) агшинд хамаарна; урьд нь зөвхөн `entries`-ийг үздэг тул хамтрагч нүдийг
         буцаасны дараа Ctrl+Z тэр нүдийг хуучин утгаар нь амилуулдаг байв. Мета-д «бусдын» (`by.user`, эсвэл
         ерөнхий нэр) хэвээр үлдээнэ — `hdOtherRef`/`useDragPlan.rollback` түүнийг хөндөхгүй. Tombstone хэвээр
         байх хооронд дараагийн нийлүүлэлтэд ч мета үлдэнэ. */
      const delBy = d.by.user && d.by.user !== meRef.current ? d.by.user : tr('хамтрагч');
      for (const [k, t] of d.del) {
        if (d.entries.has(k)) continue;
        const old = hdMeta.current.get(k);
        if (hdPrev.current.has(k)) {
          if (t === hdDel.current.get(k)) continue;
          remote.add(k);
          meta.set(k, { at: t, user: delBy });
        } else if (old && old.user !== meRef.current && old.at === t) meta.set(k, old);
      }
      if (remote.size) onRemoteRef.current?.(remote);
    }
    hdSeen.current = seen;
    hdMeta.current = meta;
    hdDel.current = del;
    hdStale.current = st;
    /* ⚠️ 2026-10-01: алсын `cleared` алдагдахгүй — `hdCleared`-ийн ⚠️ */
    hdCleared.current = Math.max(hdCleared.current, d.cleared ?? 0);
    hdPrev.current = mapsToCells(ap.maps, hdCtxRef.current);
    /* ⚠️ 2026-10-04 (шүүлт): Map · `hdPrev` ИЖИЛ суурьтай болсон тул хоосролтын хүлээлт дуусна.
       Урьд нь «Ноорог хаях»-ын дараа мөчлөг/flush хамтрагчийн нүдийг нийлүүлбэл Map хэзээ ч
       хоосрохгүй → `hdExpectEmpty` мөнхөд true → дараагийн засвар огт диффлэгдэхгүй, хадгалагдахгүй,
       төлөв «хадгалагдсан» хэвээр, гарах анхааруулга чимээгүй байв. */
    hdExpectEmpty.current = false;
    setDraft(ap.maps.draft); setHam(ap.maps.ham); setADraft(ap.maps.aDraft);
    setResDraft(ap.maps.resDraft); setObDraft(ap.maps.obDraft); setObResDraft(ap.maps.obRes);
    setHdUsers(hdUsersOf(d).filter((u) => u !== meRef.current));
    /* Устгасан хуучирсан нүдийг алсад хүргэнэ — дуудагчийн товлолтоос үл хамааран */
    /* ⚠️ 2026-10-09: шинэ жаазад зөөгдсөн нүд (`movedN`) ч — шинэ түлхүүр · хуучны tombstone алсад хүрнэ */
    if (tomb || movedN) hdSchedule(1500);
    return ap;
  }, [hdSchedule, hdSee, hdStamp, hdCtxRef, hdWritableRef, meRef, setADraft, setDraft, setHam, setObDraft, setObResDraft, setResDraft, hdSoftNote, onRemoteRef]);

  /**
   * ЦЭВЭРЛЭХ НҮДНИЙ ТЭМДЭГ (2026-10-04 аудит) — одоо Map-д (дэлгэц дээр) байгаа нүд бүрт
   * `at + 1` (зөвхөн ЭНЭ хувилбарыг хаана; хамтрагчийн дараа нь бичсэн ШИНЭ хувилбар ялна —
   * цагийн зөрүүнээс үл хамааран), `ts` = HLC. Илгээхэд `buildPayload`-тай ИЖИЛ агшинд
   * (`hdSubmitBegin`) авна — илгээлтэд ОРСОН нүд л цэвэрлэгдэнэ.
   */
  const hdSnapshot = useCallback((): HDClearMark => {
    const local = hdLocal();
    const cur = mapsToCells(hdMapsRef.current, hdCtxRef.current);
    const ts = hdStamp();
    const keys = new Map<string, number>();
    for (const k of cur.keys()) {
      const e = local.entries.get(k);
      keys.set(k, e ? Math.min(ts, e.at + 1) : ts);
    }
    return { ts, keys };
  }, [hdLocal, hdMapsRef, hdCtxRef, hdStamp]);

  /** Хүлээгдэж буй цэвэрлэлтийн дахин оролдлого — 5 с → 60 с, 8 удаа; дараа нь сэргээлт (нээх · түгжээ тайлагдах) */
  const hdClearRetry = useCallback((key: string) => {
    const t0 = hdClearTimer.current.get(key);
    if (t0) { clearTimeout(t0); hdClearTimer.current.delete(key); }
    const n = hdClearTries.current.get(key) ?? 0;
    if (n >= 8) return;
    const ms = Math.min(60_000, 5000 * 2 ** n);
    hdClearTries.current.set(key, n + 1);
    hdClearTimer.current.set(key, setTimeout(() => { hdClearTimer.current.delete(key); void hdRunClearRef.current(key); }, ms));
  }, []);

  /**
   * ХҮЛЭЭГДЭЖ БУЙ ЦЭВЭРЛЭЛТИЙГ АЛСАД ХҮРГЭНЭ (2026-10-04 аудит, HIGH) — READ-MERGE-WRITE,
   * `expectAt`-тай; зөрчилд 3 хүртэл дахин уншина.
   * ⚠️ Урьд нь хоосон ноорог + бүх нүдний tombstone-ыг уншилтгүй (blind) бичдэг байсан тул
   *    илгээлтэд ОРООГҮЙ хамтрагчийн нүд (сүүлийн 3 с, эсвэл илгээх завсарт) устдаг байв.
   *    Одоо алсыг уншиж, ЗӨВХӨН тэмдгийн нүдэнд tombstone тавиад (`applyClear`) бичнэ.
   * ⚠️ Унавал тэмдэг localStorage-д ҮЛДЭНЭ (`hdClearRetry`; сэргээлт эхлээд үүнийг дуудна) —
   *    урьд нь унасан цэвэрлэлт ДАХИН оролдогддоггүй тул буцаагдахад хуучин ноорог сэргэж,
   *    буцаагдсан саналын автомат буулгалтыг (`dirtyN > 0`) хаадаг байв.
   * ⚠️ `hdLastSeenAt`-ыг ХӨДӨЛГӨХГҮЙ: бичсэн мөрөнд Map-д ороогүй бусдын нүд байж болно —
   *    дараагийн мөчлөг/flush `at` зөрснийг хараад уншиж нийлүүлнэ.
   */
  const hdRunClear = useCallback(async (key: string): Promise<boolean> => {
    if (!hdReadMark(key)) return true;
    if (statusRef.current === 'off' || !canEditRef.current) return false;
    if (hdClearBusy.current) { hdClearRetry(key); return false; }
    hdClearBusy.current = true;
    const cur = () => key === hdKeyRef.current;
    let err = '';
    try {
      for (let i = 0; i < 3; i += 1) {
        const mk = hdReadMark(key);
        if (!mk) return true;
        const rr = await readRemoteDraft(key);
        if (!rr.ok) { err = rr.error; break; }
        const remote = rr.draft ? hdParse(rr.draft.payload) : null;
        hdSee(remote);
        /* Энэ түлхүүр нээлттэй, сэргээгдсэн бол цэвэрлэлтээс хойшхи өөрийн засвар (tombstone) ч хамт */
        const mine = cur() && hdReady.current === key ? hdLocal() : null;
        const t = hdStamp();
        const base0: HDDraft = hdMerge(remote, mine) ?? {
          t, kind: kindRef.current, pkg: pkgKeyRef.current, by: { user: meRef.current, at: t },
          entries: new Map(), del: new Map(), base: { at: hdBaseAt.current, n: hdCtxRef.current.n },
        };
        const d: HDDraft = { ...applyClear(base0, mk.keys, mk.ts), t, by: { user: meRef.current, at: t } };
        /* ⚠️ 2026-10-09: `REMOTE_MAX` — танихуун хэмжээг хэтрүүлбэл хасагдана (`serialize`-ийн ⚠️) */
        const body = hdSerialize(d, REMOTE_MAX);
        if (body.length > REMOTE_MAX) {
          err = tr('ноорог хэт том ({0} тэмдэгт, дээд {1})', String(body.length), String(REMOTE_MAX));
          break;
        }
        const r = await saveRemoteDraft(key, t, body, { expectAt: rr.draft?.at ?? null });
        if (r.ok) {
          hdSettleMark(key, d);
          if (cur()) {
            hdLastOkAt.current = Date.now();
            setHdSt((s) => (s.st === 'saving' || s.st === 'err' ? { st: 'saved', at: hdLastOkAt.current } : s));
          }
          /* Завсарт ШИНЭ тэмдэг нэмэгдсэн (жиш: илгээгээд шууд хаясан) бол дахин тойрно */
          const left = hdReadMark(key);
          if (!left || hdBusy.current || coversMark(d, left)) return true;
          continue;
        }
        if (!r.conflict) { err = r.error; break; }
      }
      if (!err) err = tr('хооронд нь өөр хүн ноорог бичсэн — дахин уншиж нийлүүлнэ');
      if (cur()) setHdSt({ st: 'err', err: tr('алсын ноорог цэвэрлэгдсэнгүй — {0}', err) });
      hdClearRetry(key);
      return false;
    } finally {
      hdClearBusy.current = false;
    }
  }, [hdReadMark, hdSettleMark, hdClearRetry, hdSee, hdLocal, hdStamp, statusRef, canEditRef, hdKeyRef, kindRef, pkgKeyRef, meRef, hdCtxRef]);

  /**
   * ЦЭВЭРЛЭЛТ — илгээсэн · «Ноорог хаях». Мөрийг УСТГАХГҮЙ (2026-09-24).
   * ⚠️ `clearRemoteDraft`-аар устгавал tombstone ч устаж, өөр төхөөрөмжийн
   *    localStorage хуулбар илгээгдсэн нооргийг дахин амилуулдаг байв.
   * ⚠️ 2026-10-04 аудит — ХЭСЭГЧИЛСЭН: зөвхөн `mark`-ийн нүд (илгээлтэд орсон / дэлгэц дээр
   *    байсан, `hdSnapshot`); бусдын шинэ нүд, хуучирсан (`hdStale`) нүд хэвээр. Дараалал:
   *    (1) санах ойн мета/суурь, (2) ЛОКАЛ хуулбар СИНХРОН — «Ноорог хаях»-ын дараа шууд F5
   *    дарахад хаясан ноорог амилдаг байв (tombstone 300 мс-ийн дараа л бичигддэг байсан),
   *    (3) тэмдэг localStorage-д, (4) алс read-merge-write (`hdRunClear`), унавал дахин.
   *    `cleared` ЗӨВХӨН энд тавигдана (энгийн хоосролт `hdFlush`-ээр, тамгагүй).
   * ⚠️ Дуудагч Map-уудыг ЗААВАЛ хоосолно (`hdExpectEmpty`).
   */
  const hdClear = useCallback(async (key: string, mark0?: HDClearMark | null) => {
    if (hdTimer.current) { clearTimeout(hdTimer.current); hdTimer.current = null; }
    const isCur = key === hdKeyRef.current;
    const mark = mark0 ?? (isCur ? hdSnapshot() : null);
    if (!mark) return;
    hdGen.current += 1;
    hdClearSeq.current += 1;
    /* Илгээх явцад зогсоосон бичилт цэвэрлэлтэд шингэсэн — дахин товлохгүй (түгжээнд «хүлээгдэж буй» шошго гацахгүй) */
    hdHeldAgain.current = false;
    if (isCur) {
      const del = new Map(hdDel.current);
      for (const [k, a] of mark.keys) if ((del.get(k) ?? -1) < a) del.set(k, a);
      hdMeta.current = new Map(); hdDel.current = del; hdPrev.current = new Map();
      /* ⚠️ 2026-10-06: ЗӨВХӨН сэргээгдсэн (`hdReady === key`) үед — сэргээлт явж байхад хаявал диффийн
         эффект эрт буцаж (`hdReady !== key`), хоосон ноорогт `hdApply` ч дуудагдахгүй тул туг мөнхөд
         true үлдэж, дараагийн бүх засвар диффлэгдэхгүй/хадгалагдахгүй, шошго «хадгалагдсан» байв. */
      hdExpectEmpty.current = hdReady.current === key;
      hdCleared.current = Math.max(hdCleared.current, mark.ts);
      hdLastSig.current = '';
      hdWriteLocal(key, hdLocal(), mark);
      setHdUsers([]);
    } else {
      try {
        const prev = hdParse(localStorage.getItem(hdLocalKey(key)));
        if (prev) hdWriteLocal(key, prev, mark);
      } catch { /* хаалттай орчин */ }
    }
    if (statusRef.current === 'off') { if (isCur) setHdSt({ st: 'idle' }); return; }
    hdPutMark(key, mergeMark(hdReadMark(key), mark));
    hdClearTries.current.delete(key);
    if (isCur) setHdSt({ st: 'saving' });
    await hdRunClear(key);
  }, [hdSnapshot, hdLocal, hdWriteLocal, hdReadMark, hdPutMark, hdRunClear, hdKeyRef, statusRef]);

  /**
   * ИЛГЭЭХИЙН ӨМНӨ (2026-10-04 аудит, HIGH) — мөчлөг · бичилтийг зогсоож (`hdHold`), сүүлийн
   * засварыг локалд СИНХРОН бичиж, илгээлтэд орох нүдний тэмдгийг буцаана. Дуудагч
   * `buildPayload`-тай НЭГ агшинд дуудаж, амжилттай бол `hdClear(key, тэмдэг)`, ямар ч
   * тохиолдолд `hdSubmitEnd()`.
   */
  const hdSubmitBegin = useCallback((): HDClearMark | null => {
    hdHold.current = true;
    if (hdTimer.current) { clearTimeout(hdTimer.current); hdTimer.current = null; hdHeldAgain.current = true; }
    const key = hdKeyRef.current;
    if (hdReady.current !== key) return null;
    const mark = hdSnapshot();
    if (hdWritableRef.current) hdWriteLocal(key, hdLocal());
    return mark;
  }, [hdSnapshot, hdLocal, hdWriteLocal, hdKeyRef, hdWritableRef]);
  const hdSubmitEnd = useCallback(() => {
    hdHold.current = false;
    if (hdHeldAgain.current) { hdHeldAgain.current = false; hdSchedule(300); }
  }, [hdSchedule]);
  /** «Ноорог хаях» — Map-уудыг хоослохоос ӨМНӨ дуудна (дэлгэц дээрх нүдний тэмдэг) */
  const hdDiscard = useCallback(() => { void hdClear(hdKeyRef.current); }, [hdClear, hdKeyRef]);

  /**
   * Хадгалалтын үндсэн зам — read-merge-write, дараа нь `sig` ижил бол алгасна.
   * ⚠️ Локалыг НИЙЛҮҮЛЭХИЙН ӨМНӨ дахин уншина (2026-09-24): уншилтын завсарт
   *    хийсэн засвар урьд нь `hdApply(merged)`-ээр дэлгэцээс арилж, алсад ч
   *    очдоггүй байв.
   * ⚠️ Хоосорсон ноорог ЭНД бичигдэнэ — алсыг нийлүүлсний ДАРАА: дифф
   *    шууд устгавал сүүлийн 3 с-д бусдын нэмсэн нүд алдагдана.
   * ⚠️ 2026-10-04 аудит: ХООСОН ноорог ЭНГИЙН замаар (tombstone-той) бичигдэнэ — урьд нь
   *    `hdClear` дуудаж `cleared` тамга тавьдаг байсан тул энгийн буцаалт бусад машины
   *    локал хуулбарыг БҮХЭЛД нь хаадаг байв. `cleared` зөвхөн илгээх/«Ноорог хаях»-д.
   */
  const hdFlush = useCallback(async () => {
    if (hdBusy.current) { hdAgain.current = true; return; }
    const key = hdKeyRef.current;
    if (hdReady.current !== key || !hdWritableRef.current) return;
    /* ⚠️ 2026-10-04: илгээх явцад (`hdHold`) бичихгүй — дуусахад дахин товлоно */
    if (hdHold.current) { hdHeldAgain.current = true; return; }
    /* ⚠️ 2026-10-04: чирэлт явж байхад нийлүүлэлт (`hdApply`) Map-ыг дарахгүй — дуусахад */
    if (draggingRef.current) { hdSchedule(800); return; }
    const live = () => key === hdKeyRef.current && hdReady.current === key;
    hdBusy.current = true;
    const cs = hdClearSeq.current;
    try {
      /* ⚠️ 2026-10-04 аудит: ЛОКАЛ ХУУЛБАР ЭХЛЭЭД — алсын уншилт унасан/гацсан ч засвар энэ
         компьютерт үлдэнэ. Урьд нь уншилт амжилттай болсны ДАРАА л бичигддэг байв. */
      hdWriteLocal(key, hdLocal());
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
        /* ⚠️ 2026-10-04 (шүүлт): уншилтын завсарт «Ноорог хаях»/илгээлтийн цэвэрлэлт болсон бол
           цэвэрлэлтээс ӨМНӨХ уншилтыг нийлүүлэхгүй — дахин товлож шинээр уншина. */
        if (cs !== hdClearSeq.current) { hdAgain.current = true; return; }
        const local0 = hdLocal();
        const merged = hdMerge(rr.draft ? hdParse(rr.draft.payload) : null, local0) ?? local0;
        hdApply(merged);
        hdLastSeenAt.current = at0 ?? 0;
      }
      const local = hdLocal();
      const body = hdSerialize(local, REMOTE_MAX);
      const s = hdSig(local);
      /* ⚠️ Локал хуулбар БҮХ оролдлогод — алс унасан ч энэ компьютерт үлдэнэ */
      hdWriteLocal(key, local);
      if (s === hdLastSig.current) { if (!hdTimer.current) hdMarkSynced(); return; }
      /* ⚠️ 2026-10-08: хэт том — толгойн шошгоос гадна НЭГ удаа ил мэдэгдэнэ (багтмагц дахин дуугарч болно);
         `hdUnsynced` ч үүнийг «алсад хүрээгүй» гэж тоолно. */
      if (body.length > REMOTE_MAX) {
        setHdSt({ st: 'big' });
        if (!hdBigNoted.current) {
          hdBigNoted.current = true;
          setNote(tr('Ноорог хэт том ({0} тэмдэгт, дээд {1}) — бусад төхөөрөмжид хуулагдахгүй', num(body.length), num(REMOTE_MAX)));
        }
        return;
      }
      hdBigNoted.current = false;
      setHdSt({ st: 'saving' });
      const gen = hdGen.current;
      /* ⚠️ 2026-09-29 аудит: optimistic lock — дээрх уншилтаас хойш өөр хүн бичсэн бол
         юу ч дарахгүй, дахин уншиж нийлүүлнэ (`conflict`). 2026-10-04: бичсэний дараа
         дарагдсан нь илэрвэл ч (`draftRemote`-ийн баталгаа) мөн `conflict`. */
      const r = await saveRemoteDraft(key, local.t, body, { expectAt: hdLastSeenAt.current });
      /* ⚠️ Бичилт явж байхад ЦЭВЭРЛЭСЭН бол (2026-09-24) энэ бичилт хаясан нүдийг
         амилуулсан байж болно — тэр даруй дахин цэвэрлэнэ. 2026-10-04: зөвхөн цэвэрлэлтийн
         үеэр (`hdClearSeq` — сэргээлт/түлхүүр солих нь цэвэрлэлт БИШ) ба тэмдгээр
         (read-merge-write) — урьд нь бүх нүдийг уншилтгүй tombstone болгодог байв. */
      if ((r.ok || r.written) && cs !== hdClearSeq.current) { void hdRunClearRef.current(key); return; }
      if (!r.ok && r.conflict) { if (live()) hdAgain.current = true; return; }
      if (gen !== hdGen.current || !live()) return;
      if (r.ok) {
        hdLastSig.current = s;
        /* ⚠️ Бичсэн `t`-г тавина — сервер яг тэр утгыг хадгалдаг; завсарт өөр
           хүн бичсэн бол `at0` зөрж дараагийн шалгалтад дахин уншина */
        hdLastSeenAt.current = local.t;
        hdBackoff.current = 3000;
        hdLastOkAt.current = Date.now();
        hdSettleMark(key, local, true);
        setHdSt(hdTimer.current ? { st: 'pending' } : { st: 'saved', at: hdLastOkAt.current });
      } else {
        setHdSt({ st: 'err', err: r.error });
        hdRetry();
      }
    } finally {
      hdBusy.current = false;
      if (hdAgain.current) { hdAgain.current = false; hdSchedule(300); }
    }
  }, [hdLocal, hdApply, hdWriteLocal, hdMarkSynced, hdSettleMark, hdSchedule, hdRetry, hdKeyRef, hdWritableRef, draggingRef, setNote]);
  /* ⚠️ 2026-09-30: commit-ийн дараа (`useLayoutEffect`) — уншигчид нь товлолт (setTimeout) ба
     async урсгал тул зурагдалтын дунд бичсэнтэй ижил утга. */
  useLayoutEffect(() => { hdFlushRef.current = hdFlush; hdClearRef.current = hdClear; hdRunClearRef.current = hdRunClear; });
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
    hdCleared.current = 0;
    /* 2026-10-04: ажиглалт · хоосролтын хүлээлт · түгжээний өр — түлхүүр бүрт шинээр */
    hdSeen.current = new Map(); hdExpectEmpty.current = false; hdOwed.current = false; hdLocalSeen.current = 0;
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
      /* ⚠️ ЭХЛЭЭД React-д ЗАЙ ӨГНӨ (2026-10-01 аудит): алсын уншилт алгасагдах/шууд шийдэгдэх
         үед (`status === 'off'`, auth-гүй) `[kind]`/`[pkg]` эффектийн цэвэрлэгээ зурагдахаас
         ӨМНӨ `hdMapsRef` уншигдаж, ӨМНӨХ төрлийн ноорог шинэ түлхүүрт «би · одоо» болж
         нийлдэг байв — төлөвлөгөөний огноо гэрээний талбарт бичигдэх эрсдэл. */
      await new Promise((r) => setTimeout(r, 0));
      if (!alive) return;
      let remote: HDDraft | null = null;
      let readErr = '';
      let fromLocal = false;
      /*
       * ⚠️ ХҮЛЭЭГДЭЖ БУЙ ЦЭВЭРЛЭЛТ ЭХЛЭЭД (2026-10-04 аудит): илгээсний/хаясны дараах алсын
       *    цэвэрлэлт унасан бол (тэмдэг үлдсэн) нээх · түгжээ тайлагдах үед СЭРГЭЭХЭЭС ӨМНӨ
       *    дахин оролдоно. Унасан ч тэмдгийг доор алсын/локал ноорогт хэрэглэнэ — хуучин
       *    ноорог Map-д орж буцаагдсан саналын автомат буулгалтыг (`dirtyN > 0`) хаахгүй.
       */
      let mk = hdReadMark(key);
      if (mk && status !== 'off' && canEditRef.current) {
        await hdRunClear(key);
        if (!alive) return;
        mk = hdReadMark(key);
      }
      if (status !== 'off') {
        const rr = await readRemoteDraft(key);
        if (!alive) return;
        if (rr.ok) {
          remote = rr.draft ? hdParse(rr.draft.payload) : null;
          if (rr.draft) hdLastSeenAt.current = rr.draft.at;
        } else readErr = rr.error;
      }
      hdSee(remote);
      if (remote && mk) remote = applyClear(remote, mk.keys, mk.ts);
      /* ⚠️ Локал хуулбарыг ҮРГЭЛЖ нийлүүлнэ (2026-09-24) — урьд нь зөвхөн алс
         хоосон үед; алсад ямар нэг ноорог байхад оффлайн засвар алдагддаг байв.
         Цэвэрлэлтээс (`cleared`) хуучин НҮД ҮГҮЙ — 2026-10-04 аудит: НҮД ТУС БҮРЭЭР
         (`dropCleared`); урьд нь `l.t < cleared` бол хуулбарыг БҮХЛЭЭР нь хаяж, цэвэрлэлтээс
         хойш бичсэн нүд ч алга болдог байв. */
      hdCleared.current = Math.max(hdCleared.current, remote?.cleared ?? 0, mk?.ts ?? 0);
      try {
        const l0 = hdParse(localStorage.getItem(hdLocalKey(key)));
        hdSee(l0);
        hdLocalSeen.current = maxStamp(l0);
        const clearedAt = Math.max(remote?.cleared ?? 0, l0?.cleared ?? 0, mk?.ts ?? 0);
        /* ⚠️ 2026-10-01: ноорог хоосон ч (`hdApply` дуудагдахгүй) дараагийн бичилтэд үлдэнэ */
        hdCleared.current = Math.max(hdCleared.current, clearedAt);
        let l = l0 ? dropCleared(l0, clearedAt) : null;
        if (l && mk) l = applyClear(l, mk.keys, mk.ts);
        if (l && !hdIsEmpty(l)) {
          remote = remote ? hdMerge(remote, l) : l;
          fromLocal = true;
        }
      } catch { /* хаалттай орчин */ }
      /* Уншилтын завсарт хийсэн засвар — «би · одоо» гэж нийлнэ */
      const cells = mapsToCells(hdMapsRef.current, hdCtxRef.current);
      const now = hdStamp();
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
      /* ⚠️ 2026-10-06: сэргээлт шинэ суурь — хоосролтын хүлээлт энд дуусна (хоосон ноорогт `hdApply`
         дуудагдахгүй тул туг гацахгүй; `hdClear`-ийн ⚠️) */
      hdExpectEmpty.current = false;
      /* ⚠️ `hdApply`-тай НЭГ багцад (React 18) — автомат буулгалт ноорогтой зурагдалтыг харна */
      setHdReadyKey(key);
      hdPrevW.current = hdWritableRef.current;
      if (readErr && !fromLocal) setHdSt({ st: 'err', err: readErr });
      if (!merged || hdIsEmpty(merged)) return;
      const ap = hdApply(merged);
      const parts: string[] = [];
      if (ap.applied) parts.push(tr('Ноорог сэргээв: {0} мөр', num(ap.rows)));
      /* ⚠️ 2026-10-09: шинэ жаазад зөөгдсөн / олдоогүй мөрийг НЭРЭЭР (`hdLostRef`-ийн ⚠️) */
      {
        const lr = hdLostRef.current;
        if (lr.moved) parts.push(tr('{0} мөрийн ноорог шинэчлэгдсэн хуудасны мөр рүү зөөгдөв', num(lr.moved)));
        if (lr.lost.length) {
          parts.push(tr('{0} мөрийн ноорог одоогийн хуудаснаас олдсонгүй: {1}', num(lr.lost.length),
            lr.lost.slice(0, 5).join('; ') + (lr.lost.length > 5 ? ` (+${num(lr.lost.length - 5)})` : '')));
        }
        if (lr.unknown) parts.push(tr('{0} мөрийн ноорог танигдсангүй (хуучин ноорог)', num(lr.unknown)));
      }
      if (ap.stale) parts.push(tr('{0} мөр хуучирсан тул хасав', num(ap.stale)));
      if (fromLocal && readErr) parts.push(tr('алсын ноорог уншигдсангүй — энэ компьютерийн хуулбар'));
      if (parts.length) setNote(parts.join(' · '));
      /* Локалоос сэргэсэн эсвэл ижил болсон нүд арилгах бол алсыг шинэчилнэ */
      /* ⚠️ Уншилтын завсрын засвар (`localD`, ж: татсан илгээлт) ч алсад очих ёстой */
      /* ⚠️ 2026-10-04: цэвэрлэлтийн тэмдэг хэрэглэгдсэн (алс хоцорсон) бол ч бичнэ — tombstone хүрнэ */
      if ((fromLocal || localD || mk || ap.dropped.length > ap.staleKeys.length) && hdWritableRef.current) hdSchedule(1500);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hdKeyCur, sc, rows.length > 0, obState, flowReady, hdBlocked, hdPending, status]);

  /**
   * МӨРҮҮД ШИНЭ ЖААЗ БОЛОХОД НООРОГИЙГ ЗӨӨНӨ (2026-10-09, хэрэглэгч: «жааз солигдоход ноорог алга болж байна»).
   * ⚠️ ЯАГААД: «Гүйцэтгэл бөглөх» нийтлэл · нэмэлт ажил · «Улсын комисс» бүх oid-ыг солино. `refetchServer`/
   *    хадгалалтын дараа `rows` шинэ жааз болмогц доорх дифф хуучин oid-той Map-ыг шинэ суурьтай тулгаж БҮХ
   *    нүдийг tombstone болгож (алсаас ч устана), Map нь «өнчин ноорог» болж үлддэг байв.
   * ⚠️ Зураглал `savePrep.remapRowsFull` (хадгалахтай НЭГ дүрэм: эцэг бүлгийн зам › № ¦ нэр → код → № + нэр).
   *    Map · дифф суурь (`hdPrev`) · мета · tombstone · ажиглалтыг ЗЭРЭГ зөөж, Map шинэ түлхүүртэй ирэх хүртэл
   *    дифф зогсоно (`hdRemapHold`). Зөөгдөөгүй мөр «өнчин» хэвээр — нэрийг нь эцэгт (`hdOrphan`).
   * ⚠️ Энэ эффект ДИФФ-ЭЭС ӨМНӨ зарлагдах ёстой (нэг commit-д эффект зарласан дарааллаар).
   * ⚠️ Багц солигдоход (`rows` эхлээд `[]`) зөөхгүй — өөр багцын мөр.
   */
  useEffect(() => {
    const prev = hdRowsPrev.current;
    hdRowsPrev.current = { key: pkgKey, rows };
    /* ⚠️ 2026-10-09: багц солигдоход өмнөх багцын «өнчин» нэрс арилна */
    if (prev.key !== pkgKey) { setHdOrphan((o0) => (o0.size ? new Map() : o0)); return; }
    if (!prev.rows.length || !rows.length || prev.rows === rows) return;
    const have = new Set(rows.map((r) => r.oid));
    if (prev.rows.every((r) => have.has(r.oid))) return;
    const { map } = remapRowsFull(prev.rows, rows);
    const cur = hdMapsRef.current;
    const keyOf = (o: number) => map.get(o) ?? o;
    const touched = [cur.draft, cur.ham, cur.aDraft, cur.resDraft].some((m) => [...m.keys()].some((o) => map.has(o) && map.get(o) !== o));
    /* Зөөгдөөгүй ноорогтой мөрийн нэр — «өнчин» мэдэгдэлд */
    const names = new Map<number, string>();
    const prevBy = new Map(prev.rows.map((r) => [r.oid, r]));
    for (const m of [cur.draft, cur.ham, cur.aDraft, cur.resDraft] as ReadonlyMap<number, unknown>[]) {
      for (const o of m.keys()) {
        if (o < 0 || have.has(o) || map.has(o)) continue;
        const r = prevBy.get(o);
        if (r) names.set(o, `${r.no ?? '—'} · ${r.work ?? ''}`);
      }
    }
    setHdOrphan((o0) => (names.size || o0.size ? new Map([...o0, ...names]) : o0));
    if (!touched) return;
    const mv = <V,>(m: ReadonlyMap<number, V>): Map<number, V> => {
      const o = new Map<number, V>();
      for (const [k, v] of m) {
        const nk = keyOf(k);
        /* Шинэ түлхүүрт аль хэдийн байвал (жааз хоёулаа агуулсан) — тэр нь шинэ, хэвээр */
        if (nk !== k && m.has(nk)) continue;
        o.set(nk, v);
      }
      return o;
    };
    const mvKey = (k: string): string => {
      const p = parseKey(k);
      if (!p || p.type === 'm' || p.type === 'n') return k;
      const to = map.get(p.oid);
      if (to == null || to === p.oid) return k;
      return p.type === 's' || p.type === 'a' ? `${p.type}:${to}:${p.blk}` : `${p.type}:${to}`;
    };
    const mvRef = <V,>(m: Map<string, V>): Map<string, V> => new Map([...m].map(([k, v]) => [mvKey(k), v]));
    hdPrev.current = mvRef(hdPrev.current);
    hdMeta.current = mvRef(hdMeta.current);
    hdSeen.current = mvRef(hdSeen.current);
    hdRemapHold.current = { draft: cur.draft };
    setDraft(mv(cur.draft)); setHam(mv(cur.ham)); setADraft(mv(cur.aDraft)); setResDraft(mv(cur.resDraft));
  }, [rows, pkgKey, hdMapsRef, setDraft, setHam, setADraft, setResDraft]);

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
    /* ⚠️ 2026-10-09: жааз солигдож Map зөөгдөж байна — шинэ түлхүүртэй Map ирэх хүртэл диффгүй (`hdRemapHold`) */
    if (hdRemapHold.current) {
      if (draft === hdRemapHold.current.draft) return;
      hdRemapHold.current = null;
    }
    const cur = mapsToCells({ draft, ham, aDraft, resDraft, obDraft, obRes: obResDraft }, hdCtx);
    const wasW = hdPrevW.current;
    hdPrevW.current = hdWritable;
    /* ⚠️ 2026-10-04: `hdClear`-ийн дараа эцгийн хоосолсон Map ирэх хүртэл диффгүй (`hdExpectEmpty`) */
    if (hdExpectEmpty.current) {
      if (!cur.size) { hdExpectEmpty.current = false; hdPrev.current = cur; }
      return;
    }
    /* ⚠️ Бичих боломжгүй үед (эсвэл дөнгөж боломжтой болоход) зөвхөн СУУРИЙГ
       тавина — саналын нүдэнд tombstone тавихгүй; метагүй шинэ нүдэнд «би ·
       одоо»-г нэг удаа тавина (`at` тогтвортой байхын тулд, 2026-09-24). */
    if (!hdWritable || !wasW) {
      /*
       * ⚠️ ДӨНГӨЖ ТҮГЖИГДСЭН (2026-10-04 аудит): түгжээний (хамтрагч илгээсэн · батлалт ·
       *    урьдчилан харалт) өмнөх сүүлийн 1.5 с-ийн засвар алсад огт очдоггүй байв —
       *    `hdFlush` бичих боломжгүй үед шууд буцдаг. `hdPrev`/мета нь СҮҮЛИЙН бичих боломжтой
       *    диффийг агуулна (энэ зурагдалтын Map — санал байж болох — ОРОХГҮЙ, `hdDiff`
       *    бичих боломжгүйд ажиллахгүй) → локал хуулбарт СИНХРОН бичиж, бичих боломж эргэж
       *    ирэхэд (эсвэл түгжээ тайлагдсаны дараах сэргээлтэд — локал хуулбар нийлнэ) алсад.
       */
      if (wasW && !hdWritable && !hdHold.current && (hdTimer.current || hdBusy.current)) {
        if (hdTimer.current) { clearTimeout(hdTimer.current); hdTimer.current = null; }
        hdWriteLocal(key, hdLocal());
        hdOwed.current = true;
      }
      if (!wasW && hdWritable && hdOwed.current) { hdOwed.current = false; hdSchedule(1500); }
      let now = 0;
      for (const k of cur.keys()) {
        if (!hdMeta.current.has(k)) hdMeta.current.set(k, { at: now || (now = hdStamp()), user: meRef.current });
      }
      hdPrev.current = cur;
      return;
    }
    const prevSize = hdPrev.current.size;
    if (!hdDiff()) return;
    hdBackoff.current = 3000;
    /* ⚠️ 2026-10-04 аудит: БҮГД буцаагдсан (хоосорсон) бол tombstone-ыг ЛОКАЛД ШУУД — 300 мс-ийн
       завсарт F5 дарвал хуучин хуулбар амилдаг байв. Алс нь доорх товлолтоор. */
    if (!hdPrev.current.size && prevSize) hdWriteLocal(key, hdLocal());
    hdSchedule(!hdPrev.current.size && prevSize ? 300 : 1500);
  }, [draft, ham, aDraft, resDraft, obDraft, obResDraft, hdCtx, hdKeyCur, hdWritable, obState, hdSchedule, hdDiff, hdLocal, hdWriteLocal, hdStamp, meRef]);

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
      /* ⚠️ 2026-10-04 аудит: илгээх явцад (`hdHold`) нийлүүлэхгүй — `busy`-ээр хаагддаггүй
         байсан тул илгээлтэд ороогүй нүд Map-д орж, цэвэрлэлтийн шийдвэрийг будлиантуулдаг
         байв. Чирэлт явж байхад ч (`dragging`) Map-ыг дарахгүй — дараагийн мөчлөгт. */
      if (hdHold.current || draggingRef.current) return;
      /* ⚠️ Мөргүй/задаргаагүй суурьтай (багц солигдож, мөр шинэчлэгдэж байгаа)
         тулгавал нүд хуучирна эсвэл суурьгүй орно */
      if (hdCtxRef.current.rows.size === 0 || obStateRef.current === 'loading') return;
      hdBusy.current = true;
      /* ⚠️ 2026-10-04 (шүүлт): уншилтын завсарт цэвэрлэсэн (`hdClearSeq`) бол үр дүнг хаяна —
         цэвэрлэлтээс ӨМНӨХ алсын ноорог; `hdLastSeenAt` хөдлөхгүй тул дараагийн мөчлөг дахин уншина. */
      const cs = hdClearSeq.current;
      try {
        const at0 = await readRemoteDraftAt(key);
        /* ⚠️ `await` бүрийн дараа ДАХИН шалгана (2026-09-24 аудит): уншилтын завсарт
           батлалт/урьдчилан харалт эхэлсэн бол `hdApply` Map-уудыг дарж, харж
           буй санал эсвэл бичигдэж буй ноорог солигддог байв. */
        if (!hdPollOkRef.current || hdHold.current) return;
        if (at0 === undefined || (at0 ?? 0) === hdLastSeenAt.current || key !== hdKeyRef.current) return;
        const rr = await readRemoteDraft(key);
        if (!hdPollOkRef.current || hdHold.current || draggingRef.current) return;
        if (key !== hdKeyRef.current || hdReady.current !== key || !rr.ok) return;
        if (cs !== hdClearSeq.current) return;
        /* ⚠️ 2026-10-04: `hdLocal` ОДООГИЙН Map-аар дифф хийнэ (`hdDiff`-ийн ⚠️) — сүүлийн
           чирэлтийн алхам нийлүүлэлтээр буцахгүй */
        const remote = rr.draft ? hdParse(rr.draft.payload) : null;
        const merged = hdMerge(remote, hdLocal());
        hdLastSeenAt.current = at0 ?? 0;
        if (!merged) return;
        hdApply(merged);
        /* ⚠️ 2026-10-06: нийлүүлсний дараах ЛОКАЛ-ыг АЛСЫН гарын үсэгтэй харьцуулна. Урьд нь өөрийн
           сүүлд бичсэн `hdLastSig`-тэй харьцуулдаг тул хамтрагчийн бичилт бүр цуурай бичилт,
           худал «алсад хараахан хадгалагдаагүй» шошго, гарах анхааруулга үүсгэдэг байв.
           Ижил бол дахин бичихгүй — `hdLastSig`-ийг локалынхаар тавина (flush · flushNow алгасна).
           `base.n`-ийг алсынхаар тулгана — мөрийн тоо зөрсөн хоёр клиент ээлжлэн бичиж тойрог үүсгэхгүй. */
        if (hdWritableRef.current) {
          const loc = hdLocal();
          const ls = hdSig(remote ? { ...loc, base: remote.base } : loc);
          if (remote ? hdSig(remote) === ls : hdIsEmpty(loc)) { if (remote) hdLastSig.current = hdSig(loc); }
          else hdAgain.current = true;
        }
      } finally {
        hdBusy.current = false;
        if (hdAgain.current) { hdAgain.current = false; hdSchedule(1500); }
      }
    };
    const id = setInterval(() => { void tick(); }, 3000);
    /* ⚠️ Таб хаагдахад урьдчилсан уншилт (`readRemoteDraftAt`) дуусдаггүй тул
       (2026-09-24) ЭХЛЭЭД локал хуулбарыг синхрон бичиж, дараа нь алсад
       уншилтгүйгээр ШУУД бичнэ — «best effort». */
    /*
     * ⚠️ 2026-10-04 аудит:
     *   · ЛОКАЛ хуулбар ТОВЛОЛТООС ҮЛ ХАМААРАН — урьд нь `hdTimer` хоосон (бичилт явж байх ·
     *     дараалалд) үед юу ч хийхгүй буцдаг тул тэр завсарт таб хаавал засвар энэ компьютерт
     *     ч үлддэггүй байв. Хоосон ноорог ч СИНХРОН (урьд нь async `hdFlush` руу шилждэг байв).
     *   · `hdBusy` · `hdHold`-ийг хүндэтгэнэ — явж буй уншилт/бичилттэй зэрэг уншилтгүй бичилт
     *     хийхгүй (хэрэгтэй бол `hdAgain` → дахин товлоно); бичилт өөрөө `hdBusy` авна.
     *   · Цэвэрлэлтийн үе (`hdClearSeq`) зөрвөл `hdFlush`-тэй ижил дахин цэвэрлэнэ.
     * Unmount-д ч дуудагдана (`hdFlushNowRef`) — харагдац солиход 1.5 с-ийн товлолт алдагддаг байв.
     */
    const flushNow = () => {
      const key = hdKeyRef.current;
      if (hdReady.current !== key || !hdWritableRef.current) return;
      const local = hdLocal();
      hdWriteLocal(key, local);
      const s = hdSig(local);
      if (s === hdLastSig.current) {
        if (hdTimer.current) { clearTimeout(hdTimer.current); hdTimer.current = null; }
        return;
      }
      if (hdHold.current) { hdHeldAgain.current = true; return; }
      if (hdBusy.current) { hdAgain.current = true; return; }
      const body = hdSerialize(local, REMOTE_MAX);
      if (body.length > REMOTE_MAX) return;
      if (hdTimer.current) { clearTimeout(hdTimer.current); hdTimer.current = null; }
      const gen = hdGen.current;
      const cs = hdClearSeq.current;
      hdBusy.current = true;
      /* ⚠️ 2026-09-29: уншилтгүй бичилт ч бусдын шинэ нүдийг дарахгүй (`expectAt`) —
         зөрвөл алгасна; локал хуулбар дээр бичигдсэн тул дараагийн нээлтэд нийлнэ. */
      void saveRemoteDraft(key, local.t, body, { expectAt: hdLastSeenAt.current }).then((r) => {
        if ((r.ok || r.written) && cs !== hdClearSeq.current) { void hdRunClearRef.current(key); return; }
        if (gen !== hdGen.current || key !== hdKeyRef.current) return;
        if (r.ok) {
          hdLastSig.current = s; hdLastSeenAt.current = local.t;
          hdLastOkAt.current = Date.now();
          hdSettleMark(key, local, true);
          setHdSt(hdTimer.current ? { st: 'pending' } : { st: 'saved', at: hdLastOkAt.current });
          return;
        }
        /* ⚠️ 2026-10-01 аудит: УНАСАН бичилтийг ДАХИН ТОВЛОНО. Урьд нь юу ч хийдэггүй
           байв — таб буцаж харагдахад `tick` алсын `at` өөрчлөгдөөгүй (`=== hdLastSeenAt`)
           тул шууд буцаж, засвар дараагийн локал засвар хүртэл алсад очдоггүй байв.
           `hdFlush` уншиж-нийлүүлж-бичнэ: зөрчил (`conflict`) бол бусдынхтай нийлнэ,
           бусад алдаанд backoff-той. Бусад товлолт явж байвал түүнийг дарахгүй. */
        if (hdTimer.current) return;
        if (r.conflict) hdSchedule(1500); else hdRetry();
      }).finally(() => {
        hdBusy.current = false;
        if (hdAgain.current) { hdAgain.current = false; hdSchedule(300); }
      });
    };
    hdFlushNowRef.current = flushNow;
    const vis = () => { if (document.hidden) flushNow(); else void tick(); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('pagehide', flushNow);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('pagehide', flushNow);
    };
  }, [status, hdLocal, hdApply, hdWriteLocal, hdSettleMark, hdSchedule, hdRetry, hdCtxRef, hdKeyRef, hdPollOkRef, hdWritableRef, obStateRef, draggingRef]);

  /**
   * UNMOUNT — харагдац солиход хүлээгдэж буй бичилтийг ШУУД гүйцэтгэнэ (2026-10-04 аудит).
   * ⚠️ Урьд нь дээрх эффектийн цэвэрлэгээ `visibilitychange`/`pagehide` сонсогчдыг авч, 1.5 с-ийн
   *    товлолт ганцаараа үлддэг байв (React unmount-ын дараа `hdApply` state-гүй). Одоо локал
   *    хуулбар синхрон + алсад «best effort», дараа нь товлолтуудыг цуцална.
   */
  useEffect(() => () => {
    hdFlushNowRef.current();
    if (hdTimer.current) { clearTimeout(hdTimer.current); hdTimer.current = null; }
    for (const t of hdClearTimer.current.values()) clearTimeout(t);
    hdClearTimer.current.clear();
  }, []);

  /** Хадгалалтын төлөвийн богино текст — толгойд */
  const hdLabel = hdSt.st === 'saving' ? tr('Ноорог хадгалж байна…')
    : hdSt.st === 'pending' ? tr('Ноорог энэ компьютерт — алсад хараахан хадгалагдаагүй')
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
    async (): Promise<boolean> => {
      if (previewing) {
        return window.confirm(tr('Батлах урьдчилан харалт хаагдана. Илгээлт хүлээгдсэн хэвээр үлдэнэ. Үргэлжлүүлэх үү?'));
      }
      /* ⚠️ 2026-09-29 аудит: зөвхөн ХАРАГЧИД бусдын ноорог Map-д байдаг — юу ч бичихгүй */
      if (!canEditRef.current) return true;
      const key = hdKeyRef.current;
      /* ⚠️ `dirtyN === 0` ч бичилт ХҮЛЭЭГДЭЖ болно (2026-10-01 аудит): «Ноорог хаях»/буцаалтын
         дараа tombstone-ыг 300 мс-ийн дараа бичдэг — шууд солибол сэргээлт тэр бичилтийг
         цуцалж, хаясан ноорог буцаж ирдэг байв. */
      const pendingWrite = !!hdTimer.current || hdBusy.current;
      if (dirtyN === 0 && !pendingWrite) return true;
      /* ⚠️ Хуваалцсан ноорог ажиллахгүй (`status === 'off'`, түгжээ) ЭСВЭЛ сэргээлт ДУУСААГҮЙ
         (`hdReady !== key` — `hdLocal()` хоосон, локал хуулбарыг хоосоор дарах байв) үед
         хадгалах боломжгүй — урьдын асуулт хэвээр, алс/локал руу юу ч бичихгүй. */
      if (!hdWritableRef.current || hdReady.current !== key) {
        return dirtyN === 0 || window.confirm(tr('Хадгалаагүй {0} өөрчлөлт байна. Хаяад солих уу?', num(dirtyN)));
      }
      /*
       * ⚠️ НООРОГ УСТГАХГҮЙ — ХАДГАЛААД СОЛИНО (2026-10-01, хэрэглэгч: «төлөвлөгөө хэсгийн
       *    ноорог устаж байна»). Урьд нь «Хаяад солих уу?» гэж асууж, OK дарвал хуваалцсан
       *    нооргийг `hdClear`-ээр устгадаг байв. Ноорог аль хэдийн (төрөл · багц)-аар тусдаа
       *    түлхүүртэй (`hdKey`) тул устгах шаардлагагүй: буцаж ирэхэд сэргээлтийн эффект
       *    тэр түлхүүрээс дахин уншина. Санах ойн Map-ууд `[kind]`/`[pkg]` эффектэд
       *    цэвэрлэгдсэн хэвээр — нэг илгээлт нэг төрөл авч явах дүрэм хөндөгдөхгүй.
       * ⚠️ ОДОО ЛАВ БИЧНЭ: түлхүүр солигдмогц сэргээлтийн эффект товлогдсон бичилтийг
       *    (`hdTimer`, 1.5 с) ЦУЦАЛДАГ тул сүүлийн засвар алдагдах байв. Эхлээд локал
       *    хуулбар (сүлжээ унасан ч энэ компьютерт үлдэнэ), дараа нь алс. Явж буй
       *    уншилт/бичилт (`hdBusy`) дуусахыг хүлээнэ — эс бөгөөс `hdAgain` бичилтийг
       *    ШИНЭ түлхүүр рүү товлоно.
       */
      /* ⚠️ 2026-10-04: нийлүүлж бичнэ (`hdWriteLocal` — нөгөө табын хуулбарыг дарахгүй) */
      hdWriteLocal(key, hdLocal());
      for (let i = 0; i < 3; i += 1) {
        if (hdTimer.current) { clearTimeout(hdTimer.current); hdTimer.current = null; }
        for (let w = 0; w < 100 && hdBusy.current; w += 1) await new Promise((r) => setTimeout(r, 100));
        await hdFlushRef.current();
        if (!hdTimer.current && !hdAgain.current) break;
      }
      if (hdTimer.current) { clearTimeout(hdTimer.current); hdTimer.current = null; }
      hdAgain.current = false;
      return key === hdKeyRef.current;
    },
    [dirtyN, previewing, hdLocal, hdWriteLocal, canEditRef, hdKeyRef, hdWritableRef],
  );

  /**
   * АЛСАД ХҮРЭЭГҮЙ ЗАСВАР БАЙНА УУ (2026-10-04 аудит) — эцгийн `beforeunload`/`navGuard`.
   * ⚠️ Урьд нь `dirtyN > 0` бол ҮРГЭЛЖ анхааруулдаг байв — ноорог алсад бүрэн хадгалагдсан ч.
   *    Одоо бичих боломжтой үед зөвхөн товлогдсон/явж буй/унасан бичилт (`pending` · `saving`
   *    · `err`) эсвэл сэргээлт дуусаагүй завсрын засвар. Бичих боломжгүй (ArcGIS унтраалттай,
   *    түгжээ) үед Map нь ганц хадгалалт тул урьдын `dirtyN > 0` дүрэм хэвээр.
   *    `big` (хэт том) — 2026-10-08 хүртэл анхааруулдаггүй байв (локал хуулбар синхрон); одоо засвартай
   *    (`dirtyN > 0`) бол АСУУНА — ноорог алсад ОГТ очоогүй тул өөр төхөөрөмжид харагдахгүй.
   */
  const hdUnsynced = !canEdit ? false
    : !hdWritable ? dirtyN > 0
      : hdReadyKey !== hdKeyCur ? dirtyN > 0
        /* ⚠️ 2026-10-04 (шүүлт): `err` нь засваргүй үед ч гардаг (нээхэд уншилт унасан, цэвэрлэлтийн
           оролдлого дууссан) — тэр үед хуурамч «гарах уу?» асуулт гарч байв. `err`-д засвар
           (`dirtyN > 0`) шаардана. Хоосон Map-ын алсад хүрээгүй tombstone нь локал хуулбарт СИНХРОН
           бичигдсэн (`hdWriteLocal`) тул гарахад алдагдахгүй — дараагийн нээлтэд алсад очно. */
        : hdSt.st === 'pending' || hdSt.st === 'saving' || (hdSt.st === 'err' && dirtyN > 0)
          || (hdSt.st === 'big' && dirtyN > 0);

  return {
    hdSt, hdUsers, hdLabel, hdReadyKey, hdReady, hdLastSeenAt, hdFlushRef, hdClearRef,
    /* ⚠️ `*Ref` нэрээр — React Compiler ref-ийг нэрээр нь таньж, эцэгт `.current` бичихийг зөвшөөрнө */
    hdTimerRef: hdTimer, hdSkipUnlockOnceRef: hdSkipUnlockOnce, hdMapsRef, hdMeta, meRef, hdKeyRef, hdWritableRef, canEditRef,
    askSwitch, hdClear, hdResetRestore,
    /* ⚠️ 2026-10-09: шинэ жаазад зөөгдөөгүй ноорогтой мөрийн нэр (`hdOrphan`-ийн ⚠️) */
    hdOrphan,
    /* 2026-10-04 аудит: илгээх · хаях · хадгалагдаагүй төлөв */
    hdSubmitBegin, hdSubmitEnd, hdDiscard, hdUnsynced,
  };
}
