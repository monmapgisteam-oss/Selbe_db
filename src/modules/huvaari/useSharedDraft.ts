import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { num } from '@/lib/format';
import { askConfirm } from '@/lib/confirm';
import type { SheetRow } from '@/modules/sheet/bagtsSheet';
import type { Schema } from '@/modules/sheet/bagts.pkg';
import type { PlanRow } from '@/lib/plan';
import type { MonthRes, PkgPlan, PkgRes } from '@/lib/huvaariObyem';
import type { PlanSubmission } from '@/lib/huvaariBatlah';
import { REMOTE_MAX } from '@/lib/draftRemote';
import { blobStore, legacyPending, prepareStore, type HDStore, type HDStoreMode } from '@/lib/huvaariStore';
import {
  applyClear, cellsToMaps, coversMark, dropCleared, hdClearMarkKey, hdKey, hdLocalKey, hlcNext, identityRemap, isEmpty as hdIsEmpty,
  mapsToCells, maxStamp, merge as hdMerge, mergeMark, parse as hdParse, parseKey, parseMark, remapDraft as hdRemapDraft, rowIdentity, sameVal,
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
  onRemote?: (keys: ReadonlySet<string>) => void;
}) {
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
  const hdClearRef = useRef<(key: string, mark?: HDClearMark | null, submitOid?: number | null) => Promise<void>>(async () => {});
  /** Хүлээгдэж буй алсын цэвэрлэлт (`hdRunClear`) — товлолт/сэргээлтээс (2026-10-04) */
  const hdRunClearRef = useRef<(key: string) => Promise<boolean>>(async () => true);
  /** Хуудас нуух/хаах/unmount-ын синхрон бичилт (`flushNow`) — 2026-10-04 */
  const hdFlushNowRef = useRef<() => void>(() => {});
  /**
   * ГИБРИД ЛОГИК ЦАГ — харсан бүх агшны (нүдний `at` · tombstone · `t` · `cleared`) MAX
   * (2026-10-04 аудит). Шинэ мета · tombstone · `cleared` · `t` бүгд `hdStamp`-аар —
   * `Date.now`-ээр БИШ: цаг нь хоцорсон машины засвар бусдын хуучин нүднээс бага `at`
   * авч нийлүүлэлтэд ялагддаг, tombstone нь хуучин нүдийг хаяж чаддаггүй байв.
   */
  const hdClock = useRef(0);
  const hdStamp = useCallback(() => { const t = hlcNext(hdClock.current); hdClock.current = t; return t; }, []);
  /**
   * Ноорогт харагдсан агшнаар цагийг урагшлуулна.
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
   */
  const hdLastSeenAt = useRef(0);
  /**
   * БИЧИЛТИЙН ҮЕ (generation) — цэвэрлэлт/түлхүүр солигдох бүрд +1 (2026-09-24).
   */
  const hdGen = useRef(0);
  /**
   * ТҮГЖЭЭ ТАЙЛАГДАХ дараагийн удаад Map-уудыг ХООСЛОХГҮЙ (2026-09-24):
   * `withdraw` нь илгээлтийг ноорогт буулгадаг — тэр агуулга «илгээхээс
   * өмнөх хуучин нүд» биш, зохиогчийн буцааж авсан ажил.
   */
  const hdSkipUnlockOnce = useRef(false);
  /* ══════════════ ХУВААЛЦСАН НООРОГ — ArcGIS дээр (2026-09-23) ══════════════ */
  type HdStatus = { st: 'idle' | 'pending' | 'saving' | 'saved' | 'err' | 'big' | 'local'; at?: number; err?: string };
  const [hdSt, setHdSt] = useState<HdStatus>({ st: 'idle' });
  /** Ноорогт нүд бичсэн БУСАД хүмүүс — толгойн «ноорогт: …» */
  const [hdUsers, setHdUsers] = useState<string[]>([]);
  const hdKeyCur = hdKey(kind, pkgKey);
  const hdKeyRef = useLatest(hdKeyCur);
  const kindRef = useLatest(kind);
  const meRef = useLatest((user?.username ?? '').trim().toLowerCase());
  /**
   * Серверийн суурь — `base` (төрлийн муж) + `rows` (уялдаа · бодит · нөөц) + `obPlan`.
   */
  const hdCtx = useMemo<HDCtx>(() => {
    const m = new Map<number, HDRowBase>();
    const byOid = new Map(rows.map((r) => [r.oid, r]));
    const ids = rowIdentity(rows);
    for (const r of base) {
      const sr = byOid.get(r.oid);
      if (!sr) continue;
      const id = ids.get(r.oid);
      m.set(r.oid, {
        spans: r.spans, ham: sr.ham, aStart: sr.aStart, aEnd: sr.aEnd, hun: sr.hun, mashin: sr.mashin, des: sr.des, no: sr.no, work: sr.work,
        ...(id ? { path: id.path, top: id.top, occ: id.occ, occN: id.occN } : {}),
      });
    }
    const known = obState === 'ok';
    return {
      n,
      bld: sc?.bld ?? [],
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
  }, [base, rows, n, obPlan, obRes, obState, sc]);
  const hdCtxRef = useLatest(hdCtx);
  const hdStore = useRef<HDStore>(blobStore);
  const hdStoreKey = useRef('');
  const hdRecheckAt = useRef(0);
  const hdLegacyNoted = useRef<number | null>(null);
  const [hdStoreMode, setHdStoreMode] = useState<HDStoreMode>('blob');
  const [hdStoreNote, setHdStoreNote] = useState('');
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
   */
  const hdCleared = useRef(0);
  /** Сэргээлт ДУУССАН түлхүүр — үүнээс өөр үед дифф ч, бичилт ч үгүй */
  const hdReady = useRef<string | null>(null);
  /**
   * АЛСЫН `at`-ын СҮҮЛД ХАРСАН УТГА — нийлүүлсэн эсвэл өөрөө бичсэн.
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
  /** Сэргээлтэд уншсан локал хуулбарын дээд агшин (`hdWriteLocal`, 2026-10-04) */
  const hdLocalSeen = useRef(0);
  /** «Ноорог хэт том» мэдэгдлийг нэг удаа л (2026-10-08) */
  const hdBigNoted = useRef(false);
  const hdRk = useRef(new Map<number, HDRowKey>());
  const hdLostRef = useRef<{ lost: string[]; unknown: number; moved: number }>({ lost: [], unknown: 0, moved: 0 });
  const hdRemapHold = useRef<{ draft: Draft } | null>(null);
  const hdRowsPrev = useRef<{ key: string; rows: SheetRow[] }>({ key: '', rows: [] });
  const [hdOrphan, setHdOrphan] = useState<Map<number, string>>(() => new Map());
  const draggingRef = useLatest(dragging);
  const statusRef = useLatest(status);
  /** Хүлээгдэж буй цэвэрлэлтийн дахин оролдлого (2026-10-04)
   */
  const hdClearTimer = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const hdClearTries = useRef(new Map<string, number>());
  const hdClearBusy = useRef(false);
  const hdPrevW = useRef(false);
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
    setHdSt((s) => (s.st === 'err' || s.st === 'big' || s.st === 'local' || s.st === 'pending' || s.st === 'saving' ? s : { st: 'pending' }));
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
   */
  const hdSettleMark = useCallback((key: string, written: HDDraft, self = false) => {
    const mk = hdReadMark(key);
    if (mk && (self || !hdBusy.current) && coversMark(written, mk)) { hdPutMark(key, null); hdClearTries.current.delete(key); }
  }, [hdReadMark, hdPutMark]);

  /**
   * ЗӨӨЛӨН МЭДЭГДЭЛ (2026-10-08) — энэ hook-ийн мэдэгдлүүд 2 секундээс ЗАЛУУ мэдэгдлийг дарахгүй
   * (хойшилно). Хамтрагчийн нүд дарсан тухай («N нүд…») мэдэгдлийг дифф бүрд биш, богино хойшлолын
   * дараа НЭГ удаа нэгтгэж бичнэ (`hdDiff`). Зөвхөн ЭНЭ hook-ийн тавьсан мэдэгдлийн агшныг
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
   */
  const hdDiff = useCallback((): boolean => {
    if (hdReady.current !== hdKeyRef.current || obStateRef.current === 'loading') return false;
    if (!hdWritableRef.current || !hdPrevW.current || hdExpectEmpty.current) return false;
    if (hdRemapHold.current) return false;
    const cur = mapsToCells(hdMapsRef.current, hdCtxRef.current);
    const prev = hdPrev.current;
    let changed = false;
    let now = 0;
    const stamp = () => (now || (now = hdStamp()));
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
    const ctxRows = hdCtxRef.current.rows;
    for (const [k, pc] of prev) {
      if (cur.has(k)) continue;
      const p = parseKey(k);
      if (p && p.type !== 'm' && p.type !== 'n' && !ctxRows.has(p.oid)) {
        const m = hdMeta.current.get(k) ?? { at: stamp(), user: meRef.current };
        hdStale.current.set(k, { val: pc.val, bv: pc.bv, at: m.at, user: m.user });
        continue;
      }
      hdMeta.current.delete(k); hdDel.current.set(k, stamp()); changed = true;
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
   */
  const hdLocal = useCallback((): HDDraft => {
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
    const rk = new Map<number, HDRowKey>();
    const ctxRows = hdCtxRef.current.rows;
    for (const k of entries.keys()) {
      const p = parseKey(k);
      if (!p || p.type === 'm' || p.type === 'n' || rk.has(p.oid)) continue;
      const r = ctxRows.get(p.oid);
      const id = r
        ? { des: r.des ?? null, no: r.no ?? '', work: r.work ?? '', ...(r.path ? { path: r.path, top: r.top, occ: r.occ, occN: r.occN } : {}) }
        : hdRk.current.get(p.oid);
      if (id) rk.set(p.oid, id);
    }
    return {
      t: now, kind: kindRef.current, pkg: pkgKeyRef.current, by: { user: meRef.current, at: now },
      entries, del: new Map(hdDel.current), base: { at: hdBaseAt.current, n: hdCtxRef.current.n },
      ...(hdCleared.current ? { cleared: hdCleared.current } : {}),
      ...(rk.size ? { rk } : {}),
    };
  }, [hdCtxRef, kindRef, meRef, pkgKeyRef, hdDiff, hdSchedule, hdStamp]);

  /**
   * Нооргийг 5 Map болгож state-д тавина; мета · tombstone · дифф-суурийг
   * ЗЭРЭГ шинэчилнэ — дараагийн дифф «өөрчлөлтгүй» гэж үзнэ.
   */
  const hdApply = useCallback((d0: HDDraft): HDApply => {
    hdSee(d0);
    let d = d0;
    const ctx0 = hdCtxRef.current;
    let movedN = 0;
    if (ctx0.rows.size) {
      const im = identityRemap(d0, ctx0);
      hdLostRef.current = { lost: im.lost, unknown: im.unknown, moved: im.map.size };
      if (im.map.size) {
        d = hdRemapDraft(d0, im.map, hdStamp(), (_k, e) => e.user !== meRef.current);
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
    const now = hdStamp();
    const dropped = new Set(ap.dropped);
    const stale = new Set(ap.staleKeys);
    const meta = new Map<string, { at: number; user: string }>();
    for (const [k, e] of d.entries) if (!dropped.has(k)) meta.set(k, { at: e.at, user: e.user });
    const del = new Map(d.del);
    for (const k of dropped) if (!stale.has(k)) del.set(k, now);
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
    const lost = new Set<string>();
    for (const [k, e] of d.entries) {
      if (dropped.has(k)) continue;
      const old = hdMeta.current.get(k);
      if (!old || old.user !== meRef.current || e.user === meRef.current || e.at <= old.at) continue;
      if (sameVal(hdPrev.current.get(k)?.val, e.val)) continue;
      lost.add(e.user);
    }
    if (lost.size) hdSoftNote(tr('{0} таны саяхан зассан нүдийг хожуу утгаараа дарлаа', [...lost].join(', ')));
    {
      const remote = new Set<string>();
      for (const [k, e] of d.entries) {
        if (dropped.has(k) || e.user === meRef.current) continue;
        if (!sameVal(hdPrev.current.get(k)?.val, e.val)) remote.add(k);
      }
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
    hdCleared.current = Math.max(hdCleared.current, d.cleared ?? 0);
    hdPrev.current = mapsToCells(ap.maps, hdCtxRef.current);
    hdExpectEmpty.current = false;
    setDraft(ap.maps.draft); setHam(ap.maps.ham); setADraft(ap.maps.aDraft);
    setResDraft(ap.maps.resDraft); setObDraft(ap.maps.obDraft); setObResDraft(ap.maps.obRes);
    setHdUsers(hdUsersOf(d).filter((u) => u !== meRef.current));
    /* Устгасан хуучирсан нүдийг алсад хүргэнэ — дуудагчийн товлолтоос үл хамааран */
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
   */
  const hdRunClear = useCallback(async (key: string): Promise<boolean> => {
    if (!hdReadMark(key)) return true;
    if (statusRef.current === 'off' || !canEditRef.current) return false;
    if (hdClearBusy.current) { hdClearRetry(key); return false; }
    hdClearBusy.current = true;
    const cur = () => key === hdKeyRef.current;
    let err = '';
    try {
      const store = key === hdStoreKey.current ? hdStore.current : await prepareStore(key, { canWrite: canEditRef.current, ctx: null });
      if (store.mode === 'rows-wait') return false;
      const blob = store.mode === 'blob';
      for (let i = 0; i < 3; i += 1) {
        const mk = hdReadMark(key);
        if (!mk) return true;
        const rr = await store.read(key, cur() ? { ctx: hdCtxRef.current } : undefined);
        if (!rr.ok) { err = rr.error; break; }
        const remote = rr.draft;
        hdSee(remote);
        /* Энэ түлхүүр нээлттэй, сэргээгдсэн бол цэвэрлэлтээс хойшхи өөрийн засвар (tombstone) ч хамт */
        const mine = cur() && hdReady.current === key ? hdLocal() : null;
        const t = hdStamp();
        const empty = (): HDDraft => ({
          t, kind: kindRef.current, pkg: pkgKeyRef.current, by: { user: meRef.current, at: t },
          entries: new Map(), del: new Map(), base: { at: hdBaseAt.current, n: hdCtxRef.current.n },
        });
        const cleared = (b0: HDDraft | null): HDDraft => ({ ...applyClear(b0 ?? empty(), mk.keys, mk.ts), t, by: { user: meRef.current, at: t } });
        let d: HDDraft = cleared(hdMerge(remote, mine));
        let body = blob ? hdSerialize(d, REMOTE_MAX) : '';
        if (blob && body.length > REMOTE_MAX && mine) {
          d = cleared(remote);
          body = hdSerialize(d, REMOTE_MAX);
        }
        if (blob && body.length > REMOTE_MAX) {
          err = tr('ноорог хэт том ({0} тэмдэгт, дээд {1})', String(body.length), String(REMOTE_MAX));
          break;
        }
        const r = await store.save(key, d, { expectAt: rr.at ?? null, ctx: cur() ? hdCtxRef.current : null });
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
   */
  const hdClear = useCallback(async (key: string, mark0?: HDClearMark | null, submitOid?: number | null) => {
    if (hdTimer.current) { clearTimeout(hdTimer.current); hdTimer.current = null; }
    const isCur = key === hdKeyRef.current;
    const mark = mark0 ?? (isCur ? hdSnapshot() : null);
    if (!mark) return;
    if (submitOid != null && isCur && statusRef.current !== 'off' && hdStoreKey.current === key && hdStore.current.submitted) {
      const loc = hdLocal();
      const sub: HDDraft = { ...loc, entries: new Map([...loc.entries].filter(([k]) => mark.keys.has(k))), del: new Map() };
      await hdStore.current.submitted(key, sub, hdCtxRef.current, submitOid).catch(() => false);
    }
    hdGen.current += 1;
    hdClearSeq.current += 1;
    /* Илгээх явцад зогсоосон бичилт цэвэрлэлтэд шингэсэн — дахин товлохгүй (түгжээнд «хүлээгдэж буй» шошго гацахгүй) */
    hdHeldAgain.current = false;
    if (isCur) {
      const del = new Map(hdDel.current);
      for (const [k, a] of mark.keys) if ((del.get(k) ?? -1) < a) del.set(k, a);
      hdMeta.current = new Map(); hdDel.current = del; hdPrev.current = new Map();
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
  }, [hdSnapshot, hdLocal, hdWriteLocal, hdReadMark, hdPutMark, hdRunClear, hdKeyRef, statusRef, hdCtxRef]);

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
   */
  const hdFlush = useCallback(async () => {
    if (hdBusy.current) { hdAgain.current = true; return; }
    const key = hdKeyRef.current;
    if (hdReady.current !== key || !hdWritableRef.current) return;
    if (hdHold.current) { hdHeldAgain.current = true; return; }
    if (draggingRef.current) { hdSchedule(800); return; }
    const live = () => key === hdKeyRef.current && hdReady.current === key;
    hdBusy.current = true;
    const cs = hdClearSeq.current;
    try {
      hdWriteLocal(key, hdLocal());
      if (hdStoreKey.current !== key && statusRef.current !== 'off') { hdAgain.current = true; return; }
      const store = hdStore.current;
      const at0 = await store.readAt(key);
      if (!live()) return;
      if (at0 === undefined) {
        setHdSt({ st: 'err', err: tr('алсын ноорогийг шалгаж чадсангүй') });
        hdRetry();
        return;
      }
      if ((at0 ?? 0) !== hdLastSeenAt.current) {
        const rr = await store.read(key, { ctx: hdCtxRef.current });
        if (!live()) return;
        if (!rr.ok) { setHdSt({ st: 'err', err: rr.error }); hdRetry(); return; }
        if (cs !== hdClearSeq.current) { hdAgain.current = true; return; }
        const local0 = hdLocal();
        const merged = hdMerge(rr.draft, local0) ?? local0;
        hdApply(merged);
        hdLastSeenAt.current = at0 ?? 0;
      }
      const local = hdLocal();
      const body = store.mode === 'blob' ? hdSerialize(local, REMOTE_MAX) : '';
      const s = hdSig(local);
      hdWriteLocal(key, local);
      if (s === hdLastSig.current) { if (!hdTimer.current) hdMarkSynced(); return; }
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
      const r = await store.save(key, local, { expectAt: hdLastSeenAt.current, ctx: hdCtxRef.current });
      if ((r.ok || r.written) && cs !== hdClearSeq.current) { void hdRunClearRef.current(key); return; }
      if (!r.ok && r.conflict) { if (live()) { hdLastSeenAt.current = -1; hdAgain.current = true; } return; }
      if (gen !== hdGen.current || !live()) return;
      if (r.ok) {
        hdLastSig.current = s;
        hdLastSeenAt.current = r.at ?? local.t;
        hdBackoff.current = 3000;
        hdLastOkAt.current = Date.now();
        hdSettleMark(key, local, true);
        setHdSt(hdTimer.current ? { st: 'pending' } : { st: 'saved', at: hdLastOkAt.current });
      } else if (r.local) {
        setHdSt({ st: 'local', err: r.error });
      } else {
        setHdSt({ st: 'err', err: r.error });
        hdRetry();
      }
    } finally {
      hdBusy.current = false;
      if (hdAgain.current) { hdAgain.current = false; hdSchedule(300); }
    }
  }, [hdLocal, hdApply, hdWriteLocal, hdMarkSynced, hdSettleMark, hdSchedule, hdRetry, hdKeyRef, hdWritableRef, draggingRef, setNote, statusRef, hdCtxRef]);
  useLayoutEffect(() => { hdFlushRef.current = hdFlush; hdClearRef.current = hdClear; hdRunClearRef.current = hdRunClear; });
  /** Сэргээлтийг ТЭГЛЭНЭ — дараагийн зурагдалтад алсын ноорог дахин уншигдана (3 газар ижил, 2026-09-30) */
  const hdResetRestore = useCallback(() => {
    hdReady.current = null; hdLastSeenAt.current = 0; setHdReadyKey(null);
  }, []);
  const [hdRetryN, setHdRetryN] = useState(0);
  const hdRetryRestore = useCallback(() => { setHdRetryN((x) => x + 1); }, []);

  /**
   * СЭРГЭЭЛТ — багц/төрөл солигдоход (мөр · задаргаа ачаалагдаж, урсгал
   * мэдэгдсэний дараа). Алс → эс бөгөөс локал хуулбар; уншилтын завсарт хийсэн
   * засвар (Map-д байгаа) нийлнэ. Түгжээтэй бол хойшилно (`locked` deps).
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
    hdReady.current = null;
    setHdReadyKey(null);
    hdMeta.current = new Map(); hdDel.current = new Map(); hdPrev.current = new Map(); hdStale.current = new Map();
    hdCleared.current = 0;
    /* 2026-10-04: ажиглалт · хоосролтын хүлээлт · түгжээний өр — түлхүүр бүрт шинээр */
    hdSeen.current = new Map(); hdExpectEmpty.current = false; hdOwed.current = false; hdLocalSeen.current = 0;
    hdLastSeenAt.current = 0; hdLastSig.current = ''; hdAgain.current = false; hdBackoff.current = 3000;
    hdGen.current += 1;
    hdSkipUnlockOnce.current = false;
    hdStoreKey.current = '';
    if (hdTimer.current) { clearTimeout(hdTimer.current); hdTimer.current = null; }
    setHdSt({ st: 'idle' }); setHdUsers([]);
    if (!sc || !rows.length || obState === 'loading' || flowReady === null || hdBlocked) return undefined;
    hdBaseAt.current = Date.now();
    let alive = true;
    void (async () => {
      await new Promise((r) => setTimeout(r, 0));
      if (!alive) return;
      let remote: HDDraft | null = null;
      let readErr = '';
      let fromLocal = false;
      if (status !== 'off') {
        const store = await prepareStore(key, { canWrite: canEditRef.current, ctx: hdCtxRef.current });
        if (!alive) return;
        hdStore.current = store;
        hdStoreKey.current = key;
        setHdStoreMode(store.mode);
        setHdStoreNote(store.note ?? '');
      }
      let mk = hdReadMark(key);
      if (mk && status !== 'off' && canEditRef.current) {
        await hdRunClear(key);
        if (!alive) return;
        mk = hdReadMark(key);
      }
      if (status !== 'off') {
        const rr = await hdStore.current.read(key, { full: true, ctx: hdCtxRef.current });
        if (!alive) return;
        if (rr.ok) {
          remote = rr.draft;
          if (rr.at != null) hdLastSeenAt.current = rr.at;
        } else readErr = rr.error;
      }
      hdSee(remote);
      if (remote && mk) remote = applyClear(remote, mk.keys, mk.ts);
      hdCleared.current = Math.max(hdCleared.current, remote?.cleared ?? 0, mk?.ts ?? 0);
      try {
        const l0 = hdParse(localStorage.getItem(hdLocalKey(key)));
        hdSee(l0);
        hdLocalSeen.current = maxStamp(l0);
        const clearedAt = Math.max(remote?.cleared ?? 0, l0?.cleared ?? 0, mk?.ts ?? 0);
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
      const rm = hdRemapRef.current;
      if (rm && rm.pkg === pkgKeyRef.current) {
        hdRemapRef.current = null;
        if (merged) merged = hdRemapDraft(merged, rm.map, hdStamp(), (_k, e) => e.user !== meRef.current);
      }
      hdReady.current = key;
      hdExpectEmpty.current = false;
      setHdReadyKey(key);
      hdPrevW.current = hdWritableRef.current;
      if (readErr && !fromLocal) setHdSt({ st: 'err', err: readErr });
      if (!merged || hdIsEmpty(merged)) return;
      const ap = hdApply(merged);
      const parts: string[] = [];
      if (ap.applied) parts.push(tr('Ноорог сэргээв: {0} мөр', num(ap.rows)));
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
      if ((fromLocal || localD || mk || ap.dropped.length > ap.staleKeys.length) && hdWritableRef.current) hdSchedule(1500);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hdKeyCur, sc, rows.length > 0, obState, flowReady, hdBlocked, hdPending, status, hdRetryN]);

  /**
   * МӨРҮҮД ШИНЭ ЖААЗ БОЛОХОД НООРОГИЙГ ЗӨӨНӨ (2026-10-09, хэрэглэгч: «жааз солигдоход ноорог алга болж байна»).
   */
  useEffect(() => {
    const prev = hdRowsPrev.current;
    hdRowsPrev.current = { key: pkgKey, rows };
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
   */
  useEffect(() => {
    const key = hdKeyCur;
    if (hdReady.current !== key || obState === 'loading') return;
    if (hdRemapHold.current) {
      if (draft === hdRemapHold.current.draft) return;
      hdRemapHold.current = null;
    }
    const cur = mapsToCells({ draft, ham, aDraft, resDraft, obDraft, obRes: obResDraft }, hdCtx);
    const wasW = hdPrevW.current;
    hdPrevW.current = hdWritable;
    if (hdExpectEmpty.current) {
      if (!cur.size) { hdExpectEmpty.current = false; hdPrev.current = cur; }
      return;
    }
    if (!hdWritable || !wasW) {
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
    if (!hdPrev.current.size && prevSize) hdWriteLocal(key, hdLocal());
    hdSchedule(!hdPrev.current.size && prevSize ? 300 : 1500);
  }, [draft, ham, aDraft, resDraft, obDraft, obResDraft, hdCtx, hdKeyCur, hdWritable, obState, hdSchedule, hdDiff, hdLocal, hdWriteLocal, hdStamp, meRef]);

  /**
   * МӨЧЛӨГ — 3 с тутам (таб харагдаж байхад) алсын `at`-ыг хямдаар шалгаж,
   * өөр бол уншиж нийлүүлнэ. Мэдэгдэлгүй — зөвхөн толгойн «ноорогт: …».
   */
  useEffect(() => {
    if (status === 'off') return undefined;
    const tick = async () => {
      const key = hdKeyRef.current;
      if (document.hidden || hdBusy.current || hdReady.current !== key || !hdPollOkRef.current) return;
      if (hdHold.current || draggingRef.current) return;
      if (hdCtxRef.current.rows.size === 0 || obStateRef.current === 'loading') return;
      if (hdStoreKey.current !== key) return;
      const store = hdStore.current;
      hdBusy.current = true;
      const cs = hdClearSeq.current;
      try {
        if (store.mode === 'rows-wait') {
          if (Date.now() - hdRecheckAt.current < 30_000) return;
          hdRecheckAt.current = Date.now();
          const nx = await prepareStore(key, { canWrite: canEditRef.current, ctx: hdCtxRef.current });
          if (key !== hdKeyRef.current || hdStoreKey.current !== key || hdStore.current !== store || nx.mode === store.mode) return;
          hdStore.current = nx;
          setHdStoreMode(nx.mode);
          setHdStoreNote(nx.note ?? '');
          hdLastSeenAt.current = -1;
          hdLastSig.current = '';
          setHdSt((x) => (x.st === 'local' ? { st: 'pending' } : x));
          if (hdWritableRef.current) hdAgain.current = true;
          return;
        }
        const at0 = await store.readAt(key);
        if (store.mode === 'rows' && legacyPending(at0) && hdLegacyNoted.current !== at0 && key === hdKeyRef.current) {
          hdLegacyNoted.current = at0 as number;
          hdSoftNote(tr('Хуучин хувилбартай таб ({0}) — дахин ачаална уу', tr('хамтрагч')));
        }
        if (!hdPollOkRef.current || hdHold.current) return;
        if (at0 === undefined || (at0 ?? 0) === hdLastSeenAt.current || key !== hdKeyRef.current) return;
        const rr = await store.read(key, { ctx: hdCtxRef.current });
        if (!hdPollOkRef.current || hdHold.current || draggingRef.current) return;
        if (key !== hdKeyRef.current || hdReady.current !== key || !rr.ok) return;
        if (cs !== hdClearSeq.current) return;
        const remote = rr.draft;
        const merged = hdMerge(remote, hdLocal());
        hdLastSeenAt.current = at0 ?? 0;
        if (!merged) return;
        hdApply(merged);
        if (hdWritableRef.current) {
          const loc = hdLocal();
          const ls = hdSig(remote ? { ...loc, base: remote.base } : loc);
          if (remote ? hdSig(remote) === ls : hdIsEmpty(loc)) { if (remote) hdLastSig.current = hdSig(loc); }
          else { hdLastSig.current = ''; hdAgain.current = true; }
        }
      } finally {
        hdBusy.current = false;
        if (hdAgain.current) { hdAgain.current = false; hdSchedule(1500); }
      }
    };
    const id = setInterval(() => { void tick(); }, 3000);
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
      if (statusRef.current === 'off' || hdStoreKey.current !== key) return;
      const store = hdStore.current;
      if (store.mode === 'blob' && hdSerialize(local, REMOTE_MAX).length > REMOTE_MAX) return;
      if (hdTimer.current) { clearTimeout(hdTimer.current); hdTimer.current = null; }
      const gen = hdGen.current;
      const cs = hdClearSeq.current;
      hdBusy.current = true;
      void store.save(key, local, { expectAt: hdLastSeenAt.current, quick: true, ctx: hdCtxRef.current }).then((r) => {
        if ((r.ok || r.written) && cs !== hdClearSeq.current) { void hdRunClearRef.current(key); return; }
        if (gen !== hdGen.current || key !== hdKeyRef.current) return;
        if (r.local) return;
        if (r.ok) {
          hdLastSig.current = s; hdLastSeenAt.current = r.at ?? local.t;
          hdLastOkAt.current = Date.now();
          hdSettleMark(key, local, true);
          setHdSt(hdTimer.current ? { st: 'pending' } : { st: 'saved', at: hdLastOkAt.current });
          return;
        }
        if (hdTimer.current) return;
        if (r.conflict) { hdLastSeenAt.current = -1; hdSchedule(1500); } else hdRetry();
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
  }, [status, hdLocal, hdApply, hdWriteLocal, hdSettleMark, hdSchedule, hdRetry, hdCtxRef, hdKeyRef, hdPollOkRef, hdWritableRef, obStateRef, draggingRef, statusRef, hdSoftNote, canEditRef]);

  /**
   * UNMOUNT — харагдац солиход хүлээгдэж буй бичилтийг ШУУД гүйцэтгэнэ (2026-10-04 аудит).
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
        : hdSt.st === 'local' ? tr('Ноорог зөвхөн энэ компьютерт — {0}', hdSt.err ?? '')
        : hdSt.st === 'err' ? tr('Ноорог алсад хадгалагдсангүй — {0}', hdSt.err ?? '')
          : '';

  /**
   * БАГЦ/ТӨРӨЛ СОЛИХ зөвшөөрөл асууна.
   */
  const askSwitch = useCallback(
    async (): Promise<boolean> => {
      if (previewing) {
        return askConfirm(tr('Батлах урьдчилан харалт хаагдана. Илгээлт хүлээгдсэн хэвээр үлдэнэ. Үргэлжлүүлэх үү?'));
      }
      if (!canEditRef.current) return true;
      const key = hdKeyRef.current;
      const pendingWrite = !!hdTimer.current || hdBusy.current;
      if (dirtyN === 0 && !pendingWrite) return true;
      if (!hdWritableRef.current || hdReady.current !== key) {
        return dirtyN === 0 || askConfirm(tr('Илгээгээгүй {0} өөрчлөлт байна. Хаяад солих уу?', num(dirtyN)), { danger: true, ok: tr('Хаяад солих') });
      }
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
   */
  const hdUnsynced = !canEdit ? false
    : !hdWritable ? dirtyN > 0
      : hdReadyKey !== hdKeyCur ? dirtyN > 0
        : hdSt.st === 'pending' || hdSt.st === 'saving' || (hdSt.st === 'err' && dirtyN > 0)
          || ((hdSt.st === 'big' || hdSt.st === 'local') && dirtyN > 0);

  return {
    hdSt, hdUsers, hdLabel, hdReadyKey, hdReady, hdLastSeenAt, hdFlushRef, hdClearRef,
    hdTimerRef: hdTimer, hdSkipUnlockOnceRef: hdSkipUnlockOnce, hdMapsRef, hdMeta, meRef, hdKeyRef, hdWritableRef, canEditRef,
    askSwitch, hdClear, hdResetRestore, hdRetryRestore,
    hdOrphan,
    /* 2026-10-04 аудит: илгээх · хаях · хадгалагдаагүй төлөв */
    hdSubmitBegin, hdSubmitEnd, hdDiscard, hdUnsynced,
    hdStoreMode, hdStoreNote,
    hdCtxRef, hdReadyRef: hdReady,
  };
}
