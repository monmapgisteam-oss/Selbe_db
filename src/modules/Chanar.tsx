'use client';

/**
 * ЧАНАРЫН БАРИМТ — MS · MA · MIR · FIC · NCR · QMP · PRC ирүүлэх · хянах · батлах харагдац.
 *
 * ⚠️ «Чанар (QAQC)»-ААС ТУСДАА ЦЭС (2026-09-16, хэрэглэгчийн шийдвэр). Тэр
 *    нь ITP-ийн хүснэгт бөглөнө; энэ нь Чанарын хэлтсийн 5 процессын
 *    ЗУРАГЛАЛААР явдаг баримтын урсгал.
 *
 * ⚠️ 2026-09-28: ДОЛООН ТӨРӨЛ НЭГ ДЭЛГЭЦЭД — дээд талд төрлийн таб, доор нь
 *    багц · төлөв · хайлт. Төрөл бүрийн маягт нь `chanar/*Form.tsx`, энд
 *    зөвхөн жагсаалт, ерөнхий толгой, хянагчийн хэсэг, түүх, хавсралт,
 *    хэвлэх. MS-ийн урсгал ӨӨРЧЛӨГДӨӨГҮЙ (regression: `chanarMs.check`).
 *    QMP · PRC нь MS-ийн маягт (`MsForm`), ижил хянагч.
 *
 * ⚠️ ЗУРАГЛАЛЫН АЛХМУУД ↔ ЭНЭ ДЭЛГЭЦ (MS):
 *    1 · Гүйцэтгэгч боловсруулна      → «+ Шинэ …» · ноорог засах
 *    2 · Ирүүлнэ                       → «Хянуулахаар илгээх»
 *    3 · 4а · 4б хянагчид              → `REVIEWERS_OF[kind]` хөзрүүд
 *    5 · Нэгтгэл                       → `chanarMs.resolve`
 *    6 · Буцаагдсан → сайжруулах       → «Буцаагдсан» төлөвт зохиогч засна
 *    7 · 8 · Гарын үсэг · тархаалт     → батлагдсан баримт · «Хэвлэх»
 *
 * ⚠️ 2-Р ҮЕ ШАТ (2026-09-28) — практикийн үйлдлүүд, бүгд `canAct`-аар:
 *    · «Шинэ хувилбар» (батлагдсанаас ч) — шалтгаан ЗААВАЛ (`revNote`), түүх
 *      `body.revHistory`; буцаагдсанаас дахин илгээхэд ч шалтгаан заавал
 *    · «Хянахгүй буцаах» — Чанарын хэлтэс формат/бүрдэл дутууд (`bounce`)
 *    · «Хүлээн авлаа» — гүйцэтгэгч хариуг хүлээн авсан (`ackRep`); ⚠️ 2026-10-01: NCR-д
 *      нээгч биш ТУХАЙН БАГЦЫН ГҮЙЦЭТГЭГЧ (`canAct`-д `contractor: authorOk`)
 *    · «AN нөхцөл биелсэн — хаах» — AN нээлттэй баримт (`closeAn`), AN өгөхдөө хугацаа
 *    · NCR «Үл тохирлыг хаах» — гүйцэтгэгчийн хаасан мөр (`closeNcr`)
 *    · MA ижил нэртэй идэвхтэй баримт — анхааруулга (`activeSameTitle`), хориг биш
 *
 * ⚠️ ДҮРЭМ ЭНД БИШ — `chanarMs.ts` (цэвэр) ба `chanarStore.ts` (серверийн
 *    мөрөөс шалгана). Энд зөвхөн товч харуулах/нуух (`canAct`).
 *
 * ⚠️ ДУГААР ГАРААР ОРОХГҮЙ — `chanarMs.docNo` автомат.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { setNavDirty } from '@/lib/navGuard';
import { useAuth } from '@/components/AuthGate';
import { roleForUser } from '@/lib/services';
import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';
import { ALL_BAGTS } from '@/lib/scopedAcl';
import { chanarAclReady, isAuthorFor, listChanarAssigns, reviewerRolesFor, subscribeChanarAcl } from '@/lib/chanarAcl';
import {
  activeSameTitle, bounceLabel, canAct, EMPTY_META, isAnOpen, isMsLike, KINDS, MS_STATUS, REVIEWERS_OF, SEQUENTIAL_KINDS, VERDICT,
  delayDays, emptyBodyOf, history, kindLabel, latest, myActionLabel, orgCode, progress, repVerdictText, requiredReviewers, reviewerLabel, roleWaitReason,
  statusLabel, verdictCode, verdictLabel,
  type AnyBody, type BodyCommon, type BounceReason, type DocKind, type InspBody, type InspCheck, type MaBody, type Meta, type MsDoc,
  type MsStatus, type NcrBody, type NcrCorrection, type Review, type Reviewer, type VerdictCode,
} from '@/lib/chanarMs';
import { MA_CATEGORIES, MS_GROUPS, maCategoryLabel, msGroupLabel, msRequiredProgress } from '@/lib/chanarTemplates';
import {
  ackRepDoc, actionableItems, addAttachment, bounceDoc, chanarTableState, closeAnDoc, closeNcrDoc, createDraft, deleteAttachment, listAttachments,
  loadAllDocs, loadBodyOf, loadBodiesOf, loadNcrFlags, newRevisionDoc, reopenDoc, reviewDoc, saveClientChecks, saveDraft, saveMeta,
  submitCorrection, submitDoc, type Attachment, type NcrFlags, type TableState,
} from '@/lib/chanarStore';
import { chanarRoleLabel } from './ChanarAcl';
import {
  docVerdict, emptyLabel, fromDateInput, kindCounts, maMaterialSummary, maSummary, matchesSearch, ncrSummary, newLabel,
  printSigRoles, repSigRoles, visibleInPkg, ymd,
} from './chanar/chanarUi';
import { MsForm, type MsFull } from './chanar/MsForm';
import { MaForm } from './chanar/MaForm';
import { InspForm } from './chanar/InspForm';
import { NcrForm, emptyNcrClose, ncrCloseFrom, type NcrCloseDraft } from './chanar/NcrForm';
import { userError } from '@/components/ui';
import s from './chanar.module.css';

const tagCls = (st: MsStatus): string => {
  if (st === MS_STATUS.approved) return s.tagApproved;
  if (st === MS_STATUS.returned) return s.tagReturned;
  if (st === MS_STATUS.review) return s.tagReview;
  return s.tagDraft;
};
const vbCls = (c: VerdictCode): string => (c === 'A' ? s.vbA : c === 'AN' ? s.vbAN : s.vbR);

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

/** MS бие — `meta` ЗААВАЛ (хуучин мөрд хоосон) */
const asMs = (b: AnyBody): MsFull => ({ ...(b as MsFull), meta: (b as { meta?: Meta }).meta ?? { ...EMPTY_META } });
/** Аль ч биеийн нийтлэг талбар (MS-д сонголтот) */
const commonOf = (b: AnyBody | null): Partial<BodyCommon> => (b ?? {}) as Partial<BodyCommon>;
const metaOf = (b: AnyBody | null | undefined): Meta | undefined => (b as { meta?: Meta } | null | undefined)?.meta;

/** Хавсралт + аль хувилбарын мөрөнд байгаа нь (№6 аудит, 2026-09-16) */
type Att = Attachment & { parentOid: number };

export function Chanar() {
  const { user } = useAuth();
  const me = user?.username ?? '';
  const isSuper = roleForUser(me) === 'super';

  const [tickN, tick] = useState(0);
  useEffect(() => subscribeChanarAcl(() => tick((n) => n + 1)), []);

  const [kind, setKind] = useState<DocKind>('MS');
  const [pkg, setPkg] = useState<string>(PKG_GROUPS[0] ?? '');
  const [filter, setFilter] = useState<'all' | MsStatus>('all');
  const [search, setSearch] = useState('');
  const [table, setTable] = useState<TableState | null>(null);
  const [docs, setDocs] = useState<MsDoc[]>([]);
  /* «Миний хийх» (2026-09-30): NCR-ийн биеийн туг (залруулга ирсэн · хаасан) ба шүүлтүүр */
  const [ncrFlags, setNcrFlags] = useState<NcrFlags | null>(null);
  /* ⚠️ 2026-10-04: NCR туг УНАСАН (`loadNcrFlags().catch`) — «Миний хийх»-ээс NCR чимээгүй
     алга болдог байв; одоо жижиг анхааруулга. `ncrFlags == null` нь эхний ачаалалтад ч үнэн
     тул тусдаа туг. */
  const [ncrFlagsErr, setNcrFlagsErr] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  /* ⚠️ 2026-10-04: ЖАГСААЛТ АЧААЛАХ алдаа — `err`-ээс тусдаа (`err` нь үйлдлийн алдаанд ч
     тавигдана). Унасан үед хураангуй, табын тоо, «Миний хийх (N)», хоосон төлөв 0 / «алга»
     гэж ХУДАЛ хэлэхгүй — `docs` нь `[]` болохоос «баримт байхгүй» биш. */
  const [loadErr, setLoadErr] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const [sel, setSel] = useState<number | null>(null);
  const [body, setBody] = useState<AnyBody | null>(null);
  const [atts, setAtts] = useState<Att[]>([]);
  /* Засварын ноорог — зөвхөн `edit` горимд */
  const [edit, setEdit] = useState(false);
  const [dTitle, setDTitle] = useState('');
  const [dBody, setDBody] = useState<AnyBody>(emptyBodyOf('MS'));
  /* Хянагчийн хэсэг */
  const [rNote, setRNote] = useState('');
  const [perMat, setPerMat] = useState<Record<string, VerdictCode>>({});
  const [anDeadline, setAnDeadline] = useState('');
  const [bounceReason, setBounceReason] = useState<BounceReason>('incomplete');
  /* Зохиогч — хувилбарын шалтгаан (буцаагдсанаас дахин илгээхэд) */
  const [revNote, setRevNote] = useState('');
  /* MIR/FIC — ТУХ хянагчийн захиалагчийн багана */
  const [clientDraft, setClientDraft] = useState<(InspCheck | null)[] | null>(null);
  /* NCR — гүйцэтгэгчийн залруулгын тайлан · хаалт */
  const [corr, setCorr] = useState<NcrCorrection>({ text: '', completedAt: null, steps: [] });
  const [ncrClose, setNcrClose] = useState<NcrCloseDraft>(emptyNcrClose());
  /* Мета — хариуцсан ажилтан 1–2, ангилал (хянагч) */
  const [mOwners, setMOwners] = useState<string[]>([]);
  const [mCat, setMCat] = useState('');
  /* Хэвлэх сонголт (MA) — зөвлөхийн мөр · тоноглолын мөр */
  const [prConsultant, setPrConsultant] = useState(false);
  const [prEquipment, setPrEquipment] = useState(false);
  /* ⚠️ 2026-09-25: Хураангуйн бие — эх нь REF (`bodiesRef`, ачаалалт бүрд шинээр
     эхлэхгүй, зэрэгцээ 4-өөр татна), `bodies` state нь зөвхөн зурах агшин
     (багц дуусахад нэг удаа). `bodiesGen` нь `refresh()`-ээр хүчингүй болсон
     хуучин хариуг хаяна. */
  const bodiesRef = useRef<Map<number, AnyBody>>(new Map());
  const bodiesGen = useRef(0);
  const bodiesPending = useRef<Set<number>>(new Set());
  const [bodies, setBodies] = useState<Map<number, AnyBody>>(new Map());
  /* ⚠️ 2026-09-25: `run()` дуусахад сонголт солигдсон бол хуучин баримтын
     биеийг шинэ сонголт дээр бичихгүй — `selRef` нь сүүлийн `sel`. */
  const selRef = useRef<number | null>(null);
  /* Засах горимд хадгалаагүй өөрчлөлт бий эсэх — багц/таб солих, «Болих»-д асууна */
  const [dirty, setDirty] = useState(false);
  /* `sel` effect дотор баримтын төлөвийг deps-гүй унших */
  const docsRef = useRef<MsDoc[]>([]);
  useEffect(() => { docsRef.current = docs; }, [docs]);

  const authorOk = isAuthorFor(me || null, pkg);
  /* ⚠️ `useMemo` БИШ (2026-09-24): ACL remote-оос ирэхэд (`subscribeChanarAcl`
     tick) хянагчийн үүрэг шинэчлэгдэх ёстой. Тооцоо хямд. */
  const myRoles = reviewerRolesFor(me || null, pkg);
  const aclLocked = !chanarAclReady();
  const LOCK_MSG = tr('Эрхийн хүснэгт уншигдсангүй — засвар хаалттай, дахин ачаална уу.');
  /* NCR нээх эрх — тухайн багцад tuh · chanar · tug хянагч */
  const ncrOpener = REVIEWERS_OF.NCR.some((r) => myRoles.includes(r));
  /* ⚠️ 2026-09-29 (аудит 10): `ORG_CODE`-д байхгүй багцад (Багц 5.2 · 5.3 · 5.4 · 6.4 · 10)
     «+ Шинэ …» гарахгүй — урьд нь зохиогч маягтаа бүтэн бөглөсний ДАРАА `createDraft`
     «гүйцэтгэгчийн код тодорхойгүй» гэж татгалзаж, ажил нь алдагддаг байв. NCR-д код
     шаардахгүй (`NCR_PREFIX`). Шалтгааныг товчны оронд бичнэ. */
  const noOrg = kind !== 'NCR' && authorOk && orgCode(pkg) == null;
  const canCreate = kind === 'NCR' ? ncrOpener : authorOk && !noOrg;

  /* ⚠️ 2026-10-04: хүснэгтийг ЗӨВХӨН админы ил үйлдлээр үүсгэнэ (`createTableNow`) — урьд нь
     super хуудас нээхэд `chanarTableState(isSuper)` автоматаар үүсгэдэг тул ХУВИЙН (харагдахгүй)
     амьд хүснэгт байхад давхар хүснэгт үүсэх эрсдэлтэй байв. */
  const createReq = useRef(false);
  const refresh = useCallback(async () => {
    setLoading(true); setErr(''); setLoadErr(false);
    try {
      const wantCreate = createReq.current;
      createReq.current = false;
      const st = await chanarTableState(wantCreate);
      setTable(st);
      if (!st.ok) { setDocs([]); return; }
      /* ⚠️ Долоон төрлийг НЭГ асуулгаар — таб дээрх тоо, MIR→MA, NCR→MIR иш */
      /* ⚠️ 2026-09-30: NCR туг алдвал «Миний хийх» NCR-ийг л алгасна — жагсаалт унахгүй */
      const [all, nf] = await Promise.all([loadAllDocs(), loadNcrFlags().catch(() => null)]);
      setDocs(all);
      setNcrFlags(nf);
      setNcrFlagsErr(nf == null);
      /* ⚠️ 2026-09-25: хураангуйн биеийн кэш хүчингүй — «Шинэчлэх» бодит утга үзүүлнэ */
      bodiesGen.current += 1;
      bodiesRef.current = new Map();
      bodiesPending.current.clear();
      setBodies(new Map());
    } catch (e) {
      setErr(userError(e));
      setLoadErr(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: `refresh` нь ачааллын төлөвийг синхрон тавиад татна
  useEffect(() => { void refresh(); }, [refresh]);
  /* Админы ил үйлдэл — нэр байгууллагад эзлэгдсэн бол lib өөрөө татгалзана (`hidden`) */
  const createTableNow = () => {
    if (!window.confirm(tr('«Selbe_Chanar_Barimt» хүснэгт танд харагдахгүй байна. Хэрэв хүснэгт аль хэдийн байгаа ч танд хуваалцаагүй бол ШИНЭЭР ҮҮСГЭХГҮЙ — эзэмшигч нь байгууллагад хуваалцах хэрэгтэй. Шинэ хоосон хүснэгт үүсгэх үү?'))) return;
    createReq.current = true;
    void refresh();
  };

  /* ⚠️ 2026-09-25: НООРОГ ЗӨВХӨН ЗОХИОГЧИД (эсвэл super) — `visibleInPkg` */
  const inPkg = useMemo(() => visibleInPkg(docs, pkg, me, isSuper), [docs, pkg, me, isSuper]);
  const counts = useMemo(() => kindCounts(inPkg), [inPkg]);
  /* ⚠️ 2026-10-04: жагсаалт УНАСАН (ачаалал эсвэл хүснэгтийн auth/owner/error) — тоо «—»,
     хоосон төлөв/хураангуй гарахгүй. `none` (хүснэгт үүсээгүй) нь жинхэнэ хоосон тул орохгүй. */
  const listFailed = loadErr || (table != null && !table.ok && table.why !== 'none');
  const kindDocs = useMemo(() => inPkg.filter((d) => d.kind === kind), [inPkg, kind]);
  /* ⚠️ «МИНИЙ ХИЙХ» (2026-09-30): БҮХ багц, бүх төрлөөс энэ хэрэглэгчийн ОДОО хийх ёстой
     баримт (`chanarStore.actionableDocs` — товчны `canAct` дүрэмтэй ижил). `tickN` — ACL
     remote-оос ирэхэд үүрэг шинэчлэгдэнэ (`myRoles`-ийн ижил шалтгаан). */
  /* ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): мөр бүр ЯАГААД жагсаалтад байгаа ба хэдэн хоног
     хүлээсэн (`actionableItems` → `chanarMs.myAction`). Хоног мэдэгдэхгүй бол юу ч бичихгүй. */
  const actionItems = useMemo(
    () => actionableItems(docs, ncrFlags, me),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tickN`: ACL шинэчлэгдэхэд дахин
    [docs, ncrFlags, me, tickN],
  );
  const actionable = useMemo(() => actionItems.map((x) => x.doc), [actionItems]);
  const actionWhy = useMemo(() => new Map(actionItems.map((x) => [x.doc.oid, x])), [actionItems]);
  /* Таб дээрх тэмдэг — СОНГОСОН багц дахь төрөл бүрийн «миний хийх» тоо */
  const mineByKind = useMemo(() => {
    const out = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<DocKind, number>;
    for (const d of actionable) if (d.bagts === pkg) out[d.kind] += 1;
    return out;
  }, [actionable, pkg]);
  const heads = useMemo(() => (mineOnly
    ? actionable.filter((d) => matchesSearch(d, search))
      .sort((a, b) => a.bagts.localeCompare(b.bagts) || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || b.seq - a.seq)
    : latest(kindDocs)
      .filter((d) => filter === 'all' || d.status === filter)
      .filter((d) => matchesSearch(d, search))
      .sort((a, b) => b.seq - a.seq)), [mineOnly, actionable, kindDocs, filter, search]);
  const allHeads = useMemo(() => latest(kindDocs), [kindDocs]);
  /* Иш татах баримтууд — батлагдсан MA (MIR-д), батлагдсан MIR/FIC (NCR-д), батлагдсан MA/MS/QMP/PRC (MA-ийн refs) */
  const approvedMa = useMemo(() => latest(inPkg.filter((d) => d.kind === 'MA')).filter((d) => d.status === MS_STATUS.approved), [inPkg]);
  const approvedInsp = useMemo(() => latest(inPkg.filter((d) => d.kind === 'MIR' || d.kind === 'FIC')).filter((d) => d.status === MS_STATUS.approved), [inPkg]);
  const refOptions = useMemo(() => latest(inPkg.filter((d) => d.kind === 'MA' || isMsLike(d.kind)))
    .filter((d) => d.status === MS_STATUS.approved).map((d) => ({ no: d.docNo, title: d.title })), [inPkg]);

  const doc = useMemo(() => kindDocs.find((d) => d.oid === sel) ?? null, [kindDocs, sel]);
  const hist = useMemo(() => (doc ? history(kindDocs, doc.bagts, doc.seq, doc.kind) : []), [kindDocs, doc]);

  /* Хураангуй — толгой бүрийн биеийг нэг удаа татна (MS: workType · MA: материал · NCR: reopened).
     ⚠️ 2026-09-25: N зэрэгцээ хүсэлт биш — ажилчинтай дараалал (2026-10-04-нөөс багц
     уншигч `loadBodiesOf`, доорх ⚠️). Ирсэн бие нь REF-д, `gen` таарвал л. */
  useEffect(() => {
    const gen = bodiesGen.current;
    const pending = bodiesPending.current;
    const queue = allHeads.filter((d) => !bodiesRef.current.has(d.oid) && !pending.has(d.oid));
    if (!queue.length) return;
    for (const d of queue) pending.add(d.oid);
    let live = true;
    /* ⚠️ 2026-10-04 (гүйцэтгэлийн аудит): мөр тутам `loadBodyOf` (N хүсэлт) → 50-аар БАГЦЛАН
       `loadBodiesOf` (`OBJECTID IN`), 2 ажилчин. Олдоогүй нь урьдын адил хоосон бие. */
    const batches: (typeof queue)[] = [];
    for (let i = 0; i < queue.length; i += 50) batches.push(queue.slice(i, i + 50));
    const worker = async () => {
      for (let b = batches.shift(); b && live; b = batches.shift()) {
        try {
          const got = await loadBodiesOf(b.map((d) => d.oid));
          if (bodiesGen.current === gen) for (const d of b) bodiesRef.current.set(d.oid, got.get(d.oid)?.body ?? emptyBodyOf(d.kind));
        } catch { /* хураангуй л — чимээгүй; дараагийн effect дахин оролдоно */ } finally {
          for (const d of b) pending.delete(d.oid);
        }
      }
    };
    void Promise.all(Array.from({ length: Math.min(2, batches.length) }, worker))
      /* ⚠️ `live`-ээс үл хамааран агшин авна — effect дахин эхэлсэн ч явж байсан
         хүсэлтийн үр дүн зурагдана (эс тэгвээс «ачаалж байна» гацна) */
      .then(() => { if (bodiesGen.current === gen) setBodies(new Map(bodiesRef.current)); });
    return () => {
      live = false;
      for (const d of queue) pending.delete(d.oid);
    };
  }, [allHeads, bodies]);
  const bodiesLoading = allHeads.some((d) => !bodies.has(d.oid));

  const reloadBody = useCallback(async (oid: number) => {
    const r = await loadBodyOf(oid);
    return r?.body ?? null;
  }, []);

  /* Сонгоход бие ба хавсралтыг татна */
  useEffect(() => {
    /* ⚠️ `setEdit(false)` ЭНД БАЙХГҮЙ (2026-09-16 аудит): `startNew` нь
       `setSel(null); setEdit(true)` дуудахад энэ салбар шинэ маягтыг хаадаг байв. */
    /* ⚠️ Хянагчийн тайлбар баримт бүрд ТУСДАА (2026-09-25 аудит). */
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: татах эффект — түлхүүр солигдоход ачаалж буй/өмнөх төлөвийг синхрон тэглээд шинээр татна; render үед гаргавал бүтэц өөрчлөгдөнө
    setRNote(''); setPerMat({}); setClientDraft(null); setAnDeadline(''); setRevNote('');
    setCorr({ text: '', completedAt: null, steps: [] });
    setNcrClose(emptyNcrClose());
    setPrConsultant(false);
    selRef.current = sel;
    if (sel == null) { setBody(null); return; }
    let live = true;
    setBody(null); setEdit(false);
    void reloadBody(sel).then((b) => {
      if (!live) return;
      setBody(b);
      const meta = metaOf(b);
      setMOwners(meta?.owners ?? []); setMCat(meta?.category ?? '');
      /* ⚠️ 2026-09-25: БУЦААГДСАН баримтад өмнөх хувилбарын шалтгааныг урьдчилан
         бөглөхгүй — rev+1-ийн шалтгаан нь ШИНЭ өөрчлөлт. */
      const returned = docsRef.current.find((d) => d.oid === sel)?.status === MS_STATUS.returned;
      setRevNote(returned ? '' : commonOf(b).revNote ?? '');
      if (b && 'correction' in b) { setCorr({ ...(b as NcrBody).correction }); setNcrClose(ncrCloseFrom((b as NcrBody).closure)); }
      if (b && 'items' in b) setClientDraft((b as InspBody).items.map((it) => it.client));
      if (b && 'materials' in b) {
        const ma = b as MaBody;
        setPrEquipment(/лифт|өргөх|кран|lift|hoist|crane/i.test(`${ma.meta.category} ${ma.purpose} ${ma.materials.map((x) => x.name).join(' ')}`));
      }
    }).catch((e) => live && setErr(userError(e)));
    return () => { live = false; };
  }, [sel, reloadBody]);

  /* ⚠️ ХАВСРАЛТ БҮХ ХУВИЛБАРААС (2026-09-16 аудит) — устгах нь зөвхөн ОДООГИЙН мөрийнхөд. */
  const attIds = useMemo(
    () => (sel == null ? [] : [...new Set([sel, ...hist.map((h) => h.oid)])]),
    [sel, hist],
  );
  const reloadAtts = useCallback(async () => {
    const ls = await Promise.all(attIds.map(async (id) => (await listAttachments(id)).map((a) => ({ ...a, parentOid: id }))));
    setAtts(ls.flat());
  }, [attIds]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: татах эффект — түлхүүр солигдоход ачаалж буй/өмнөх төлөвийг синхрон тэглээд шинээр татна; render үед гаргавал бүтэц өөрчлөгдөнө
    if (!attIds.length) { setAtts([]); return; }
    let live = true;
    void Promise.all(attIds.map(async (id) => (await listAttachments(id)).map((a) => ({ ...a, parentOid: id }))))
      .then((ls) => { if (live) setAtts(ls.flat()); })
      .catch((e) => live && setErr(userError(e)));
    return () => { live = false; };
  }, [attIds]);

  const ncrClosed = !!body && 'closure' in body && ((body as NcrBody).closure?.closedByContractor.length ?? 0) > 0;
  const act = doc
    /* ⚠️ 2026-09-29 (аудит 10): `superseded` — түүхээс нээсэн хуучин хувилбарт засах/илгээх товч гарахгүй */
    ? canAct({ ...doc, correctionAt: body && 'correctionAt' in body ? (body as NcrBody).correctionAt : null }, me || null, myRoles, { contractor: authorOk, ncrClosed, superseded: hist.some((h) => h.rev > doc.rev) })
    : {
      edit: false, submit: false, review: [] as Reviewer[], correction: false, reopen: false, clientChecks: false,
      bounce: false, ack: false, closeAn: false, newRevision: false, closeNcr: false,
    };
  /* ⚠️ Хавсралтыг зөвхөн СҮҮЛИЙН хувилбар дээр засна (2026-09-25 аудит); NCR-д
     гүйцэтгэгч залруулгын нотолгоо хавсаргана (`attachDeny`-тэй ижил). */
  const attEdit = !!doc && (doc.kind === 'NCR' ? (act.edit || act.correction) : act.edit && !hist.some((h) => h.rev > doc.rev));

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    if (busy) return false;
    setBusy(true); setErr(''); setNote('');
    const sel0 = sel;
    try {
      const r = await fn();
      if (!r.ok) { setErr(r.error ?? tr('Амжилтгүй.')); return false; }
      setNote(okMsg);
      await refresh();
      /* ⚠️ 2026-09-25: хүлээх хооронд сонголт солигдсон бол (жагсаалт/таб busy үед
         хаалттай ч гэсэн) хуучин баримтын биеийг шинэ сонголт дээр БИЧИХГҮЙ. */
      if (sel0 != null && selRef.current === sel0) {
        const b = await reloadBody(sel0);
        if (selRef.current !== sel0) return true;
        setBody(b);
        if (b) { bodiesRef.current.set(sel0, b); setBodies(new Map(bodiesRef.current)); }
        if (b && 'items' in b) setClientDraft((b as InspBody).items.map((it) => it.client));
        /* ⚠️ 2026-10-04: залруулгын ноорог ч хадгалсан утгаар — эс бөгөөс `sideDirty` худал асууна */
        if (b && 'correction' in b) { setNcrClose(ncrCloseFrom((b as NcrBody).closure)); setCorr({ ...(b as NcrBody).correction }); }
      }
      return true;
    } catch (e) {
      setErr(userError(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  /* ── MA: ижил нэртэй идэвхтэй баримт — анхааруулга (хориг биш) ── */
  const sameTitleOk = (k: DocKind, title: string, excludeSeq?: number): boolean => {
    if (k !== 'MA') return true;
    const twins = activeSameTitle(docs, k, pkg, title, excludeSeq);
    if (!twins.length) return true;
    return window.confirm(tr('Ижил нэртэй идэвхтэй MA бий: {0}. Үргэлжлүүлэх үү?', twins.map((d) => d.docNo).join(', ')));
  };

  const changeTitle = (v: string) => { setDTitle(v); setDirty(true); };
  const changeBody = (v: AnyBody) => { setDBody(v); setDirty(true); };
  /* MIR/FIC — захиалагчийн багана хадгалагдаагүй өөрчлөлттэй юу */
  const clientDirty = !!clientDraft && !!body && 'items' in body
    && (body as InspBody).items.some((it, i) => (clientDraft[i] ?? null) !== it.client);
  /*
   * ⚠️ 2026-10-04: ХЯНАГЧ/ГҮЙЦЭТГЭГЧИЙН ХАЖУУГИЙН МАЯГТ ч хадгалаагүй ажил — тайлбар (`rNote`),
   *    материал бүрийн шийдвэр (`perMat`), хувилбарын шалтгаан (`revNote`), NCR залруулга
   *    (`corr`) ба хаалт (`ncrClose`), AN хугацаа. Урьд нь сонголтын эффект эдгээрийг асуулгүй
   *    тэглэдэг, `discardOk` зөвхөн засах горимыг харж, F5/харагдац солиход ч хамгаалалтгүй
   *    байв. Суурь нь ачаалсан биеэс (`body`) — хоосон биш ч хадгалагдсан утга бол цэвэр.
   */
  const ncrBody = body && 'correction' in body ? (body as NcrBody) : null;
  const revBase = body && doc && doc.status !== MS_STATUS.returned ? (commonOf(body).revNote ?? '') : '';
  const sideDirty = rNote.trim() !== '' || anDeadline !== ''
    || Object.keys(perMat).length > 0
    || (revNote.trim() !== '' && revNote !== revBase)
    || JSON.stringify(corr) !== JSON.stringify(ncrBody ? ncrBody.correction : { text: '', completedAt: null, steps: [] })
    || JSON.stringify(ncrClose) !== JSON.stringify(ncrBody ? ncrCloseFrom(ncrBody.closure) : emptyNcrClose());
  const anyDirty = (edit && dirty) || clientDirty || sideDirty;
  /* ⚠️ `navGuard` — харагдац солих · лого · «Гарах» · F5 (`Portal.confirmLeave`) */
  useEffect(() => { setNavDirty('chanar', anyDirty, tr('Чанарын баримт')); }, [anyDirty]);
  useEffect(() => () => setNavDirty('chanar', false), []);
  /* ⚠️ 2026-09-25: багц/таб солих, өөр карт, «Болих» — хадгалаагүй өөрчлөлтийг асуулгүй хаяхгүй */
  const discardOk = (): boolean => {
    if (!anyDirty) return true;
    return window.confirm(tr('Хадгалаагүй өөрчлөлт бий — хаях уу?'));
  };
  const cancelEdit = () => { if (discardOk()) { setEdit(false); setDirty(false); } };
  const select = (oid: number | null) => { if (oid === sel && !edit) return; if (!discardOk()) return; setSel(oid); setEdit(false); setDirty(false); };
  /* «Миний хийх» жагсаалтаас — өөр багц/төрлийн баримт бол тэр багц, таб руу шилжинэ
     (`doc` нь `kindDocs`-оос олддог тул) */
  const pick = (d: MsDoc) => {
    if (d.oid === sel && !edit) return;
    if (!discardOk()) return;
    if (d.bagts !== pkg) setPkg(d.bagts);
    if (d.kind !== kind) { setKind(d.kind); setFilter('all'); }
    setSel(d.oid); setEdit(false); setDirty(false);
  };
  /* ── 1-р алхам: шинэ ноорог ── */
  const startNew = () => {
    if (!discardOk()) return;
    setSel(null); setEdit(true); setDirty(false);
    setDTitle(''); setDBody(emptyBodyOf(kind)); setBody(null); setAtts([]);
  };
  const startEdit = () => {
    if (!doc || !body) return;
    const b = structuredClone(body);
    /* ⚠️ 2026-09-25: буцаагдсан баримтын засварт хуучин `revNote` урьдчилан бөглөгдөхгүй */
    if (doc.status === MS_STATUS.returned && 'revNote' in b) (b as BodyCommon).revNote = '';
    setEdit(true); setDirty(false); setDTitle(doc.title); setDBody(b);
  };
  const titleErr = () => (isMsLike(kind) ? tr('Аргачлалын нэрийг бичнэ үү.') : tr('Баримтын нэрийг бичнэ үү.'));
  const saveNew = async () => {
    if (!dTitle.trim()) { setErr(titleErr()); return; }
    if (!sameTitleOk(kind, dTitle)) return;
    let oid = 0;
    const ok = await run(async () => {
      const r = await createDraft({ kind, bagts: pkg, title: dTitle, author: me, body: dBody });
      if (r.ok) oid = r.oid;
      return r;
    }, tr('Ноорог хадгалагдлаа — дугаар автоматаар олгогдов.'));
    if (ok) { setEdit(false); setDirty(false); setSel(oid); }
  };
  /* Засах горимд хувилбарын шалтгаан шаардлагатай юу — буцаагдсан (rev+1 үүснэ) эсвэл rev>0 ноорог */
  const needRevNote = !!doc && doc.kind !== 'NCR' && (doc.status === MS_STATUS.returned || doc.rev > 0);
  const saveEdit = async () => {
    if (!doc) return;
    if (!dTitle.trim()) { setErr(titleErr()); return; }
    const rn = (commonOf(dBody).revNote ?? '').trim();
    if (needRevNote && !rn) { setErr(tr('Хувилбарын шалтгаанаа бичнэ үү.')); return; }
    let oid = doc.oid;
    const ok = await run(async () => {
      const r = await saveDraft({ oid: doc.oid, who: me, title: dTitle, body: dBody, revNote: rn || undefined });
      if (r.ok) oid = r.oid;
      return r;
    }, tr('Ноорог хадгалагдлаа.'));
    /* ⚠️ Буцаагдсан баримтыг засахад `saveDraft` rev+1 ШИНЭ мөр үүсгэнэ — түүн рүү шилжинэ. */
    if (ok) { setEdit(false); setDirty(false); if (oid !== doc.oid) setSel(oid); }
  };

  /* ── 2-р алхам: ирүүлэх ── */
  const send = async () => {
    if (!doc) return;
    const rn = revNote.trim();
    if (needRevNote && !rn) { setErr(tr('Хувилбарын шалтгаанаа бичнэ үү.')); return; }
    if (!sameTitleOk(doc.kind, doc.title, doc.seq)) return;
    const q = isMsLike(doc.kind)
      ? tr('«{0}» аргачлалыг ТУХ · Чанар · ХАБЭА гурван хянагчид илгээх үү? Илгээсний дараа засах боломжгүй.', doc.docNo)
      : doc.kind === 'NCR'
        ? tr('«{0}» үл тохирлыг гүйцэтгэгчид илгээх үү? Илгээсний дараа засах боломжгүй.', doc.docNo)
        : tr('«{0}» баримтыг хянуулахаар илгээх үү? Илгээсний дараа засах боломжгүй.', doc.docNo);
    if (!window.confirm(q)) return;
    let oid = doc.oid;
    const ok = await run(async () => {
      const r = await submitDoc({ oid: doc.oid, who: me, revNote: rn || undefined });
      if (r.ok) oid = r.oid;
      return r;
    }, isMsLike(doc.kind) ? tr('Хянуулахаар илгээгдлээ — гурван хянагч зэрэгцээ хянана.')
      : doc.kind === 'NCR' ? tr('Гүйцэтгэгчид илгээгдлээ.') : tr('Хянуулахаар илгээгдлээ.'));
    if (ok) setSel(oid);
  };

  /* ── Шинэ хувилбар — батлагдсан/буцаагдсанаас rev+1 ноорог, шалтгаан заавал ── */
  const newRevision = async () => {
    if (!doc) return;
    const reason = window.prompt(tr('Шинэ хувилбарын шалтгаан (rev {0}):', doc.rev + 1), '');
    if (reason == null) return;
    if (!reason.trim()) { setErr(tr('Хувилбарын шалтгаанаа бичнэ үү.')); return; }
    let oid = doc.oid;
    const ok = await run(async () => {
      const r = await newRevisionDoc({ oid: doc.oid, who: me, reason });
      if (r.ok) oid = r.oid;
      return r;
    }, tr('Шинэ хувилбарын ноорог үүслээ (rev {0}).', doc.rev + 1));
    if (ok) setSel(oid);
  };

  /* MA: материал бүрийн шийдвэрт AN/R байвал нийт A боломжгүй (`chanarMs.review` өсгөдөг) — товч хаалттай, тайлбартай */
  const pmBlocksA = !!doc && doc.kind === 'MA' && Object.values(perMat).some((c) => c !== 'A');

  /* ── 3 · 4а · 4б: хянагчийн шийдвэр — A / AN / R ── */
  const decide = async (as: Reviewer, code: VerdictCode) => {
    if (!doc) return;
    const verdict = code === 'A' ? VERDICT.approve : code === 'AN' ? VERDICT.note : VERDICT.return;
    if (code === 'R' && !rNote.trim()) { setErr(tr('Татгалзах шалтгаанаа бичнэ үү.')); return; }
    if (code === 'AN' && !rNote.trim()) { setErr(tr('Санал бүхий зөвшөөрөлд саналаа бичнэ үү.')); return; }
    const pm = doc.kind === 'MA' && Object.keys(perMat).length ? perMat : undefined;
    if (code === 'A' && pmBlocksA) { setErr(tr('Материалын шийдвэрт AN/R байгаа тул нийт шийдвэр A байж болохгүй — AN эсвэл R сонгоно уу.')); return; }
    const dl = code === 'AN' ? fromDateInput(anDeadline) : null;
    /* ⚠️ 2026-09-30: БАТАЛГААЖУУЛАЛТ — шийдвэр БУЦААГДАХГҮЙ (`review` дүрэм 3), сүүлийн
       зөвшөөрөл эсвэл R нь REP дугаар олгоно. Урьд нь нэг товшилтоор явдаг байв.
       MA-д материалын R нь нийт шийдвэрийг R болгодог (`review` дүрэм 8) — мессеж үүгээр. */
    const eff: VerdictCode = pm && Object.values(pm).includes('R') ? 'R' : code;
    const lastOne = requiredReviewers(doc.reviews, doc.kind).filter((x) => x !== as)
      .every((x) => { const v = doc.reviews[x]; return v != null && v.verdict !== VERDICT.return; });
    const ncr = doc.kind === 'NCR';
    const tail = eff === 'R'
      ? (ncr ? tr('Үл тохирол «Нэмэлт арга хэмжээ шаардлагатай» болж, гүйцэтгэгч залруулгаа дахин илгээнэ.')
        : tr('Баримт гүйцэтгэгч рүү буцаагдаж, захиалагчийн хариу (REP) дугаар олгогдоно — гүйцэтгэгч засаад шинэ хувилбар илгээнэ.'))
      : lastOne
        ? (ncr ? tr('Та сүүлийн дүгнэгч — үл тохирол хаагдаж, захиалагчийн хариу (REP) дугаар олгогдоно.')
          : tr('Та сүүлийн хянагч — баримт батлагдаж, захиалагчийн хариу (REP) дугаар олгогдоно.'))
        : '';
    const q = tr('«{0}» — «{1}» үүргээр «{2}» шийдвэр өгөх үү? Өгсөн шийдвэрийг буцааж өөрчлөх боломжгүй.', doc.docNo, chanarRoleLabel(as), verdictLabel(eff, doc.kind));
    if (!window.confirm(tail ? `${q}\n\n${tail}` : q)) return;
    /* ⚠️ 2026-09-25: MIR/FIC — захиалагчийн баганын хадгалаагүй өөрчлөлтийг ЭХЛЭЭД
       хадгална (`saveClientChecks`), унавал шийдвэр өгөхгүй; өмнө нь алдагддаг байв. */
    const cd = clientDirty && act.clientChecks && clientDraft ? clientDraft : null;
    const ok = await run(
      async () => {
        if (cd) {
          const r = await saveClientChecks({ oid: doc.oid, who: me, client: cd });
          if (!r.ok) return { ok: false, error: tr('Захиалагчийн багана хадгалагдсангүй — шийдвэр өгөгдөөгүй: {0}', r.error ?? '') };
        }
        /* ⚠️ 2026-10-04: NCR — хянагчийн ХАРСАН залруулгын агшин; зөрвөл store татгалзана */
        const seenCorrectionAt = doc.kind === 'NCR' && body && 'correctionAt' in body ? (body as NcrBody).correctionAt : undefined;
        return reviewDoc({ oid: doc.oid, as, who: me, verdict, note: rNote, perMaterial: pm, anDeadline: dl, seenCorrectionAt });
      },
      /* ⚠️ 2026-10-04: дарсан товч (`code`) БИШ, БОДИТ шийдвэр (`eff`) — MA-д материал бүрийн
         шийдвэрээс нэгтгэгддэг тул «Зөвшөөрөв» дарсан ч «R» болж буцаагдсан байж болно. */
      eff === 'R' ? tr('Татгалзаж, гүйцэтгэгч рүү буцаав.') : eff === 'AN' ? tr('Санал бүхий зөвшөөрөв.') : tr('Зөвшөөрөв.'),
    );
    if (ok) { setRNote(''); setPerMat({}); setAnDeadline(''); }
  };

  /* ── Хянахгүй буцаах (Чанарын хэлтэс) ── */
  const need = doc ? REVIEWERS_OF[doc.kind] : REVIEWERS_OF[kind];
  const bounceAs = myRoles.find((r) => (r === 'chanar' || r === 'cheng') && need.includes(r)) ?? null;
  /* ⚠️ 2026-09-29 (аудит 10): `closeAn` зөвхөн chanar/cheng-ийг хүлээн авна. Урьд нь эхний
     тохирсон үүрэг (`tuh` түрүүлдэг) сонгогдож, tuh+chanar хоёр үүрэгтэй хүнд товч
     гарсан атлаа «AN-ийг зөвхөн Чанарын хэлтэс хаана» гэж татгалздаг байв. */
  const closeAs = myRoles.find((r) => (r === 'chanar' || r === 'cheng') && need.includes(r)) ?? null;
  const bounce = async () => {
    if (!doc || !bounceAs) return;
    if (!rNote.trim()) { setErr(tr('Буцаах шалтгаанаа бичнэ үү.')); return; }
    if (!window.confirm(tr('«{0}» баримтыг хянахгүй буцаах уу? Хянагчдын бүртгэл цэвэрлэгдэж, хариу (REP) үүсэхгүй.', doc.docNo))) return;
    const ok = await run(() => bounceDoc({ oid: doc.oid, who: me, as: bounceAs, reason: bounceReason, note: rNote }), tr('Хянахгүй буцаав.'));
    if (ok) setRNote('');
  };
  /* ── AN хаах ── */
  const closeAn = async () => {
    if (!doc || !closeAs) return;
    if (!window.confirm(tr('«{0}» — AN нөхцөл биелсэн гэж хаах уу? Хариу A болж шинэ дугаар авна.', doc.docNo))) return;
    const ok = await run(() => closeAnDoc({ oid: doc.oid, who: me, as: closeAs, note: rNote }), tr('AN хаагдлаа — хариу A.'));
    if (ok) setRNote('');
  };
  /* ── Хүлээн авлаа ── */
  const ack = async () => {
    if (!doc) return;
    await run(() => ackRepDoc({ oid: doc.oid, who: me }), tr('Хариуг хүлээн авлаа.'));
  };

  /* ── MIR/FIC: захиалагчийн багана ── */
  const saveClient = async () => {
    if (!doc || !clientDraft) return;
    await run(() => saveClientChecks({ oid: doc.oid, who: me, client: clientDraft }), tr('Захиалагчийн багана хадгалагдлаа.'));
  };

  /* ── NCR: залруулгын тайлан · дахин нээх · хаах ── */
  const sendCorrection = async () => {
    if (!doc) return;
    if (!corr.text.trim()) { setErr(tr('Залруулгын тайлбараа бичнэ үү.')); return; }
    if (!window.confirm(tr('Залруулгын тайланг захиалагчид илгээх үү?'))) return;
    await run(() => submitCorrection({ oid: doc.oid, who: me, correction: corr }), tr('Залруулгын тайлан илгээгдлээ — захиалагч дүгнэнэ.'));
  };
  /* ⚠️ 2026-09-30: шалтгаан ЗААВАЛ (`chanarMs.reopen`) — хаалтын бүртгэл `rounds`-д үлдэнэ */
  const reopen = async () => {
    if (!doc) return;
    const reason = window.prompt(tr('«{0}» үл тохирлыг дахин нээх шалтгаан (заавал) — гүйцэтгэгч дахин залруулна:', doc.docNo), '');
    if (reason == null) return;
    if (!reason.trim()) { setErr(tr('Дахин нээх шалтгаанаа бичнэ үү.')); return; }
    await run(() => reopenDoc({ oid: doc.oid, who: me, reason }), tr('Дахин нээгдлээ.'));
  };
  const closeNcr = async () => {
    if (!doc) return;
    if (!ncrClose.closedByContractor.some((c) => c.name.trim() || c.position.trim())) { setErr(tr('Хаасан ажилтны нэрийг бичнэ үү.')); return; }
    await run(() => closeNcrDoc({
      oid: doc.oid, who: me, closedByContractor: ncrClose.closedByContractor,
      docType: ncrClose.docType, action: ncrClose.action, result: ncrClose.result, archive: ncrClose.archive,
    }), tr('Үл тохирол хаагдлаа (гүйцэтгэгч).'));
  };

  /* ── Мета — хариуцсан ажилтан 1–2 · ангилал (хянагч) ── */
  const ownerOptions = useMemo(() => {
    const need = REVIEWERS_OF[kind] as readonly string[];
    const out = new Set<string>();
    for (const a of listChanarAssigns()) {
      for (const g of a.grants) {
        if (g.role && need.includes(g.role) && (g.bagts.includes(ALL_BAGTS) || g.bagts.includes(pkg))) out.add(a.user);
      }
    }
    for (const o of mOwners) if (o) out.add(o);
    return [...out].sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tickN`: ACL шинэчлэгдэхэд дахин
  }, [kind, pkg, mOwners, tickN]);
  const bodyMeta = metaOf(body);
  const metaDirty = !!body && ((bodyMeta?.owners ?? []).join('|') !== mOwners.join('|') || (bodyMeta?.category ?? '') !== mCat);
  const setOwnerAt = (i: number, v: string) => {
    const next = [...mOwners];
    if (v) next[i] = v; else next.splice(i, 1);
    setMOwners([...new Set(next.filter(Boolean))].slice(0, 2));
  };
  const saveMetaNow = async () => {
    if (!doc) return;
    await run(() => saveMeta({ oid: doc.oid, who: me, owners: mOwners, category: mCat }), tr('Хариуцсан ажилтан, ангилал хадгалагдлаа.'));
  };

  /* ── Хавсралт ── */
  const upload = async (files: FileList | null) => {
    if (!doc || !files?.length) return;
    setBusy(true); setErr('');
    try {
      /* ⚠️ ХЭМЖЭЭГ ИЛГЭЭХИЙН ӨМНӨ (2026-09-16 аудит): AGOL хавсралтын хязгаар 10 МБ орчим. */
      const MAX_ATT = 10 * 1024 * 1024;
      const errs: string[] = [];
      for (const f of Array.from(files)) {
        if (f.size > MAX_ATT) { errs.push(tr('«{0}» хэт том — 10 МБ-аас бага файл хавсаргана уу.', f.name)); continue; }
        const r = await addAttachment(doc.oid, f);
        if (!r.ok) errs.push(`${f.name}: ${r.error ?? tr('Хавсралт хадгалагдсангүй.')}`);
      }
      if (errs.length) setErr(errs.join(' · '));
      await reloadAtts();
    } catch (e) {
      setErr(userError(e));
    } finally {
      setBusy(false);
    }
  };
  const removeAtt = async (a: Att) => {
    if (!doc || !window.confirm(tr('«{0}» хавсралтыг устгах уу?', a.name))) return;
    setBusy(true);
    try {
      if (!(await deleteAttachment(a.parentOid, a.id))) setErr(tr('Хавсралт устгагдсангүй.'));
      await reloadAtts();
    } catch (e) {
      setErr(userError(e));
    } finally {
      setBusy(false);
    }
  };

  const tableMsg = (st: TableState): string => {
    if (st.why === 'auth') return tr('Нэвтрээгүй байна — чанарын баримт харахын тулд ArcGIS-ээр нэвтэрнэ үү.');
    if (st.why === 'owner') return tr('«Selbe_Chanar_Barimt» хүснэгтийн эзэн танигдсангүй — админд хандана уу.');
    /* ⚠️ 2026-10-04: «автоматаар үүснэ» гэхээ больсон — хүснэгт ХУВИЙН байж болно (`chanarStore.serviceNameTaken`) */
    if (st.why === 'none') return tr('Чанарын баримтын хүснэгт олдсонгүй эсвэл хандах эрхгүй — эзэмшигч нь байгууллагад хуваалцах хэрэгтэй.');
    if (st.why === 'hidden') return tr('«Selbe_Chanar_Barimt» нэртэй үйлчилгээ байгууллагад аль хэдийн бий (эсвэл шалгаж чадсангүй) — шинээр үүсгэсэнгүй. Хүснэгт олдсонгүй эсвэл хандах эрхгүй — эзэмшигч нь байгууллагад хуваалцах хэрэгтэй.');
    return st.detail ?? tr('Хүснэгт уншигдсангүй.');
  };

  /* ── Багцын хураангуй мөр — төрлөөр (бие `bodies`-оос) ── */
  /* ⚠️ 2026-09-25: бие бүрэн татагдаагүй байхад «дутуу N» гэх худал тоо биш — «ачаалж байна» */
  const LOADING = tr('биеийн хураангуй ачаалж байна…');
  const summary = (): string[] => {
    if (isMsLike(kind)) {
      const ap = allHeads.filter((d) => d.status === MS_STATUS.approved).length;
      if (kind !== 'MS') return [tr('Нийт {0} · батлагдсан {1}', allHeads.length, ap)];
      if (bodiesLoading) return [tr('Нийт {0} · батлагдсан {1}', allHeads.length, ap), LOADING];
      const p = msRequiredProgress(allHeads.map((d) => ({ status: d.status, workType: metaOf(bodies.get(d.oid))?.workType ?? null })), MS_STATUS.approved, MS_STATUS.draft);
      return [
        tr('Шаардлагатай {0} аргачлалаас ирүүлсэн {1} · батлагдсан {2} · дутуу {3}', p.total, p.submitted, p.approved, p.missing.length),
        MS_GROUPS.map((g) => `${msGroupLabel(g)} ${p.byGroup[g].approved}/${p.byGroup[g].total}`).join(' · '),
      ];
    }
    if (kind === 'MA') {
      const m = maSummary(allHeads);
      const line1 = tr('A {0} · AN {1} · R {2} · хүлээгдэж буй {3} · нээлттэй {4} · AN нээлттэй {5}', m.A, m.AN, m.R, m.pending, m.open, m.anOpen);
      if (bodiesLoading) return [line1, LOADING];
      const mm = maMaterialSummary(allHeads.map((d) => {
        const b = bodies.get(d.oid) as MaBody | undefined;
        return { head: d, category: b?.meta.category ?? '', materials: b?.materials ?? [] };
      }));
      return [
        line1,
        `${tr('Материал')} ${mm.approved}/${mm.required} · ${MA_CATEGORIES.map((c) => `${maCategoryLabel(c)} ${mm.byCategory[c].approved}/${mm.byCategory[c].required}`).join(' · ')}${mm.other ? ` · ${tr('бусад')} ${mm.other}` : ''}`,
      ];
    }
    if (kind === 'NCR') {
      const n = ncrSummary(allHeads);
      if (bodiesLoading) return [tr('Нээлттэй {0} · хаагдсан {1}', n.open, n.closed), LOADING];
      const reopened = allHeads.filter((d) => ((bodies.get(d.oid) as NcrBody | undefined)?.reopened ?? 0) > 0).length;
      return [tr('Нээлттэй {0} · хаагдсан {1} · дахин нээсэн {2}', n.open, n.closed, reopened)];
    }
    const ap = allHeads.filter((d) => d.status === MS_STATUS.approved).length;
    return [tr('Нийт {0} · батлагдсан {1}', allHeads.length, ap)];
  };

  const switchKind = (k: DocKind) => {
    if (k === kind || busy || !discardOk()) return;
    setKind(k); setSel(null); setEdit(false); setDirty(false); setFilter('all');
  };
  /* Таб — ← → сумаар шилжинэ (WAI-ARIA tablist) */
  const tabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = KINDS.indexOf(kind);
    const k = KINDS[(i + (e.key === 'ArrowRight' ? 1 : KINDS.length - 1)) % KINDS.length];
    switchKind(k);
    document.getElementById(`chanar-tab-${k}`)?.focus();
  };

  /* ── Төрлийн маягт — харах/засах ── */
  const renderBody = (b: AnyBody, editing: boolean, onChange: (v: AnyBody) => void) => {
    const m = { edit: editing, busy };
    const k = editing && !doc ? kind : (doc?.kind ?? kind);
    if (k === 'MA') {
      return (
        <MaForm m={m} body={b as MaBody} onChange={onChange} review={!editing && act.review.length > 0}
          perMaterial={perMat} onPerMaterial={setPerMat} repPer={doc?.rep?.perMaterial}
          ownerOptions={ownerOptions} refOptions={refOptions} />
      );
    }
    if (k === 'MIR' || k === 'FIC') {
      return (
        <InspForm m={m} kind={k} body={b as InspBody} onChange={onChange}
          onTemplate={(title) => { if (!dTitle.trim()) setDTitle(title); }}
          clientEdit={!editing && act.clientChecks} client={clientDraft ?? undefined} onClient={setClientDraft}
          maDocs={approvedMa} tuhVerdict={doc?.reviews.tuh?.verdict ?? null} approved={doc?.status === MS_STATUS.approved} />
      );
    }
    if (k === 'NCR') {
      return (
        <NcrForm m={m} body={b as NcrBody} onChange={onChange} busy={busy} inspDocs={approvedInsp}
          correctionEdit={!editing && act.correction} correction={corr} onCorrection={setCorr}
          status={doc?.status} closeEdit={!editing && act.closeNcr} closeDraft={ncrClose} onCloseDraft={setNcrClose} />
      );
    }
    return <MsForm m={m} body={asMs(b)} onChange={onChange} kind={k} />;
  };

  const reviewers = need;
  const sequential = !!doc && SEQUENTIAL_KINDS.includes(doc.kind);
  const order = doc ? requiredReviewers(doc.reviews, doc.kind) : reviewers;
  const dv = doc ? docVerdict(doc) : null;
  /* ⚠️ 2026-09-30: «хүлээгдэж байна»-ын ОРОНД ШАЛТГААН — хүлээгдэж буй үүргийн эзэд бүгд
     өөр үүргээр шийдсэн / зөвхөн зохиогч / томилоогүй бол баримт ГАЦСАН (`roleWaitReason`).
     Эзэд нь ACL-ээс (тухайн багцад тэр үүрэгтэй аккаунтууд). */
  const holdersOf = (bagts: string, r: Reviewer): string[] => listChanarAssigns()
    .filter((a) => a.grants.some((g) => g.role === r && (g.bagts.includes(ALL_BAGTS) || g.bagts.includes(bagts))))
    .map((a) => a.user);
  const flowDoc = doc ? { ...doc, correctionAt: body && 'correctionAt' in body ? (body as NcrBody).correctionAt : null } : null;
  const meLc = me.trim().toLowerCase();
  const mySlot = doc ? ((Object.entries(doc.reviews) as [Reviewer, Review | null | undefined][])
    .find(([, x]) => x != null && x.who === meLc)?.[0] ?? null) : null;
  /* NCR-ийн өмнөх тойргууд (2026-09-30) */
  const ncrRounds = body && 'rounds' in body ? (body as NcrBody).rounds : [];
  const common = commonOf(body);
  const maBody = body && 'materials' in body ? (body as MaBody) : null;

  return (
    <div className={s.frame}>
      <div className={s.tabs} role="tablist" aria-label={tr('Баримтын төрөл')} onKeyDown={tabKey}>
        {KINDS.map((k) => (
          <button
            key={k} type="button" role="tab" aria-selected={k === kind} id={`chanar-tab-${k}`} aria-controls="chanar-panel"
            tabIndex={k === kind ? 0 : -1} disabled={busy}
            className={`${s.tab} ${k === kind ? s.tabOn : ''}`}
            onClick={() => switchKind(k)}
          >
            {kindLabel(k)} <span className={s.tabK}>{k}</span> <span className={s.tabN}>{listFailed ? '—' : counts[k]}</span>
            {!listFailed && mineByKind[k] > 0 && <> <span className={s.tabMine} title={tr('Таны хийх баримт')}>● {mineByKind[k]}</span></>}
          </button>
        ))}
      </div>

      <div className={s.head}>
        <label className={s.field}>
          {tr('Багц')}
          <select className={s.select} value={pkg} disabled={busy}
            onChange={(e) => { if (!discardOk()) return; setPkg(e.target.value); setSel(null); setEdit(false); setDirty(false); }}>
            {PKG_GROUPS.map((g) => <option key={g} value={g}>{tr(g)}</option>)}
          </select>
        </label>
        <label className={s.field}>
          {tr('Төлөв')}
          <select className={s.select} value={filter} disabled={mineOnly} onChange={(e) => setFilter(e.target.value as 'all' | MsStatus)}>
            <option value="all">{tr('Бүгд')}</option>
            {Object.values(MS_STATUS).map((v) => <option key={v} value={v}>{statusLabel(kind, v)}</option>)}
          </select>
        </label>
        <label className={s.field}>
          {tr('Хайх')}
          <input className={`${s.input} ${s.inpSearch}`} type="search" value={search} placeholder={tr('дугаар · нэр')}
            aria-label={tr('Хайх')} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <button type="button" className={`${s.btn} ${mineOnly ? s.btnOn : ''}`} aria-pressed={mineOnly}
          title={tr('Бүх багц, бүх төрлөөс таны одоо хийх ёстой баримт (хянах · илгээх · залруулах · хүлээн авах)')}
          onClick={() => setMineOnly((v) => !v)}>
          {tr('Миний хийх')} ({listFailed ? '—' : actionable.length})
        </button>
        {ncrFlagsErr && !listFailed && (
          <span className={s.hint} role="status" title={tr('NCR-ийн залруулга/хаалтын төлөв уншигдсангүй — «Миний хийх»-д NCR дутуу байж болно. «Шинэчлэх»-ээр дахин оролдоно уу.')}>
            ⚠ {tr('NCR төлөв уншигдсангүй')}
          </span>
        )}
        <span className={s.grow} />
        {myRoles.length > 0 && (
          <span className={s.field} title={tr('Энэ багцад таны хянагчийн үүрэг')}>
            {myRoles.map(chanarRoleLabel).join(' · ')}
          </span>
        )}
        <button type="button" className={s.btn} disabled={loading || busy} onClick={() => void refresh()}>
          {loading ? tr('Уншиж байна…') : tr('Шинэчлэх')}
        </button>
        {canCreate && table?.ok && (
          <button type="button" className={`${s.btn} ${s.btnPri}`} disabled={busy} onClick={startNew}>
            {newLabel(kind)}
          </button>
        )}
        {noOrg && table?.ok && <span className={s.hint}>{tr('«{0}» багцын гүйцэтгэгчийн код тодорхойгүй.', pkg)}</span>}
      </div>
      {!listFailed && (
        <div className={s.summary} title={tr('Багцын хураангуй')}>
          {summary().map((line, i) => <span key={i}>{line}</span>)}
        </div>
      )}

      {aclLocked && <p className={s.err} role="alert">{LOCK_MSG}</p>}
      {err && <p className={s.err} role="alert">{err}</p>}
      {note && <p className={s.note}>{note}</p>}
      {table && !table.ok && (
        <p className={s.err} role="alert">
          {tableMsg(table)}
          {/* ⚠️ 2026-10-04: үүсгэх нь ЗӨВХӨН админы ил товчоор */}
          {isSuper && table.why === 'none' && (
            <> <button type="button" disabled={loading} onClick={createTableNow}>{tr('Хүснэгт үүсгэх')}</button></>
          )}
        </p>
      )}

      <div className={s.split} id="chanar-panel" role="tabpanel" aria-labelledby={`chanar-tab-${kind}`}>
        <div className={s.list}>
          {heads.length === 0 && !loading && !listFailed && (
            <div className={s.empty}>{mineOnly ? tr('Таны хийх баримт алга.') : emptyLabel(kind)}</div>
          )}
          {heads.map((d) => {
            const p = progress(d.reviews, d.kind);
            const v = docVerdict(d);
            const dl = delayDays(d);
            const todo = actionWhy.get(d.oid) ?? null;
            return (
              <button
                key={d.oid}
                type="button"
                className={`${s.card} ${d.oid === sel ? s.cardOn : ''} ${todo && d.oid !== sel ? s.cardMine : ''}`}
                disabled={busy}
                onClick={() => (mineOnly ? pick(d) : select(d.oid))}
              >
                <span className={s.cardNo}>{d.docNo}</span>
                <span className={s.cardTitle}>{d.title || tr('(нэргүй)')}</span>
                <span className={s.cardMeta}>
                  {/* ⚠️ 2026-10-01: «Таны ээлж»-ийн оронд ШАЛТГААН + хүлээсэн хоног (мэдэгдэхгүй бол хоноггүй) */}
                  {todo && (
                    <span className={`${s.tag} ${s.tagMine}`} title={tr('Таны ээлж')}>
                      {myActionLabel(todo.why)}{todo.days != null && ` · ${tr('{0} хоног', todo.days)}`}
                    </span>
                  )}
                  {mineOnly && <span>{kindLabel(d.kind)} · {d.bagts}</span>}
                  <span className={`${s.tag} ${tagCls(d.status)}`}>{statusLabel(d.kind, d.status)}</span>
                  {d.status === MS_STATUS.review && <span>{p.done}/{p.total}</span>}
                  {d.kind !== 'NCR' && <span>{tr('Хувилбар')} {d.rev}</span>}
                  {v && <span className={`${s.vb} ${vbCls(v)}`}>{v}</span>}
                  {d.bounce && <span className={`${s.tag} ${s.tagReturned}`}>{bounceLabel(d.bounce.reason)}</span>}
                  {isAnOpen(d) && <span className={`${s.tag} ${s.tagReview}`}>{tr('AN нээлттэй')}</span>}
                  {d.rep && <span className={s.cardNo}>{d.rep.no}</span>}
                  {dl != null && <span title={tr('Хоцролт — ирүүлснээс шийдвэр хүртэл')}>{tr('{0} хоног', dl)}</span>}
                  <span>{d.author}</span>
                  <span>{ymd(d.sentAt)}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className={s.doc}>
          {edit && !doc ? (
            <>
              <FormHead head={tr('Шинэ {0} — {1}', kindLabel(kind), pkg)} kind={kind} title={dTitle} onTitle={changeTitle} busy={busy} />
              {renderBody(dBody, true, changeBody)}
              <FormActs busy={busy} onSave={() => void saveNew()} onCancel={cancelEdit} />
            </>
          ) : !doc ? (
            <div className={s.empty}>{tr('Зүүн жагсаалтаас баримт сонгоно уу.')}</div>
          ) : edit ? (
            <>
              <FormHead head={doc.docNo} kind={doc.kind} title={dTitle} onTitle={changeTitle} busy={busy} />
              {needRevNote && (
                <div className={s.sec}>
                  <div className={s.secHead}>{tr('Хувилбарын шалтгаан (rev {0}) — заавал', doc.status === MS_STATUS.returned ? doc.rev + 1 : doc.rev)}</div>
                  <textarea className={s.textarea} aria-label={tr('Хувилбарын шалтгаан')} value={commonOf(dBody).revNote ?? ''} disabled={busy}
                    placeholder={tr('Юу өөрчлөгдсөн — нийлүүлэгч солигдсон, техник үзүүлэлт шинэчлэгдсэн …')}
                    onChange={(e) => changeBody({ ...dBody, revNote: e.target.value } as AnyBody)} />
                </div>
              )}
              {renderBody(dBody, true, changeBody)}
              <FormActs busy={busy} onSave={() => void saveEdit()} onCancel={cancelEdit} />
            </>
          ) : (
            <>
              <div className={s.docHead}>
                <span className={s.docNo}>{doc.docNo}</span>
                <span className={`${s.tag} ${tagCls(doc.status)}`}>{statusLabel(doc.kind, doc.status)}</span>
                {dv && <span className={`${s.vb} ${vbCls(dv)}`}>{dv} · {verdictLabel(dv, doc.kind)}</span>}
                {doc.bounce && <span className={`${s.tag} ${s.tagReturned}`}>{bounceLabel(doc.bounce.reason)}</span>}
                {isAnOpen(doc) && <span className={`${s.tag} ${s.tagReview}`}>{tr('AN нээлттэй')}</span>}
                <span className={s.docTitle}>{doc.title}</span>
              </div>
              <dl className={s.meta}>
                <div><dt>{doc.kind === 'NCR' ? tr('Нээсэн') : tr('Гүйцэтгэгч')}</dt><dd>{doc.org} · {doc.author}</dd></div>
                <div><dt>{tr('Багц')}</dt><dd>{doc.bagts}</dd></div>
                {doc.kind !== 'NCR' && <div><dt>{tr('Хувилбар')}</dt><dd>{doc.rev}</dd></div>}
                <div><dt>{tr('Ирүүлсэн')}</dt><dd>{ymd(doc.sentAt)}</dd></div>
                <div><dt>{tr('Шийдвэрлэсэн')}</dt><dd>{ymd(doc.decidedAt)}</dd></div>
                {delayDays(doc) != null && <div><dt>{tr('Хоцролт')}</dt><dd>{tr('{0} хоног', delayDays(doc))}</dd></div>}
                {doc.rep && <div><dt>{tr('Хариуны дугаар')}</dt><dd className={s.docNo}>{doc.rep.no} · {ymd(doc.rep.at)}</dd></div>}
                <div><dt>{tr('Хариуцсан ажилтан')}</dt><dd>{bodyMeta?.owners?.length ? bodyMeta.owners.join(' · ') : <span className={s.secEmpty}>—</span>}</dd></div>
                {doc.rev > 0 && common.revNote && <div><dt>{tr('Хувилбарын шалтгаан')}</dt><dd>{common.revNote}</dd></div>}
              </dl>

              {doc.bounce && (
                <p className={s.err}>
                  {bounceLabel(doc.bounce.reason)} — {doc.bounce.by} · {ymd(doc.bounce.at)}{doc.bounce.note ? ` · ${doc.bounce.note}` : ''}
                </p>
              )}

              {act.submit && needRevNote && (
                <div className={s.sec}>
                  <div className={s.secHead}>{tr('Хувилбарын шалтгаан (rev {0}) — заавал', doc.status === MS_STATUS.returned ? doc.rev + 1 : doc.rev)}</div>
                  <textarea className={s.textarea} aria-label={tr('Хувилбарын шалтгаан')} value={revNote} disabled={busy}
                    placeholder={tr('Юу өөрчлөгдсөн — нийлүүлэгч солигдсон, техник үзүүлэлт шинэчлэгдсэн …')}
                    onChange={(e) => setRevNote(e.target.value)} />
                </div>
              )}

              <div className={s.acts}>
                {act.edit && (
                  <button type="button" className={s.btn} disabled={busy || !body} onClick={startEdit}>{tr('Засах')}</button>
                )}
                {act.submit && (
                  <button type="button" className={`${s.btn} ${s.btnPri}`} disabled={busy} onClick={() => void send()}>
                    {doc.status === MS_STATUS.returned ? tr('Дахин илгээх (хувилбар +1)')
                      : doc.kind === 'NCR' ? tr('Гүйцэтгэгчид илгээх') : tr('Хянуулахаар илгээх')}
                  </button>
                )}
                {act.newRevision && (
                  <button type="button" className={s.btn} disabled={busy} onClick={() => void newRevision()} title={tr('Батлагдсан/буцаагдсанаас rev+1 ноорог — шалтгаан заавал')}>
                    {tr('Шинэ хувилбар')}
                  </button>
                )}
                {act.ack && (
                  <button type="button" className={`${s.btn} ${s.btnOk}`} disabled={busy} onClick={() => void ack()}>{tr('Хүлээн авлаа')}</button>
                )}
                {act.correction && (
                  <button type="button" className={`${s.btn} ${s.btnPri}`} disabled={busy || !body} onClick={() => void sendCorrection()}>
                    {doc.status === MS_STATUS.returned ? tr('Залруулгын тайлан дахин илгээх') : tr('Залруулгын тайлан илгээх')}
                  </button>
                )}
                {act.closeNcr && (
                  <button type="button" className={`${s.btn} ${s.btnOk}`} disabled={busy || !body} onClick={() => void closeNcr()}>{tr('Үл тохирлыг хаах')}</button>
                )}
                {act.clientChecks && (
                  <button type="button" className={`${s.btn} ${s.btnPri}`} disabled={busy || !clientDraft} onClick={() => void saveClient()}>
                    {tr('Захиалагчийн баганыг хадгалах')}
                  </button>
                )}
                {act.reopen && (
                  <button type="button" className={s.btn} disabled={busy} onClick={() => void reopen()}>{tr('Дахин нээх')}</button>
                )}
                <button type="button" className={s.btn} disabled={!body} onClick={() => window.print()}>{tr('Хэвлэх')}</button>
                {maBody && (
                  <>
                    <label className={s.chk}>
                      <input type="checkbox" checked={prConsultant} onChange={(e) => setPrConsultant(e.target.checked)} />
                      <span>{tr('Хэвлэхэд зөвлөхийн мөр')}</span>
                    </label>
                    <label className={s.chk}>
                      <input type="checkbox" checked={prEquipment} onChange={(e) => setPrEquipment(e.target.checked)} />
                      <span>{tr('Хэвлэхэд тоноглолын мөр')}</span>
                    </label>
                  </>
                )}
              </div>

              {myRoles.length > 0 && body && (
                <div className={s.metaEdit}>
                  {[0, 1].map((i) => (
                    <label key={i} className={s.field}>
                      {i === 0 ? tr('Хариуцсан ажилтан') : tr('Хариуцсан ажилтан 2')}
                      <select className={s.select} value={mOwners[i] ?? ''} disabled={busy} onChange={(e) => setOwnerAt(i, e.target.value)}>
                        <option value="">—</option>
                        {ownerOptions.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </label>
                  ))}
                  <label className={s.field}>
                    {tr('Ангилал')}
                    {doc.kind === 'MA' ? (
                      <select className={s.select} value={mCat} disabled={busy} onChange={(e) => setMCat(e.target.value)} aria-label={tr('Ангилал')}>
                        <option value="">—</option>
                        {MA_CATEGORIES.map((c) => <option key={c} value={c}>{maCategoryLabel(c)}</option>)}
                      </select>
                    ) : (
                      <input className={s.input} value={mCat} disabled={busy} aria-label={tr('Ангилал')} onChange={(e) => setMCat(e.target.value)} />
                    )}
                  </label>
                  <button type="button" className={s.btn} disabled={busy || !metaDirty} onClick={() => void saveMetaNow()}>{tr('Мета хадгалах')}</button>
                </div>
              )}

              {body == null ? (
                <div className={s.empty}>{tr('Уншиж байна…')}</div>
              ) : renderBody(body, false, () => { /* харах горимд өөрчлөлт үгүй */ })}

              <div className={s.sec}>
                <div className={s.secHead}>{tr('Хавсралт — гэрчилгээ · лаборатори · зураг')}</div>
                <div className={s.atts}>
                  {atts.length === 0 && <span className={s.secEmpty}>{tr('хавсралтгүй')}</span>}
                  {atts.map((a) => (
                    <div key={a.id} className={s.att}>
                      <a href={a.url} target="_blank" rel="noreferrer">{a.name}</a>
                      <span className={s.attSize}>{kb(a.size)}</span>
                      {a.parentOid !== doc.oid && (
                        <span className={s.attSize} title={tr('Өмнөх хувилбарын хавсралт')}>
                          R{hist.find((h) => h.oid === a.parentOid)?.rev ?? '?'}
                        </span>
                      )}
                      {/* ⚠️ 2026-09-30: NCR илгээсний дараа нотолгоо устгагдахгүй (`chanarStore.attachDeny`-ийн ⚠️) */}
                      {attEdit && a.parentOid === doc.oid && (doc.kind !== 'NCR' || doc.status === MS_STATUS.draft) && (
                        <button
                          type="button" className={s.btn} disabled={busy} onClick={() => void removeAtt(a)}
                          aria-label={tr('«{0}» хавсралтыг устгах', a.name)} title={tr('«{0}» хавсралтыг устгах', a.name)}
                        >✕</button>
                      )}
                    </div>
                  ))}
                  {attEdit && (
                    <label className={s.field}>
                      <input type="file" multiple disabled={busy} aria-label={tr('Хавсралт нэмэх')} onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
                    </label>
                  )}
                </div>
              </div>

              <div className={s.sec}>
                <div className={s.secHead}>
                  {doc.kind === 'NCR' ? tr('Захиалагчийн дүгнэлт') : tr('Хяналт')} — {reviewers.map(chanarRoleLabel).join(' · ')}
                  {sequential ? ` (${tr('дараалсан')}: ${order.map(reviewerLabel).join(' → ')})` : ` (${tr('зэрэгцээ')})`}
                </div>
                {doc.kind === 'NCR' && doc.status === MS_STATUS.review && !(body as NcrBody | null)?.correctionAt && (
                  <p className={`${s.secText} ${s.secEmpty}`}>{tr('Гүйцэтгэгчийн залруулгын тайлан ирсний дараа дүгнэлт өгнө.')}</p>
                )}
                <div className={s.reviews}>
                  {reviewers.map((r) => {
                    const v = doc.reviews[r];
                    const mine = act.review.includes(r);
                    const waiting = doc.status === MS_STATUS.review && !v;
                    /* Дараалсан төрөлд — өмнөх шийдвэрлээгүй үүрэг (хуучин мөрд алгасагдсан слот `order`-т үгүй) */
                    const idx = order.indexOf(r);
                    const prev = waiting && sequential ? order.slice(0, idx < 0 ? order.length : idx).find((p) => !doc.reviews[p]) ?? null : null;
                    const skipped = sequential && waiting && idx < 0;
                    const wait = waiting && !prev && !skipped && !aclLocked && flowDoc
                      ? roleWaitReason(flowDoc, r, holdersOf(doc.bagts, r)) : null;
                    const waitMsg = !wait ? null
                      : wait.why === 'decidedOther'
                        ? tr('Гацсан: {0} энэ баримтад өөр үүргээр шийдвэр өгсөн — нэг хүн зөвхөн нэг үүргээр хянана. «{1}» үүрэгт өөр хүн томилуулна уу.', wait.users.join(', '), chanarRoleLabel(r))
                        : wait.why === 'authorOnly'
                          ? tr('Гацсан: энэ үүрэгт зөвхөн зохиогч ({0}) томилогдсон — зохиогч өөрийгөө хянахгүй. Өөр хүн томилуулна уу.', wait.users.join(', '))
                          : tr('Энэ багцад «{0}» үүрэгт хянагч томилогдоогүй — эрхийн админд хандана уу.', chanarRoleLabel(r));
                    /* Энэ үүрэгтэй ч товч гараагүй хэрэглэгчид — яагаад */
                    const whyMe = !wait && waiting && !mine && !prev && !skipped && !!meLc && myRoles.includes(r)
                      ? (doc.kind !== 'NCR' && doc.author === meLc ? tr('Та энэ баримтын зохиогч тул хянахгүй.')
                        : mySlot ? tr('Та энэ баримтад «{0}» үүргээр шийдвэр өгсөн — нэг хүн зөвхөн нэг үүргээр хянана.', chanarRoleLabel(mySlot)) : null)
                      : null;
                    return (
                      <div key={r} className={s.rev}>
                        <span className={s.revWho}>{chanarRoleLabel(r)}</span>
                        {v ? (
                          <>
                            <span className={`${s.vb} ${vbCls(verdictCode(v.verdict))}`}>{verdictLabel(v.verdict, doc.kind)}</span>
                            <span>{v.who} · {ymd(v.at)}</span>
                            {v.note && <span className={s.revNote}>{v.note}</span>}
                            {v.anDeadline && <span className={s.attSize}>{tr('AN хугацаа')}: {ymd(v.anDeadline)}</span>}
                            {v.perMaterial && Object.keys(v.perMaterial).length > 0 && (
                              <span className={s.attSize}>
                                {Object.entries(v.perMaterial).map(([i, c]) => `${Number(i) + 1}:${c}`).join(' · ')}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <span className={s.secEmpty}>
                              {prev ? tr('Эхлээд {0} шийдвэр өгнө', reviewerLabel(prev))
                                : skipped ? tr('алгассан (хуучин мөр)') : waiting ? tr('хүлээгдэж байна') : '—'}
                            </span>
                            {waitMsg && <span className={s.warnText} role="note">{waitMsg}</span>}
                          </>
                        )}
                        {whyMe && <span className={s.hint}>{whyMe}</span>}
                        {mine && (
                          <div className={s.revActs}>
                            <button type="button" className={`${s.btn} ${s.btnOk}`} disabled={busy || pmBlocksA} onClick={() => void decide(r, 'A')}
                              title={pmBlocksA ? tr('Материалын шийдвэрт AN/R байгаа тул нийт шийдвэр A байж болохгүй — AN эсвэл R сонгоно уу.') : undefined}>
                              {verdictLabel('A', doc.kind)}
                            </button>
                            <button type="button" className={`${s.btn} ${s.btnWarn}`} disabled={busy} onClick={() => void decide(r, 'AN')}>
                              {verdictLabel('AN', doc.kind)}
                            </button>
                            <button type="button" className={`${s.btn} ${s.btnBad}`} disabled={busy} onClick={() => void decide(r, 'R')}>
                              {verdictLabel('R', doc.kind)}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {act.review.length > 0 && (
                  <>
                    {pmBlocksA && (
                      <p className={s.warnText}>{tr('Материалын шийдвэрт AN/R байгаа тул нийт шийдвэр A байж болохгүй — AN эсвэл R сонгоно уу.')}</p>
                    )}
                    <textarea
                      className={s.textarea}
                      placeholder={tr('Санал, шаардлага — AN ба R-д ЗААВАЛ')}
                      aria-label={tr('Хянагчийн санал')}
                      value={rNote}
                      onChange={(e) => setRNote(e.target.value)}
                      disabled={busy}
                    />
                    {doc.kind !== 'NCR' && (
                      <label className={s.field}>
                        {tr('AN нөхцөл биелэх хугацаа (сонголт)')}
                        <input type="date" className={s.input} value={anDeadline} disabled={busy} aria-label={tr('AN нөхцөл биелэх хугацаа (сонголт)')}
                          onChange={(e) => setAnDeadline(e.target.value)} />
                      </label>
                    )}
                  </>
                )}
                {act.bounce && bounceAs && (
                  <div className={s.revActs}>
                    {act.review.length === 0 && (
                      <textarea className={s.textarea} placeholder={tr('Буцаах тайлбар — заавал')} aria-label={tr('Буцаах тайлбар')}
                        value={rNote} onChange={(e) => setRNote(e.target.value)} disabled={busy} />
                    )}
                    <label className={s.field}>
                      {tr('Хянахгүй буцаах шалтгаан')}
                      <select className={s.select} value={bounceReason} disabled={busy} onChange={(e) => setBounceReason(e.target.value === 'format' ? 'format' : 'incomplete')}>
                        <option value="incomplete">{tr('Бүрдэл дутуу')}</option>
                        <option value="format">{tr('Формат буруу')}</option>
                      </select>
                    </label>
                    <button type="button" className={`${s.btn} ${s.btnBad}`} disabled={busy} onClick={() => void bounce()}>{tr('Хянахгүй буцаах')}</button>
                  </div>
                )}
                {/* ⚠️ 2026-09-30: шийдвэр өгөгдсөн баримтыг хянахгүй буцаахгүй (`chanarMs.bounce`) — яагаад товч алга */}
                {!act.bounce && bounceAs && doc.kind !== 'NCR' && doc.status === MS_STATUS.review && doc.author !== meLc
                  && Object.values(doc.reviews).some((x) => x != null) && (
                  <p className={s.hint}>{tr('Хянагч шийдвэр өгч эхэлсэн тул хянахгүй буцаах боломжгүй — «Татгалзсан (R)» шийдвэр өгнө үү')}</p>
                )}
                {act.closeAn && closeAs && (
                  <div className={s.revActs}>
                    <textarea className={s.textarea} placeholder={tr('AN хаалтын тайлбар (сонголт)')} aria-label={tr('AN хаалтын тайлбар')}
                      value={rNote} onChange={(e) => setRNote(e.target.value)} disabled={busy} />
                    <button type="button" className={`${s.btn} ${s.btnOk}`} disabled={busy} onClick={() => void closeAn()}>{tr('AN нөхцөл биелсэн — хаах')}</button>
                  </div>
                )}
                {doc.rep && (
                  <div className={s.repBox}>
                    <div className={s.secSub}>{tr('Захиалагчийн хариу')} {doc.rep.no} · {ymd(doc.rep.at)} · {repVerdictText(doc.rep.verdict)}</div>
                    {doc.rep.preparedBy && <p className={s.secText}>{tr('Боловсруулсан')}: {doc.rep.preparedBy}</p>}
                    {doc.rep.anText && <p className={s.secText}>[AN] {doc.rep.anText}</p>}
                    {doc.rep.rReasons?.map((x, i) => <p key={i} className={s.secText}>[R] {x}</p>)}
                    {doc.rep.anDeadline && <p className={s.secText}>{tr('AN нөхцөл биелэх хугацаа')}: {ymd(doc.rep.anDeadline)}</p>}
                    {doc.rep.anClosedAt && <p className={s.secText}>{tr('AN хаасан')}: {doc.rep.anClosedBy} · {ymd(doc.rep.anClosedAt)}</p>}
                    <p className={s.secText}>
                      {doc.rep.receivedAt
                        ? `${tr('Хүлээн авсан')}: ${doc.rep.receivedBy} · ${ymd(doc.rep.receivedAt)}`
                        : <span className={s.secEmpty}>{tr('гүйцэтгэгч хариуг хүлээн аваагүй')}</span>}
                    </p>
                  </div>
                )}
              </div>

              {(hist.length > 1 || (common.revHistory?.length ?? 0) > 0 || (common.bounces?.length ?? 0) > 0 || ncrRounds.length > 0) && (
                <div className={s.sec}>
                  <div className={s.secHead}>{tr('Өөрчлөлтийн түүх')}</div>
                  {hist.length > 1 && (
                    <table className={s.hist}>
                      <thead>
                        <tr>
                          {doc.kind !== 'NCR' && <th>{tr('Хувилбар')}</th>}
                          <th>{tr('Дугаар')}</th><th>{tr('Төлөв')}</th>
                          <th>{tr('Ирүүлсэн')}</th><th>{tr('Шийдвэр')}</th><th>{tr('Хариу')}</th><th>{tr('Хянагчийн санал')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* ⚠️ Гараар ч сонгогдоно (2026-09-23); 2026-09-25: `<tr role=button>` биш —
                            дугаарын нүдэнд жинхэнэ <button> (хүснэгтийн семантик хэвээр). */}
                        {hist.map((h) => (
                          <tr key={h.oid} className={h.oid === doc.oid ? s.histOn : ''}>
                            {doc.kind !== 'NCR' && <td>{h.rev}</td>}
                            <td>
                              <button type="button" className={`${s.btn} ${s.btnSm}`} disabled={busy} aria-pressed={h.oid === doc.oid}
                                aria-label={tr('«{0}» хувилбарыг нээх', h.docNo)} onClick={() => select(h.oid)}>
                                {h.docNo}
                              </button>
                            </td>
                            <td>
                              <span className={`${s.tag} ${tagCls(h.status)}`}>{statusLabel(h.kind, h.status)}</span>
                              {h.bounce && <> <span className={`${s.tag} ${s.tagReturned}`}>{bounceLabel(h.bounce.reason)}</span></>}
                            </td>
                            <td>{ymd(h.sentAt)}</td>
                            <td>{ymd(h.decidedAt)}</td>
                            <td>{h.rep ? `${h.rep.no} · ${h.rep.verdict}` : '—'}</td>
                            <td>{REVIEWERS_OF[h.kind].map((r) => h.reviews[r]?.note).filter(Boolean).join(' · ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {(common.revHistory?.length ?? 0) > 0 && (
                    <>
                      <div className={s.secSub}>{tr('Хувилбарын шалтгаанууд')}</div>
                      <table className={s.hist}>
                        <thead><tr><th>{tr('Хувилбар')}</th><th>{tr('Огноо')}</th><th>{tr('Хэн')}</th><th>{tr('Шалтгаан')}</th></tr></thead>
                        <tbody>
                          {common.revHistory?.map((e) => (
                            <tr key={`${e.rev}-${e.at}`}><td>{e.rev}</td><td>{ymd(e.at)}</td><td>{e.by}</td><td>{e.reason}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                  {(common.bounces?.length ?? 0) > 0 && (
                    <>
                      <div className={s.secSub}>{tr('Хянахгүй буцаалтууд')}</div>
                      <table className={s.hist}>
                        <thead><tr><th>{tr('Огноо')}</th><th>{tr('Хэн')}</th><th>{tr('Шалтгаан')}</th><th>{tr('Тайлбар')}</th></tr></thead>
                        <tbody>
                          {common.bounces?.map((b) => (
                            <tr key={`${b.at}-${b.by}`}><td>{ymd(b.at)}</td><td>{b.by}</td><td>{bounceLabel(b.reason)}</td><td>{b.note || '—'}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                  {/* ⚠️ 2026-09-30: NCR-ийн өмнөх тойргууд — дахин илгээх/нээхэд устдаг байсан бүртгэл */}
                  {ncrRounds.length > 0 && (
                    <>
                      <div className={s.secSub}>{tr('Өмнөх тойргууд')}</div>
                      <div className={s.rounds}>
                        {ncrRounds.map((rd, i) => (
                          <div key={`${rd.at}-${i}`} className={s.round}>
                            <span>
                              <strong>{i + 1}.</strong> {rd.end === 'reopen' ? tr('Дахин нээсэн') : tr('Залруулга дахин илгээсэн')}
                              {' — '}{rd.by} · {ymd(rd.at)} · {statusLabel('NCR', rd.status)}
                              {rd.rep ? ` · ${rd.rep.no} (${rd.rep.verdict})` : ''}
                            </span>
                            {rd.reason && <span>{tr('Шалтгаан')}: {rd.reason}</span>}
                            {rd.correction.text && (
                              <span>{tr('Залруулга')} ({ymd(rd.correctionAt)}): {rd.correction.text}{rd.correction.steps.length ? ` — ${rd.correction.steps.join(' · ')}` : ''}</span>
                            )}
                            {REVIEWERS_OF.NCR.map((r) => {
                              const v = rd.reviews[r];
                              return v ? (
                                <span key={r}>
                                  {chanarRoleLabel(r)}: <span className={`${s.vb} ${vbCls(verdictCode(v.verdict))}`}>{verdictLabel(v.verdict, 'NCR')}</span>
                                  {' '}{v.who} · {ymd(v.at)}{v.note ? ` — ${v.note}` : ''}
                                </span>
                              ) : null;
                            })}
                            {rd.closure && (
                              <span>
                                {tr('Хаалт')}: {rd.closure.verifiedBy} · {ymd(rd.closure.verifiedAt)}
                                {rd.closure.closedByContractor.length ? ` · ${rd.closure.closedByContractor.map((c) => [c.name, c.position].filter(Boolean).join(', ')).join('; ')}` : ''}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Хэвлэхэд л — гарын үсгийн хүснэгт (практикийн маягтын дараалал) */}
              <div className={s.printOnly}>
                <div className={s.secHead}>{tr('Гарын үсэг')}</div>
                <table className={s.sig}>
                  <thead>
                    <tr><th>{tr('Үүрэг')}</th><th>{tr('Нэр')}</th><th>{tr('Албан тушаал')}</th><th>{tr('Гарын үсэг')}</th><th>{tr('Огноо')}</th></tr>
                  </thead>
                  <tbody>
                    {printSigRoles(doc.kind, { ma: maBody, consultant: prConsultant, equipment: prEquipment }).map((r) => (
                      <tr key={r}><td>{r}</td><td /><td /><td /><td /></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Хэвлэхэд л — захиалагчийн хариу (REP) маягт: шийдвэрийн үг · материал бүр · гарын үсэг · хүлээн авалт */}
              {doc.rep && (
                <div className={`${s.printOnly} ${s.repPrint}`}>
                  <div className={s.secHead}>{tr('Захиалагчийн хариу')} — {doc.rep.no} · {ymd(doc.rep.at)}</div>
                  <p className={s.secText}><strong>{repVerdictText(doc.rep.verdict)}</strong></p>
                  {doc.rep.anText && <p className={s.secText}>{doc.rep.anText}</p>}
                  {doc.rep.rReasons?.map((x, i) => <p key={i} className={s.secText}>• {x}</p>)}
                  {maBody && maBody.materials.length > 0 && (
                    <table className={s.tbl}>
                      <thead><tr><th>№</th><th>{tr('Материалын нэр')}</th><th>{tr('Брэнд / марк')}</th><th>{tr('Үйлдвэрлэгч')}</th><th>{tr('Шийдвэр')}</th></tr></thead>
                      <tbody>
                        {maBody.materials.map((mt, i) => {
                          const c = doc.rep?.perMaterial?.[String(i)] ?? mt.verdict ?? doc.rep?.verdict ?? null;
                          return (
                            <tr key={i}>
                              <td>{i + 1}</td><td>{mt.name}</td><td>{[mt.brand, mt.model].filter(Boolean).join(' / ')}</td><td>{mt.manufacturer}</td>
                              <td>{c ? `${c} — ${verdictLabel(c, 'MA')}` : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  <table className={s.sig}>
                    <thead>
                      <tr><th>{tr('Үүрэг')}</th><th>{tr('Нэр')}</th><th>{tr('Албан тушаал')}</th><th>{tr('Гарын үсэг')}</th><th>{tr('Огноо')}</th></tr>
                    </thead>
                    <tbody>
                      {repSigRoles().map((r, i) => (
                        <tr key={r}>
                          <td>{r}</td>
                          <td>{i === 0 ? (doc.rep?.preparedBy ?? '') : i === 3 ? (doc.rep?.receivedBy ?? '') : ''}</td>
                          <td /><td />
                          <td>{i === 3 && doc.rep?.receivedAt ? ymd(doc.rep.receivedAt) : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Маягтын толгой — дугаар/гарчиг + нэрийн талбар */
function FormHead({ head, kind, title, onTitle, busy }: { head: string; kind: DocKind; title: string; onTitle: (v: string) => void; busy: boolean }) {
  const hint = kind === 'MS' ? tr('Аргачлалын нэр — жишээ: Төмөр бетон суурийн ажил')
    : kind === 'QMP' ? tr('Чанарын удирдлагын төлөвлөгөөний нэр')
      : kind === 'PRC' ? tr('Процедурын нэр')
        : kind === 'MA' ? tr('Материалын нэр — жишээ: Арматур AIII Ø12')
          : kind === 'NCR' ? tr('Үл тохирлын товч нэр') : tr('Үзлэгийн нэр — загвар сонгоход бөглөгдөнө');
  return (
    <div className={s.docHead}>
      <span className={s.docNo}>{head}</span>
      <input
        className={`${s.input} ${s.grow}`}
        placeholder={hint}
        aria-label={tr('Баримтын нэр')}
        value={title}
        onChange={(e) => onTitle(e.target.value)}
        disabled={busy}
      />
    </div>
  );
}

function FormActs({ busy, onSave, onCancel }: { busy: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <div className={s.acts}>
      <button type="button" className={`${s.btn} ${s.btnPri}`} disabled={busy} onClick={onSave}>{tr('Ноорог хадгалах')}</button>
      <button type="button" className={s.btn} disabled={busy} onClick={onCancel}>{tr('Болих')}</button>
    </div>
  );
}
