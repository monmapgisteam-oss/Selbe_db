'use client';

/**
 * ЧАНАР (QAQC) — Inspection Test Plan-ийн баримт бичиг бөглөх харагдац.
 *
 * ⚠️ 2026-09-03, хэрэглэгчийн ХОЁР шийдвэр:
 *    (1) «QAQC-ийг гүйцэтгэл бөглөхөөс БҮРЭН салгаж тусдаа дэд сэдэв болго» —
 *        өгөгдөл нь `QAQC`/`QAQC2` үйлчилгээнд, архивгүй, мөр нь БАЙРАНДАА
 *        засагдана; бөглөх хуудасны нийтлэх мөчлөгт харьяалагдахгүй.
 *    (2) «Ажиллагааны зарчим, загварыг гүйцэтгэл бөглөх хэсэгтэй БҮРЭН адилхан
 *        болго» — тиймээс ЯГ ижил хүснэгтийн загвар (`.xl.b32`), ижил
 *        багц/хувилбар/бүлэг сонгогч, ижил шатлал ба эвхэлт, ижил баганын
 *        өргөн чирэлт, ижил crosshair, ижил хөвөгч мэдэгдэл, ижил
 *        виртуалчлал, ижил ноорог (localStorage + ArcGIS) ба сэргээх цонх.
 *
 * ⚠️ ЯГ НЭГ ЗӨРӨӨ — БИЧИЛТИЙН ЗАМ. Бөглөх хуудас «Нийтлэх» дарахад хуудсыг
 *    БҮХЭЛДЭЭ хуулбарлаж архивт шинэ агшин үүсгэдэг; энд «Хадгалах» нь
 *    `applyEdits`-ээр тухайн мөрийг ЗАСНА. Тиймээс огнооны сонгогч, «өдөрт нэг
 *    удаа» түгжээ, хяналтад илгээх урсгал ЭНД БАЙХГҮЙ — тэдгээр нь архивын
 *    агшны шинж, засварын шинж БИШ.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { useAuth } from '@/components/AuthGate';
import { hasCap, subscribeCaps } from '@/lib/caps';
import { bagtsScope, subscribeAcl } from '@/lib/guitsetgelAcl';
import { roleForUser } from '@/lib/services';
import { PKG_GROUPS, PKGS, pkgFloors, loadSchema, type Pkg } from '@/modules/sheet/bagts.pkg';
import { loadRows } from '@/modules/sheet/bagtsSheet';
import { useColWidths } from '@/modules/sheet/colWidths';
import {
  attachTree,
  filledCount,
  loadQaqcRows,
  QAQC_BAND,
  QAQC_COLS,
  QAQC_GROUPS,
  qaqcTableOf,
  qaqcUpdates,
  saveQaqc,
  type QaqcRow,
} from '@/lib/qaqc';
import {
  clearQaqcDraft,
  loadQaqcDraft,
  QAQC_REMOTE_MAX,
  saveQaqcDraft,
} from '@/lib/qaqcDraftRemote';
import st from '@/modules/sheet/sheet.module.css';

/** ⚠️ `FillNew`-тэй ИЖИЛ хэрэгсэл — нэг хүснэгтийн загвар хуваалцана. */
const cls = (names: string) =>
  names.split(/\s+/).filter(Boolean).map((n) => st[n] || n).join(' ');

/* ══════════════════════════ НООРОГ ══════════════════════════
 * ⚠️ Бөглөх хуудасны ноорогтой ИЖИЛ зарчим: localStorage нь ҮНДСЭН зам,
 *    ArcGIS дээрх хуулбар нь зөвхөн «өөр төхөөрөмж рүү шилжих» асуудлыг
 *    шийднэ. Сүлжээ унасан ч бөглөлт тасрахгүй.
 * ⚠️ Слот нь БАГЦ бүрд тусдаа. Локал слот `selbe-qaqc-draft:` угтвартай,
 *    алсынх нь ӨӨРИЙН хүснэгттэй (`Selbe_QAQC_Draft`) — 2026-09-03-нд
 *    гүйцэтгэлийн ноорогийн хүснэгтээс бүрэн салгав. Тиймээс түлхүүрт
 *    угтвар нэмэх ХЭРЭГГҮЙ: нэмбэл хоёр талын түлхүүр зөрж, хадгалсан
 *    ноорог эргэж ирэхгүй болно.
 */
type Draft = {
  t: number;
  /** Баримтын нүд — `${ObjectID}:${баганын индекс}` */
  cells: [string, string][];
  /**
   * МӨРИЙН ТАНИГЧ — `ObjectID → "№ ¦ Ажлын нэр"`.
   * ⚠️ QAQC-ийн ObjectID нь ТОГТВОРТОЙ (архив үүсдэггүй) тул бөглөх хуудсанд
   * шаардлагатай «шинэ агшин руу зөөх» логик ЭНД ХЭРЭГГҮЙ. Танигчийг ердөө
   * шалгахад л хэрэглэнэ: хүснэгт AGOL дээр дахин үүсгэгдвэл дугаарууд
   * гулсах бөгөөд тэр үед ноорог ЧИМЭЭГҮЙ буруу мөрд буух ёсгүй.
   */
  rowKeys?: [number, string][];
};

const DRAFT_PREFIX = 'selbe-qaqc-draft:';
const DRAFT_TTL_MS = 3 * 24 * 3600 * 1000;

const parseDraft = (raw: string): Draft | null => {
  try {
    const d = JSON.parse(raw) as Draft;
    if (!d.t || !Array.isArray(d.cells) || Date.now() - d.t > DRAFT_TTL_MS) return null;
    if (d.rowKeys != null && !Array.isArray(d.rowKeys)) d.rowKeys = undefined;
    return d;
  } catch {
    return null;
  }
};
const readDraft = (pkgKey: string): Draft | null => {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + pkgKey);
    return raw ? parseDraft(raw) : null;
  } catch {
    return null;
  }
};
const saveDraftLS = (pkgKey: string, d: Draft) => {
  try {
    localStorage.setItem(DRAFT_PREFIX + pkgKey, JSON.stringify(d));
  } catch {
    /* хувийн горим / дүүрсэн хадгалалт — алсын хуулбар үлдэнэ */
  }
};
const clearDraftLS = (pkgKey: string) => {
  try {
    localStorage.removeItem(DRAFT_PREFIX + pkgKey);
  } catch {
    /* уншихаас ч бичихээс ч хориглогдсон — тоох зүйл алга */
  }
};

/** Сэргээх цонхонд харуулах задаргаа */
type RestorePlan = {
  when: string;
  source: 'local' | 'remote';
  count: number;
  dropped: number;
  cells: Record<string, string>;
};

/**
 * СЭРГЭЭХ ЦОНХ — бөглөх хуудасны `RestoreModal`-тай ИЖИЛ хэв (`st.rs*`).
 *
 * ⚠️ Хөтчийн `confirm` ХЭРЭГЛЭХГҮЙ: дэлгэцийн дээд ирмэгт наалддаг, задаргаа
 *    харуулах боломжгүй бөгөөд Escape нь ЧИМЭЭГҮЙ «Цуцлах» болж ажлыг устгадаг.
 */
function RestoreModal({
  plan, onRestore, onLater, onDrop,
}: {
  plan: RestorePlan;
  onRestore: () => void;
  onLater: () => void;
  onDrop: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      /* ⚠️ Escape нь «Дараа шийднэ» — ноорог ҮЛДЭНЭ. Устгах биш. */
      if (e.key === 'Escape') onLater();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onLater]);

  return (
    <div className={st.overlay} role="presentation" onClick={onLater}>
      <div
        ref={box}
        className={st.rsBox}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qaqc-rs-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={st.rsHead}>
          <span className={st.rsIcon} aria-hidden>↺</span>
          <div>
            <h3 className={st.rsTitle} id="qaqc-rs-title">{tr('Хадгалаагүй засвар байна')}</h3>
            <p className={st.rsWhen}>
              {plan.when}
              <span className={st.rsFrom}>
                {plan.source === 'remote' ? tr('өөр төхөөрөмж') : tr('энэ компьютер')}
              </span>
            </p>
          </div>
        </div>

        {plan.count > 0 && (
          <ul className={st.rsList}>
            <li className={st.rsItem}>
              <span className={st.rsDot} aria-hidden />
              {tr('{0} баримтын нүд', plan.count)}
            </li>
          </ul>
        )}

        {plan.dropped > 0 && (
          <p className={st.rsWarn}>
            {plan.count === 0
              ? tr('QAQC хүснэгт хооронд нь дахин үүсгэгдсэн тул ноорогийн {0} нүд одоогийн мөрүүдэд тохирсонгүй — сэргээх зүйл үлдсэнгүй.', plan.dropped)
              : tr('{0} нүд хуучирсан тул орхигдоно.', plan.dropped)}
          </p>
        )}

        <p className={st.rsNote}>
          {tr('Ноорог энэ хөтөчид, мөн ArcGIS-д хадгалагдана — өөр компьютероос нэвтэрсэн ч сэргээх боломжтой. Үйлчилгээнд бичихийн тулд «Хадгалах» дарна.')}
        </p>

        <div className={st.rsFoot}>
          <button type="button" className={st.rsDrop} onClick={onDrop}>{tr('Устгах')}</button>
          <span className={st.rsGap} />
          <button type="button" className={st.rsLater} onClick={onLater}>{tr('Дараа шийднэ')}</button>
          {plan.count > 0 && (
            <button type="button" className={st.rsGo} onClick={onRestore} autoFocus>
              {tr('Сэргээх')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════ ХАРАГДАЦ ══════════════════════════ */

export function Qaqc() {
  const { user, status: authStatus } = useAuth();
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((n) => n + 1)), []);
  const [aclN, setAclN] = useState(0);
  useEffect(() => subscribeAcl(() => setAclN((n) => n + 1)), []);

  /**
   * ⚠️ ХЯЗГААРГҮЙ = кодын хатуу `super` эсвэл нэвтрэлт унтраалттай дев —
   *    `FillNew`-тэй ЯГ ижил дүрэм. Хоёр хуудас багцын хүрээг өөр өөрөөр
   *    тайлбарлавал хэрэглэгч «яагаад тэнд харагдаад энд харагдахгүй байна»
   *    гэж эргэлзэнэ.
   */
  const unrestricted = authStatus === 'off' || roleForUser(user?.username) === 'super';
  const myBagts = useMemo(
    () => (unrestricted ? null : bagtsScope(user?.username)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, unrestricted, aclN],
  );
  const groupOpts = useMemo(
    () => (myBagts ? PKG_GROUPS.filter((g) => myBagts.includes(g)) : PKG_GROUPS),
    [myBagts],
  );

  /**
   * БӨГЛӨХ ЭРХ — `qaqc`. Эрхгүй хүн хуудсыг ХАРНА, зөвхөн засахгүй.
   * ⚠️ Уншилтыг хаавал чанарын баримтыг хэн ч хянаж чадахгүй болно.
   */
  const canEdit = useMemo(
    () => hasCap(user?.username, 'qaqc'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, capN],
  );

  const [pkg, setPkg] = useState<Pkg>(PKGS[0]);
  const floorOpts = useMemo(() => pkgFloors(pkg.group), [pkg.group]);
  /* Сонгосон багц хуваарилалтаас гадуур үлдвэл зөвшөөрөгдсөн эхнийх рүү */
  useEffect(() => {
    if (groupOpts.includes(pkg.group)) return;
    const first = PKGS.find((p) => p.group === groupOpts[0]);
    if (first) setPkg(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupOpts]);

  const [rows, setRows] = useState<QaqcRow[]>([]);
  /** Шатлал холбогдсон эсэх — хавтгай зурагдвал шалтгааныг ил хэлнэ */
  const [flat, setFlat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  /** Хадгалаагүй засвар — `${ObjectID}:${баганын индекс}` → текст */
  const [pend, setPend] = useState<Record<string, string>>({});
  /** Яг одоо засагдаж буй нүд — `${мөрийн индекс}:${багана}` */
  const [editCell, setEditCell] = useState<string | null>(null);

  const { style: colStyle, grip, resetAll, resized } = useColWidths('qaqc');

  /* ── Хөвөгч мэдэгдэл — `FillNew`-ийн `say`/`done`/`warn`-тай ижил ── */
  const [notice, setNotice] = useState<{ kind: 'ro' | 'ok' | 'warn'; msg: string } | null>(null);
  const noticeT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((kind: 'ro' | 'ok' | 'warn', msg: string) => {
    if (noticeT.current) clearTimeout(noticeT.current);
    setNotice({ kind, msg });
    noticeT.current = setTimeout(() => setNotice(null), 4000);
  }, []);
  const say = useCallback((m: string) => show('ro', m), [show]);
  const done = useCallback((m: string) => show('ok', m), [show]);
  useEffect(() => () => { if (noticeT.current) clearTimeout(noticeT.current); }, []);

  /** Засагдахгүй нүдний тайлбар — товшихад гарна */
  const RO_NO = tr('№ ба Ажлын нэр нь excel-ийн бүтэц — энэ хуудаснаас засагдахгүй.');
  const RO_CAP = tr('Чанарын баримт бөглөхөд «QAQC» эрх шаардлагатай — «Хэрэглэгчдийн эрх удирдах» хэсгээс олгоно.');
  const ro = (msg: string) => ({ title: msg, onClick: () => say(msg) });

  /* ── Баганын crosshair — React state БИШ, O(1) overlay (FillNew-тэй ижил) ── */
  const colHlRef = useRef<HTMLDivElement | null>(null);
  const colHlBi = useRef<string | null>(null);
  const moveColHl = (e: React.MouseEvent<HTMLTableElement>) => {
    const hl = colHlRef.current;
    if (!hl) return;
    const td = (e.target as HTMLElement).closest?.('td[data-bi]') as HTMLElement | null;
    const bi = td?.dataset.bi ?? null;
    if (bi === colHlBi.current) return;
    colHlBi.current = bi;
    if (!td || bi == null) {
      hl.style.display = 'none';
      return;
    }
    hl.style.display = 'block';
    hl.style.left = `${td.offsetLeft}px`;
    hl.style.width = `${td.offsetWidth}px`;
  };
  const hideColHl = () => {
    colHlBi.current = null;
    if (colHlRef.current) colHlRef.current.style.display = 'none';
  };

  /* ══════════════ АЧААЛАЛТ ══════════════ */
  const loadedPkgRef = useRef('');
  const promptedPkgRef = useRef('');
  const keepDraft = useRef(false);

  const load = useCallback(async (key: string) => {
    setBusy(true);
    setErr('');
    setRows([]);
    setFlat(false);
    loadedPkgRef.current = '';
    try {
      const qRows = await loadQaqcRows(key);
      /**
       * ШАТЛАЛЫГ бөглөх хуудаснаас холбоно — ЗӨВХӨН харагдацад.
       *
       * ⚠️ Мод татагдахгүй бол QAQC хуудас УНАХГҮЙ: `catch` нь хавтгай
       *    хүснэгт үлдээнэ. Бөглөх хуудасны үйлчилгээний доголдол чанарын
       *    бөглөлтийг бүхэлд нь хаах ёсгүй.
       */
      let withTree: QaqcRow[] | null = null;
      try {
        const p = PKGS.find((x) => x.key === key);
        if (p) {
          const sc = await loadSchema(p);
          const sheet = await loadRows(p, sc);
          withTree = attachTree(qRows, sheet.rows);
        }
      } catch {
        withTree = null;
      }
      setRows(withTree ?? qRows);
      setFlat(withTree == null);
      loadedPkgRef.current = key;
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    /* ⚠️ Багц солиход хадгалаагүй засварыг ЗААВАЛ цэвэрлэнэ: түлхүүр нь
       ObjectID тул өөр хүснэгтийн ижил дугаартай мөрд наалдаж, ӨӨР БАГЦЫН
       ажилд акт бичих байлаа. */
    setPend({});
    setEditCell(null);
    setCollapsed(new Set());
    setGrpA(0);
    setGrpB(0);
    keepDraft.current = false;
    remoteQueue.current = null;
    void load(pkg.key);
  }, [pkg.key, load]);

  /* ══════════════ ШАТЛАЛЫН ШҮҮЛТ (FillNew-тэй ижил) ══════════════ */
  const [grpA, setGrpA] = useState(0);
  const [grpB, setGrpB] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const toggle = (oid: number) =>
    setCollapsed((s0) => {
      const n = new Set(s0);
      if (n.has(oid)) n.delete(oid);
      else n.add(oid);
      return n;
    });

  /** Эцэг бүлгүүд — хамгийн бага гүнтэй бүлгийн мөрүүд */
  const grpAOpts = useMemo(() => {
    const min = Math.min(...rows.filter((r) => r.group).map((r) => r.depth), 99);
    return rows
      .filter((r) => r.group && r.depth === min)
      .map((r) => ({ oid: r.oid, label: `${r.no} ${r.work}`.trim() }));
  }, [rows]);

  /** Индекс → мөрийн эцэг бүлгийн ObjectID (гүнээр) */
  const parentOf = useMemo(() => {
    const out: (number | null)[] = [];
    const stack: { oid: number; depth: number }[] = [];
    rows.forEach((r) => {
      while (stack.length && stack[stack.length - 1].depth >= r.depth) stack.pop();
      out.push(stack.length ? stack[stack.length - 1].oid : null);
      if (r.group) stack.push({ oid: r.oid, depth: r.depth });
    });
    return out;
  }, [rows]);

  /**
   * `ObjectID → мөрийн индекс`.
   * ⚠️ Удам шалгах бүрд `findIndex` дуудвал 1,400 мөр × шатлалын гүн болж
   *    бүлэг сонгох үед хуудас мэдэгдэхүйц гацдаг — нэг удаа индекслэнэ.
   */
  const idxOf = useMemo(() => {
    const m = new Map<number, number>();
    rows.forEach((r, i) => m.set(r.oid, i));
    return m;
  }, [rows]);

  /** Мөр нь сонгосон бүлгийн удам эсэх (өөрөө ч тооцогдоно) */
  const inBranch = useCallback(
    (i: number, rootOid: number): boolean => {
      let j: number | undefined = i;
      /* ⚠️ Хүрээнээс гарсан индекс — `rows[-1]` нь unhandled throw болж
         бүтэн харагдацыг унагаана (ErrorBoundary «нээгдсэнгүй» гэж зурна). */
      while (j != null && j >= 0 && j < rows.length) {
        if (rows[j].oid === rootOid) return true;
        const par = parentOf[j];
        if (par == null) return false;
        j = idxOf.get(par);
      }
      return false;
    },
    [rows, parentOf, idxOf],
  );

  /**
   * ДЭД БҮЛГҮҮД — эцэг бүлгээс НЭГ доош түвшин.
   * ⚠️ Эцэг сонгогдсон бол зөвхөн ТҮҮНИЙ доторх дэд бүлэг жагсна
   *    (`FillNew`-тэй ижил зан) — эс бөгөөс сонголт нь харагдацыг хоосон
   *    болгож, хэрэглэгч «эвдэрсэн» гэж уншина.
   */
  const grpBOpts = useMemo(() => {
    const deeper = rows.filter((r) => r.group && r.depth > 0);
    const min = Math.min(...deeper.map((r) => r.depth), 99);
    return deeper
      .filter((r) => r.depth === min)
      .filter((r) => !grpA || inBranch(idxOf.get(r.oid) ?? -1, grpA))
      .map((r) => ({ oid: r.oid, label: `${r.no} ${r.work}`.trim() }));
  }, [rows, grpA, inBranch, idxOf]);
  const grpBEff = useMemo(
    () => (grpBOpts.some((g) => g.oid === grpB) ? grpB : 0),
    [grpBOpts, grpB],
  );

  /* ── Бөглөгдөөгүй шүүлт — `FillNew`-ийн «Хуваарийн дагуу»-тай ижил үүрэг ── */
  const [onlyEmpty, setOnlyEmpty] = useState(false);

  /** Нуугдсан мөрүүд — эвхэлт ба бүлгийн шүүлтээр */
  const hidden = useMemo(() => {
    const out = new Array<boolean>(rows.length).fill(false);
    /* (1) Эвхэгдсэн бүлгийн БҮХ удам */
    for (let i = 0; i < rows.length; i += 1) {
      if (!rows[i].group || !collapsed.has(rows[i].oid)) continue;
      const d = rows[i].depth;
      for (let j = i + 1; j < rows.length && rows[j].depth > d; j += 1) out[j] = true;
    }
    /* (2) Бүлгийн сонголт — сонгосон салбараас гадна бүх мөр */
    const root = grpBEff || grpA;
    if (root) {
      for (let i = 0; i < rows.length; i += 1) {
        if (!out[i] && !inBranch(i, root)) out[i] = true;
      }
    }
    /* (3) Зөвхөн бөглөөгүй — БҮЛГИЙН мөр хэвээр (мод тасрахгүй) */
    if (onlyEmpty) {
      for (let i = 0; i < rows.length; i += 1) {
        if (!out[i] && !rows[i].group && rows[i].docs.some((x) => x != null)) out[i] = true;
      }
    }
    return out;
  }, [rows, collapsed, grpA, grpBEff, onlyEmpty, inBranch]);

  const vis = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < rows.length; i += 1) if (!hidden[i]) out.push(i);
    return out;
  }, [rows, hidden]);

  const filled = useMemo(() => filledCount(rows), [rows]);
  const emptyCount = useMemo(
    () => rows.filter((r) => !r.group && r.docs.every((x) => x == null)).length,
    [rows],
  );
  const dirtyCount = Object.keys(pend).length;

  /* ══════════════ ВИРТУАЛЧЛАЛ (FillNew-тэй ижил) ══════════════ */
  const scrollRef = useRef<HTMLDivElement>(null);
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const rowHRef = useRef(26);
  const [win, setWin] = useState({ from: 0, to: 80 });
  const OVER = 20;
  const recalcWin = useCallback(() => {
    const el = scrollRef.current;
    const tb = tbodyRef.current;
    if (!el || !tb) return;
    const first = tb.querySelector('tr[data-r]') as HTMLElement | null;
    if (first?.offsetHeight) rowHRef.current = first.offsetHeight;
    const h = rowHRef.current;
    const top = Math.max(0, el.scrollTop - tb.offsetTop);
    const from = Math.max(0, Math.floor(top / h) - OVER);
    const to = Math.ceil((top + el.clientHeight) / h) + OVER;
    setWin((w) => (w.from === from && w.to === to ? w : { from, to }));
  }, []);
  const winTick = useRef(0);
  const onScroll = useCallback(() => {
    if (winTick.current) return;
    winTick.current = requestAnimationFrame(() => {
      winTick.current = 0;
      recalcWin();
    });
  }, [recalcWin]);
  useEffect(() => {
    recalcWin();
  }, [vis, recalcWin]);
  /* ⚠️ Засагдаж буй нүдний мөр цонхны ГАДНА байвал оролт таслагдана */
  const editVis = editCell ? vis.indexOf(Number(editCell.split(':')[0])) : -1;
  const winFrom = editVis >= 0 ? Math.min(win.from, editVis) : win.from;
  const winTo = editVis >= 0 ? Math.max(win.to, editVis + 1) : win.to;

  /* ══════════════ ЗАСВАР ══════════════ */
  const commit = (oid: number, di: number, raw: string) => {
    const v = raw.trim();
    const cur = rows.find((r) => r.oid === oid)?.docs[di] ?? '';
    const key = `${oid}:${di}`;
    setPend((p) => {
      const n = { ...p };
      /* ⚠️ Хадгалагдсантай ИЖИЛ болж буцвал жагсаалтаас ХАСНА — эс бөгөөс
         «Хадгалах» товч огт өөрчлөлтгүй байхад идэвхжинэ. */
      if (v === cur) delete n[key];
      else n[key] = v;
      return n;
    });
  };

  /* ══════════════ НООРОГ — ХАДГАЛАХ ══════════════ */
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [remoteBig, setRemoteBig] = useState(false);
  const remoteQueue = useRef<{ pkg: string; draft: Draft } | null>(null);
  const [remoteTick, setRemoteTick] = useState(0);

  useEffect(() => {
    /* ⚠️ ХУУЧИН БАГЦЫН ТӨЛӨВӨӨР ШИНЭ СЛОТ РУУ БИЧИХГҮЙ — багц солигдсон
       эхний render дээр `pkg.key` ШИНЭ, харин `pend` ХУУЧИН багцынх. */
    if (loadedPkgRef.current !== pkg.key) return;
    if (!Object.keys(pend).length) {
      if (promptedPkgRef.current === pkg.key && !keepDraft.current) {
        clearDraftLS(pkg.key);
        void clearQaqcDraft(pkg.key);
      }
      setSavedAt(null);
      return;
    }
    const at = Date.now();
    setSavedAt(at);
    const usedOids = new Set<number>();
    for (const k of Object.keys(pend)) {
      const o = Number(k.slice(0, k.indexOf(':')));
      if (Number.isFinite(o)) usedOids.add(o);
    }
    const rowKeys: [number, string][] = [];
    for (const r of rows) if (usedOids.has(r.oid)) rowKeys.push([r.oid, `${r.no} ¦ ${r.work}`]);
    const draft: Draft = { t: at, cells: Object.entries(pend), rowKeys };
    saveDraftLS(pkg.key, draft);
    /* ⚠️ Алсад ЭНД ШУУД бичихгүй — нүд бүрийн товшилтод хүсэлт явбал
       сүлжээ дүүрч бөглөлт удаашрана. Доорх завсарлагатай эффект илгээнэ. */
    remoteQueue.current = { pkg: pkg.key, draft };
    setRemoteTick((n) => n + 1);
  }, [pend, pkg.key, rows]);

  /* ── АЛСЫН ХУУЛБАР — 12 секундын завсарлагатай (FillNew-тэй ижил) ── */
  useEffect(() => {
    if (!remoteTick) return;
    const t = setTimeout(() => {
      const q = remoteQueue.current;
      if (!q) return;
      const payload = JSON.stringify(q.draft);
      if (payload.length > QAQC_REMOTE_MAX) {
        setRemoteBig(true);
        return;
      }
      setRemoteBig(false);
      void saveQaqcDraft(q.pkg, q.draft.t, payload);
    }, 12_000);
    /* ⚠️ Таб хаагдах/нуугдахад ЯГ ОДОО илгээнэ — 12 секунд хүлээвэл
       компьютер унтрахад тэр хугацааны ажил алсад хүрэхгүй. */
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return;
      const q = remoteQueue.current;
      if (!q) return;
      const payload = JSON.stringify(q.draft);
      if (payload.length <= QAQC_REMOTE_MAX) {
        void saveQaqcDraft(q.pkg, q.draft.t, payload);
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearTimeout(t);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [remoteTick]);

  /* ══════════════ НООРОГ — СЭРГЭЭХ ══════════════ */
  const [restore, setRestore] = useState<RestorePlan | null>(null);

  useEffect(() => {
    if (loadedPkgRef.current !== pkg.key || !rows.length) return;
    if (promptedPkgRef.current === pkg.key) return;
    promptedPkgRef.current = pkg.key;
    let alive = true;

    (async () => {
      const local = readDraft(pkg.key);
      /* ⚠️ ЛОКАЛ ба АЛСЫН хоёрыг АГШНААР харьцуулж ШИНИЙГ нь сонгоно —
         хуучныг тавибал өөр машин дээрх шинэ ажил чимээгүй дарагдана. */
      const rem = await loadQaqcDraft(pkg.key);
      if (!alive) return;
      const remD = rem ? parseDraft(rem.payload) : null;
      const pick: { d: Draft; source: 'local' | 'remote' } | null =
        local && remD
          ? (remD.t > local.t ? { d: remD, source: 'remote' } : { d: local, source: 'local' })
          : local
            ? { d: local, source: 'local' }
            : remD
              ? { d: remD, source: 'remote' }
              : null;
      if (!pick) return;

      /* ⚠️ Мөр нь БАЙГАА эсэхийг шалгана: хүснэгт AGOL дээр дахин үүсгэгдвэл
         ObjectID гулсах бөгөөд ноорог буруу ажилд буух ёсгүй. Танигч
         хадгалагдсан бол түүнийг ч тулгана. */
      const byOid = new Map(rows.map((r) => [r.oid, r]));
      const keyOf = new Map(pick.d.rowKeys ?? []);
      const cells: Record<string, string> = {};
      let dropped = 0;
      for (const [k, v] of (canEdit ? pick.d.cells : [])) {
        const cut = k.lastIndexOf(':');
        const oid = Number(k.slice(0, cut));
        const di = Number(k.slice(cut + 1));
        const r = byOid.get(oid);
        const want = keyOf.get(oid);
        if (
          !r
          || !Number.isInteger(di) || di < 0 || di >= QAQC_COLS.length
          || (want != null && want !== `${r.no} ¦ ${r.work}`)
        ) {
          dropped += 1;
          continue;
        }
        cells[k] = v;
      }
      const count = Object.keys(cells).length;
      if (!count && !dropped) {
        clearDraftLS(pkg.key);
        void clearQaqcDraft(pkg.key);
        return;
      }
      setRestore({
        when: new Date(pick.d.t).toLocaleString('mn-MN'),
        source: pick.source,
        count,
        dropped,
        cells,
      });
    })();

    return () => { alive = false; };
  }, [rows, pkg.key, canEdit]);

  const applyRestore = useCallback(() => {
    if (!restore) return;
    setPend(restore.cells);
    keepDraft.current = false;
    setRestore(null);
  }, [restore]);
  const dropRestore = useCallback(() => {
    clearDraftLS(pkg.key);
    void clearQaqcDraft(pkg.key);
    keepDraft.current = false;
    setRestore(null);
  }, [pkg.key]);
  const laterRestore = useCallback(() => {
    /* ⚠️ Хадгалалтын эффект нь төлөв хоосон үед ноорогийг УСТГАДАГ тул туг
       тавьж хамгаална — эс бөгөөс цонхыг хаамагц ажил чимээгүй алга болно. */
    keepDraft.current = true;
    setRestore(null);
  }, []);

  /* ══════════════ ХАДГАЛАХ ══════════════ */
  const save = useCallback(async () => {
    if (busy || !dirtyCount) return;
    if (!canEdit) {
      setErr(RO_CAP);
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const known = new Set(rows.map((r) => r.oid));
      const { updates, skipped } = qaqcUpdates(pend, known);
      /* ⚠️ Нэг ч түлхүүр таарахгүй бол ЗОГСООНО. Чимээгүй алгасвал
         «хадгаллаа» гэж худал мэдээлж, бөглөсөн акт алга болно. */
      if (skipped.length) {
        throw new Error(
          tr('{0} нүд хуудасны мөрүүдэд таарсангүй (хүснэгт хооронд нь шинэчлэгдсэн байж магадгүй). Хуудсыг дахин ачаална уу — засвар хадгалагдаагүй.', skipped.length),
        );
      }
      const n = await saveQaqc(pkg.key, updates);
      setPend({});
      setEditCell(null);
      clearDraftLS(pkg.key);
      void clearQaqcDraft(pkg.key);
      /* ⚠️ Хадгалсны дараа ЗААВАЛ дахин татна: хооронд нь өөр хүн бөглөсөн
         байж болно. Дэлгэц ба өгөгдөл зөрвөл дараагийн засвар хуучин суурин
         дээр явна. */
      await load(pkg.key);
      done(tr('{0} мөр хадгалагдлаа.', n));
    } catch (e) {
      setErr(String((e as Error).message || e));
      /* ⚠️ Хагас бичигдсэн байж болзошгүй тул дэлгэцийг СЕРВЕРЭЭС сэргээнэ. */
      void load(pkg.key);
    } finally {
      setBusy(false);
    }
  }, [busy, dirtyCount, canEdit, rows, pend, pkg.key, load, done, RO_CAP]);

  /* Ctrl+S — бөглөх хуудастай ижил */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      void save();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [save]);

  /* ⚠️ Хадгалаагүй засвартай байхад таб хаагдвал ажил алга болно */
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (!Object.keys(pend).length) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [pend]);

  /** Багц солиход хадгалаагүй засвар байвал баталгаа авна */
  const confirmSwitch = () =>
    dirtyCount === 0
    || window.confirm(tr('{0} нүд хадгалагдаагүй байна. Ноорог үлдэх ч багц солиход дэлгэцээс арилна. Үргэлжлүүлэх үү?', dirtyCount));

  /* ══════════════ ЗУРАГДАЛТ ══════════════ */

  /*
   * ⚠️ Томилгоогүй хэрэглэгчид ХООСОН хуудас БИШ, шалтгааныг ил хэлнэ —
   *    `FillNew`-тэй ижил (тайлбаргүй хоосон сонгогч «эвдэрсэн» гэж уншигдана).
   */
  if (groupOpts.length === 0) {
    return (
      <div className={st.wrap}>
        <div className={st.error} role="status">
          {tr('Танд нэг ч багц хуваарилагдаагүй байна. «Хэрэглэгчдийн эрх удирдах → Гүйцэтгэлийн урсгал» хэсэгт админ таныг шатанд томилж, багц зааж өгсний дараа энэ хуудас нээгдэнэ.')}
        </div>
      </div>
    );
  }

  const noTable = qaqcTableOf(pkg.key) == null;

  return (
    <div className={st.wrap}>
      <div className={st.toolbar}>
        <label className={st.field}>
          {tr('Багц')}{' '}
          <select
            className={st.select}
            value={pkg.group}
            disabled={busy}
            onChange={(e) => {
              if (!confirmSwitch()) return;
              setPkg(pkgFloors(e.target.value)[0]);
            }}
          >
            {groupOpts.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>

        {/* ⚠️ «Хувилбар» нь БАРИЛГЫН давхрын тоо (9F/12F) — модны гүнтэй
            андуурч «Давхар» гэж нэрлэхээс зайлсхийсэн. Хувилбар бүр ӨӨР
            QAQC хүснэгттэй тул нэгтгэж харуулбал акт буруу барилгад бичигдэнэ. */}
        {floorOpts.length > 1 && (
          <label className={st.field}>
            {tr('Хувилбар')}{' '}
            <select
              className={st.select}
              value={pkg.key}
              disabled={busy}
              onChange={(e) => {
                if (!confirmSwitch()) return;
                setPkg(PKGS.find((p) => p.key === e.target.value) ?? pkg);
              }}
            >
              {floorOpts.map((p) => (
                <option key={p.key} value={p.key}>{p.floors}F</option>
              ))}
            </select>
          </label>
        )}

        <label className={st.field}>
          {tr('Бүлэг')}{' '}
          <select
            className={cls('select selectWide')}
            value={grpA}
            disabled={busy}
            onChange={(e) => setGrpA(Number(e.target.value))}
            title={tr('Зөвхөн сонгосон бүлэг ба түүний доод ажлууд харагдана')}
          >
            <option value={0}>{tr('Бүгд')}</option>
            {grpAOpts.map((g) => (
              <option key={g.oid} value={g.oid}>{g.label}</option>
            ))}
          </select>
        </label>

        <label className={st.field}>
          {tr('Дэд бүлэг')}{' '}
          <select
            className={cls('select selectWide')}
            value={grpBEff}
            disabled={busy}
            onChange={(e) => setGrpB(Number(e.target.value))}
            title={tr('Тухайн бүлгийн доторх нэг дэд бүлгийг сонгоно')}
          >
            <option value={0}>{tr('Бүгд')}</option>
            {grpBOpts.map((g) => (
              <option key={g.oid} value={g.oid}>{g.label}</option>
            ))}
          </select>
        </label>

        {/* ⚠️ Тоо нь ИЛ: «212 / 1,370» гэж харуулахгүй бол цөөн мөр гарахад
            хүснэгт эвдэрсэн мэт уншигдана (FillNew-ийн «Хуваарийн дагуу»-тай
            ижил шийдэл). */}
        <button
          className={cls(onlyEmpty ? 'layerBtn layerBtnOn' : 'layerBtn')}
          disabled={busy}
          onClick={() => setOnlyEmpty((v) => !v)}
          title={tr('Нэг ч баримт бөглөгдөөгүй ажлын мөрүүдийг л харуулна. Бүлгийн мөр хэвээр үлдэнэ — эс бөгөөс шатлал тасарна.')}
        >
          {tr('Зөвхөн бөглөөгүй')}{' '}
          <span className={st.layerBtnN}>
            {emptyCount.toLocaleString()} / {rows.length.toLocaleString()}
          </span>
        </button>

        {resized && (
          <button
            className={st.layerBtn}
            onClick={resetAll}
            title={tr('Чирж өөрчилсөн бүх баганы өргөнийг анхны хэмжээнд нь буцаана')}
          >
            {tr('Өргөн сэргээх')}
          </button>
        )}

        <button
          className={st.publishBtn}
          onClick={() => void save()}
          disabled={busy || dirtyCount === 0 || !canEdit}
          title={canEdit
            ? tr('Өөрчилсөн нүдийг QAQC үйлчилгээнд бичнэ (Ctrl+S)')
            : RO_CAP}
        >
          {tr('Хадгалах')}{dirtyCount ? ` (${dirtyCount})` : ''}
        </button>

        {busy && <span className={st.muted}>{tr('ажиллаж байна…')}</span>}

        {savedAt != null && dirtyCount > 0 && (
          <span
            className={st.autosave}
            title={tr('Ноорог энэ хөтөчид, мөн ArcGIS-д хадгалагдана — өөр компьютероос нэвтэрсэн ч сэргээх боломжтой. Үйлчилгээнд бичихийн тулд «Хадгалах» дарна.')}
          >
            {tr('ноорог хадгалагдав {0}', new Date(savedAt).toLocaleTimeString('mn-MN', { hour: '2-digit', minute: '2-digit' }))}
          </span>
        )}
        {remoteBig && (
          <span className={st.autosaveWarn} role="status">
            {tr('Ноорог хэт том тул зөвхөн энэ компьютерт хадгалагдлаа.')}
          </span>
        )}
        {rows.length > 0 && (
          <span className={st.muted}>
            {tr('{0} нүд бөглөгдсөн', filled.toLocaleString())}
          </span>
        )}
      </div>

      {!canEdit && (
        <p className={st.lockNote}>
          {tr('Зөвхөн харах горим — чанарын баримт бөглөхөд «QAQC» эрх шаардлагатай.')}
        </p>
      )}
      {/* ⚠️ ХАВТГАЙ ЗУРАГДСАНЫГ ил хэлнэ: эгнүүлэлтгүй 1,400 мөр нь «бүтэц
          эвдэрсэн» гэж уншигдана, шалтгааныг мэдэхгүй бол хэрэглэгч
          өгөгдөлдөө эргэлзэнэ. */}
      {flat && rows.length > 0 && (
        <p className={st.lockNote}>
          {tr('Ажлын шатлал татагдсангүй тул хүснэгт хавтгай харагдаж байна — бүлгийн шүүлт ба эвхэлт ажиллахгүй. Бөглөлт хэвийн хэвээр.')}
        </p>
      )}
      {err && <p className={st.error} role="alert">{err}</p>}

      {busy && rows.length === 0 && (
        <div className={st.scroll}>
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className={st.skeletonRow}>
              <div className={st.skeletonCell} style={{ width: 40 }} />
              <div className={st.skeletonCell} style={{ width: 280 }} />
              <div className={st.skeletonCell} style={{ flex: 1 }} />
            </div>
          ))}
        </div>
      )}

      {!busy && !err && noTable && (
        <p className={st.muted}>
          {tr('Энэ багцын QAQC хүснэгт тодорхойлогдоогүй байна.')}
        </p>
      )}
      {!busy && !err && !noTable && rows.length === 0 && (
        <p className={st.muted}>{tr('Энэ багцад мөр олдсонгүй.')}</p>
      )}

      {rows.length > 0 && (
        <div className={st.scroll} ref={scrollRef} onScroll={onScroll}>
          <div className={st.tableWrap}>
            <div ref={colHlRef} className={st.colHl} aria-hidden="true" />
            <table
              className={cls('xl b32')}
              style={colStyle}
              onMouseOver={moveColHl}
              onMouseLeave={hideColHl}
            >
              {/* ТОЛГОЙ — excel-ийн эх загвараар 3 мөрт бүлэглэсэн:
                  банд → бүлэг → баганын нэр. `FillNew`-ийн 4 мөрт толгойтой
                  ижил механизм (`.b32` дэх наалдалтын шилжилт). */}
              <thead>
                <tr>
                  <th rowSpan={3} className={cls('fz c-no')}>№<i {...grip('no')} /></th>
                  <th rowSpan={3} className={cls('fz c-ajil')}>{tr('Ажил')}<i {...grip('ajil')} /></th>
                  <th colSpan={QAQC_COLS.length} className={cls('band')}>{tr(QAQC_BAND)}</th>
                </tr>
                <tr>
                  {QAQC_GROUPS.map((g) => (
                    <th key={g.label} colSpan={g.count} className={cls('band2')}>{tr(g.label)}</th>
                  ))}
                </tr>
                <tr>
                  {QAQC_COLS.map((c) => (
                    <th key={c.name} className={cls('c-doc')} title={tr(c.label)}>
                      {tr(c.short)}<i {...grip('doc')} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody ref={tbodyRef}>
                {vis.length === 0 && (
                  <tr>
                    <td colSpan={2 + QAQC_COLS.length} className={st.hint} style={{ padding: '14px 10px' }}>
                      {onlyEmpty
                        ? tr('Бүх ажилд баримт бөглөгдсөн байна. Бүгдийг харах бол «Зөвхөн бөглөөгүй»-г унтраа.')
                        : tr('Шүүлтэд тохирох мөр алга — «Бүлэг»-ийг «Бүгд» болгоно уу.')}
                    </td>
                  </tr>
                )}
                {/* Дээд ЧИГЖЭЭС — зурагдаагүй мөрүүдийн өндрийг орлоно */}
                {winFrom > 0 && (
                  <tr aria-hidden="true" style={{ height: winFrom * rowHRef.current }}>
                    <td colSpan={2 + QAQC_COLS.length} style={{ padding: 0, border: 0 }} />
                  </tr>
                )}
                {vis.slice(winFrom, winTo).map((i) => {
                  const r = rows[i];
                  return (
                    <Fragment key={r.oid}>
                      <tr data-r={i} className={r.group ? st.cat : undefined}>
                        <td className={cls('num fz c-no')} {...ro(RO_NO)}>{r.no}</td>
                        <td
                          className={cls('fz c-ajil')}
                          style={{ paddingLeft: `${r.depth * 14 + 6}px` }}
                          {...ro(RO_NO)}
                          title={r.des ? `${r.work} · ${r.des}` : r.work}
                        >
                          {r.group && (
                            <button
                              type="button"
                              className={st.caret}
                              aria-expanded={!collapsed.has(r.oid)}
                              aria-label={collapsed.has(r.oid) ? tr('Дэлгэх') : tr('Эвхэх')}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggle(r.oid);
                              }}
                            >
                              {collapsed.has(r.oid) ? '▸' : '▾'}
                            </button>
                          )}
                          {r.work}
                        </td>
                        {/* ── БАРИМТ БИЧИГ — дарж текст бичнэ ──
                            ⚠️ Бүлгийн мөрд ч засагдана: М-акт, FIC зэрэг нь
                            ажлын БҮЛЭГТ олгогдож болох тул хориглосонгүй. */}
                        {QAQC_COLS.map((dc, di) => {
                          const key = `${r.oid}:${di}`;
                          const ekey = `${i}:${di}`;
                          const editing = editCell === ekey;
                          const val = key in pend ? pend[key] : (r.docs[di] ?? '');
                          return (
                            <td
                              key={dc.name}
                              data-bi={`d${di}`}
                              className={cls(
                                'c-doc docCell'
                                + (canEdit ? ' cursor-cell' : '')
                                + (key in pend ? ' dirty' : ''),
                              )}
                              title={canEdit ? tr('{0} — дарж бичнэ', tr(dc.label)) : RO_CAP}
                              onClick={() => {
                                if (!canEdit) return say(RO_CAP);
                                setEditCell(ekey);
                              }}
                            >
                              {editing ? (
                                <input
                                  autoFocus
                                  type="text"
                                  maxLength={4000}
                                  className={st.cellInputLine}
                                  defaultValue={val}
                                  onBlur={(e) => {
                                    commit(r.oid, di, e.target.value);
                                    setEditCell(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape') return setEditCell(null);
                                    if (e.key === 'Enter' || e.key === 'Tab') {
                                      e.preventDefault();
                                      commit(r.oid, di, e.currentTarget.value);
                                      setEditCell(null);
                                    }
                                  }}
                                />
                              ) : (
                                <span className={st.docText}>{val}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    </Fragment>
                  );
                })}
                {winTo < vis.length && (
                  <tr aria-hidden="true" style={{ height: (vis.length - winTo) * rowHRef.current }}>
                    <td colSpan={2 + QAQC_COLS.length} style={{ padding: 0, border: 0 }} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ХӨВӨГЧ МЭДЭГДЭЛ — засагдахгүй шалтгаан ба үр дүн (FillNew-тэй ижил) */}
      {notice && (
        <div
          className={`${st.notice} ${notice.kind === 'ok' ? st.noticeOk : notice.kind === 'warn' ? st.noticeWarn : ''}`}
          role={notice.kind === 'ro' ? 'status' : 'alert'}
          onClick={() => setNotice(null)}
        >
          <b>
            {notice.kind === 'ok' ? '✓ ' : notice.kind === 'warn' ? '⚠ ' : ''}
            {notice.kind === 'ro' ? tr('Энэ нүд засагдахгүй.') : ''}
          </b>
          {' '}{notice.msg}
        </div>
      )}

      {restore && (
        <RestoreModal
          plan={restore}
          onRestore={applyRestore}
          onLater={laterRestore}
          onDrop={dropRestore}
        />
      )}
    </div>
  );
}
