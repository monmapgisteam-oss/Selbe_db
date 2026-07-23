'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addAttachment,
  agsFetch,
  applySections,
  attachmentUrl,
  base,
  deleteAttachment,
  distinct,
  listAttachments,
  qesc,
  queryAll,
  type AttachInfo,
  type Feature,
} from "./ags";
import st from "./sheet.module.css";

// Join space-separated table token names to their CSS-module class names,
// preserving the source's verbatim class strings (e.g. "num fz c-no").
const cls = (names: string) =>
  names
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => st[n] || n)
    .join(" ");

// Excel-replica view: the flat ArcGIS rows pivoted like the source spreadsheet.
// Rows = tasks (Ажил) in sheet order (by FID), grouped by Ангилал_А_/Б_ with
// category header rows; columns = buildings (Барилга_Блок); cells = completion %
// (Гүйцэтгэл____). A (Багц, Огноо) pair selects one sheet (~1364 rows < 2000 cap).
//
// Cells are editable: each cell is one feature (FID). Click a filled cell to
// change its %, clear it to delete the feature, or type into an empty cell to
// add one (copying the row's task/slice metadata). Requires the layer's
// Update/Create/Delete capabilities enabled.

const F = {
  bagts: "Багц",
  ognoo: "Огноо",
  ver: "Хувилбар",
  work: "Ажил",
  level: "Түвшин",
  catA: "Ангилал__А_",
  catB: "Ангилал__Б_",
  weight: "Хувийн_жин",
  totw: "Нийт_жин",
  bld: "Барилга_Блок",
  pct: "Гүйцэтгэл____",
  oid: "ObjectID",
} as const;

type Cell = { fid: number; pct: number | null; date: string };
type Row = {
  work: string;
  level: number;
  weight: number | null;
  totw: number | null; // Нийт_жин: global weight (leaf tasks sum to ~1)
  tmpl: Record<string, unknown>; // identity + slice fields, for adding cells
  cells: Record<string, Cell>;
};

const s = (v: unknown) => (v == null ? "" : String(v));
const pct = (v: number | null) => (v == null ? "" : Math.round(v * 100) + "%");
// Original cell value as an integer-percent string ("" when empty).
const origStr = (row: Row, bld: string) => {
  const p = row.cells[bld]?.pct;
  return p == null ? "" : String(Math.round(p * 100));
};

// Cell backgrounds: editable cells stay on the surface; calculated columns and
// non-editable (header) cells get their own tint. Values reference theme-aware
// CSS custom properties defined on `.xl` so they flip for light/dark.
const CALC_BG = "var(--sheet-calc)"; // Хийгдсэн / Дутуу (calculated)
const CELL_BG = "var(--sheet-cell)"; // editable % cells
const HL_BG = "var(--sheet-hl)"; // row/column crosshair highlight
const SEL_BG = "var(--sheet-sel)"; // drag-selected range
const DIRTY_BG = "var(--sheet-dirty)"; // edited, not yet published (green)
const HEADER_BG = "var(--sheet-header)"; // non-editable header/group rows

export default function Pivot() {
  const [bagtsList, setBagtsList] = useState<string[]>([]);
  const [ognooList, setOgnooList] = useState<string[]>([]);
  const [bagts, setBagts] = useState("");
  const [ognoo, setOgnoo] = useState("");
  const [feats, setFeats] = useState<Feature[]>([]);
  // Canonical row order (section + job position) taken from the fullest single
  // upload, so multi-version/multi-building unions don't scatter rows. See
  // loadSlice for how it's built and the rows useMemo for how it sorts.
  const [tmpl, setTmpl] = useState<{
    sec: Map<string, number>;
    job: Map<string, number>;
  }>({ sec: new Map(), job: new Map() });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<{ ri: number; bld: string } | null>(null);
  const [val, setVal] = useState("");
  const [hover, setHover] = useState<{ ri: number; bld: string } | null>(null);
  // Cell range selection (Excel-like). a = anchor, f = focus.
  const [sel, setSel] = useState<{
    a: { ri: number; b: string };
    f: { ri: number; b: string };
  } | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [fill, setFill] = useState<string | null>(null); // typed value over a range
  // Right-click context menu.
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    kind: "cell";
    ri?: number;
    bld?: string;
    row?: Row;
  } | null>(null);
  // Uncommitted cell edits, keyed `${ri}:${bld}`. Value = raw % string
  // ("" means delete). Applied to the service only on Publish.
  const [pending, setPending] = useState<Record<string, string>>({});
  // Undo/redo history of `pending` snapshots.
  const [undoStack, setUndoStack] = useState<Record<string, string>[]>([]);
  const [redoStack, setRedoStack] = useState<Record<string, string>[]>([]);
  // Locally-added structure (created on Publish, cleared on reload).
  const [extraBuildings, setExtraBuildings] = useState<string[]>([]);
  const [extraRows, setExtraRows] = useState<
    { work: string; weight: number; header: boolean }[]
  >([]);
  // Per-cell attachment panel (one cell = one feature).
  const [attach, setAttach] = useState<{ ri: number; bld: string } | null>(
    null,
  );
  const [attList, setAttList] = useState<AttachInfo[]>([]);
  const [attBusy, setAttBusy] = useState(false);
  const [attErr, setAttErr] = useState("");
  // Images picked for not-yet-published (new) cells, keyed `${ri}:${bld}`.
  // Uploaded as attachments right after Publish creates each feature.
  const [pendingFiles, setPendingFiles] = useState<
    Record<string, { file: File; url: string }[]>
  >({});

  // Багц list once.
  useEffect(() => {
    if (!base) return;
    distinct("Багц")
      .then((v) => {
        const list = (v as string[]).filter(Boolean).sort();
        setBagtsList(list);
        setBagts((b) => b || list[0] || "");
      })
      .catch((e) => setErr(String(e)));
  }, []);

  // Огноо list per Багц.
  useEffect(() => {
    if (!bagts) return;
    distinct("Огноо", `Багц='${qesc(bagts)}'`)
      .then((v) => {
        const list = (v as string[]).filter(Boolean).sort();
        setOgnooList(list);
        setOgnoo(list[list.length - 1] || ""); // latest = current state
      })
      .catch((e) => setErr(String(e)));
  }, [bagts]);

  const loadSlice = useCallback(async () => {
    if (!bagts || !ognoo) return;
    setErr("");
    setBusy(true);
    try {
      // As-of: every row up to the selected date, reduced to the latest value
      // per (task, building). Огноо is 'YYYY-MM-DD' string so lexical order =
      // chronological; iterating ascending, the last write per cell wins.
      const all = await queryAll(
        `Багц='${qesc(bagts)}' AND Огноо<='${qesc(ognoo)}'`,
        {
          outFields: Object.values(F).join(","),
          orderByFields: `${F.ognoo} ASC, ${F.oid} ASC`,
        },
      );
      // Stamp section identity into Ангилал__Б_ (floor sections reuse job
      // names — without this the win-map merges distinct floor rows).
      applySections(all);
      // Canonical order template. The pivot draws from a union of every date
      // and version, whose ObjectID order does NOT follow one clean sheet — so
      // rows for later floors (whose jobs a partial early upload never placed)
      // end up scattered/piled at the bottom ("mis-pivoted"). Take the fullest
      // single upload batch (Огноо|Хувилбар|Барилга_Блок) as the authoritative
      // sheet order: record where each section (Ангилал__Б_) and each job first
      // appears, then sort every pivot row by it. Jobs missing from the
      // reference still sort under their own section (shared section order), so
      // building-group naming differences land beside their floor, not adrift.
      const batchMap = new Map<string, Feature[]>();
      for (const f of all) {
        const a = f.attributes;
        const bk = `${s(a[F.ognoo])}|${s(a[F.ver])}|${s(a[F.bld])}`;
        const arr = batchMap.get(bk);
        if (arr) arr.push(f);
        else batchMap.set(bk, [f]);
      }
      let ref: Feature[] = [];
      for (const b of batchMap.values()) if (b.length > ref.length) ref = b;
      const secOrder = new Map<string, number>();
      const jobOrder = new Map<string, number>();
      for (const f of ref) {
        const a = f.attributes;
        const cb = s(a[F.catB]);
        if (!secOrder.has(cb)) secOrder.set(cb, secOrder.size);
        const jk = `${cb}|${s(a[F.work])}`;
        if (!jobOrder.has(jk)) jobOrder.set(jk, jobOrder.size);
      }
      // Sections present only in other buildings: append after the reference's.
      for (const f of all) {
        const cb = s(f.attributes[F.catB]);
        if (!secOrder.has(cb)) secOrder.set(cb, secOrder.size);
      }
      setTmpl({ sec: secOrder, job: jobOrder });
      const win = new Map<string, Feature>();
      for (const f of all) {
        const a = f.attributes;
        const k = `${s(a[F.level])}|${s(a[F.catA])}|${s(a[F.catB])}|${s(a[F.work])}|${s(a[F.bld])}`;
        win.set(k, f);
      }
      setFeats([...win.values()]);
      setPending({}); // discard uncommitted edits on (re)load
      setPendingFiles((m) => {
        Object.values(m)
          .flat()
          .forEach((f) => URL.revokeObjectURL(f.url));
        return {};
      });
      setUndoStack([]);
      setRedoStack([]);
      setExtraRows([]);
      setExtraBuildings([]);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }, [bagts, ognoo]);

  useEffect(() => {
    (async () => {
      await loadSlice();
    })();
  }, [loadSlice]);

  // Version of the current slice (features share one); default 1 for new багц.
  const sliceVer = feats[0] ? Number(feats[0].attributes[F.ver]) || 1 : 1;

  const { buildings, rows } = useMemo(() => {
    const blds = [
      ...new Set([
        ...feats.map((f) => s(f.attributes[F.bld])),
        ...extraBuildings,
      ]).values(),
    ]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    // Group by task identity (FID order preserved from the query).
    const map = new Map<string, Row>();
    for (const f of feats) {
      const a = f.attributes;
      const key = `${s(a[F.level])}|${s(a[F.catA])}|${s(a[F.catB])}|${s(a[F.work])}`;
      let r = map.get(key);
      if (!r) {
        r = {
          work: s(a[F.work]),
          level: Number(a[F.level]) || 0,
          weight: a[F.weight] == null ? null : Number(a[F.weight]),
          totw: a[F.totw] == null ? null : Number(a[F.totw]),
          tmpl: {
            [F.bagts]: a[F.bagts],
            [F.ognoo]: a[F.ognoo],
            [F.ver]: a[F.ver],
            [F.level]: a[F.level],
            [F.work]: a[F.work],
            [F.catA]: a[F.catA],
            [F.catB]: a[F.catB],
            [F.weight]: a[F.weight],
            [F.totw]: a[F.totw],
          },
          cells: {},
        };
        map.set(key, r);
      }
      const bld = s(a[F.bld]);
      if (bld)
        r.cells[bld] = {
          fid: Number(a[F.oid]),
          pct: a[F.pct] == null ? null : Number(a[F.pct]),
          date: s(a[F.ognoo]),
        };
    }
    const list = [...map.values()];
    // Locally-added rows (jobs / job-headers), created on Publish.
    for (const er of extraRows) {
      list.push({
        work: er.work,
        level: er.header ? 1 : 3,
        weight: er.weight,
        totw: null, // locally-added row: no global weight yet
        tmpl: {
          [F.bagts]: bagts,
          [F.ognoo]: ognoo,
          [F.ver]: sliceVer,
          [F.level]: er.header ? 1 : 3,
          [F.work]: er.work,
          [F.catA]: null,
          [F.catB]: null,
          [F.weight]: er.weight,
        },
        cells: {},
      });
    }
    // Reorder into canonical sheet order: section first, then job within it,
    // falling back to source order (stable) for anything the template misses.
    // Keeps floor sections and their jobs together across the version union.
    const BIG = 1e9;
    const secIdx = (r: Row) => tmpl.sec.get(s(r.tmpl[F.catB])) ?? BIG;
    const jobIdx = (r: Row) =>
      tmpl.job.get(`${s(r.tmpl[F.catB])}|${s(r.work)}`) ?? BIG;
    const ordered = list
      .map((r, i) => ({ r, i }))
      .sort(
        (x, y) =>
          secIdx(x.r) - secIdx(y.r) ||
          jobIdx(x.r) - jobIdx(y.r) ||
          x.i - y.i,
      )
      .map((d) => d.r);
    return { buildings: blds, rows: ordered };
  }, [feats, extraBuildings, extraRows, bagts, ognoo, sliceVer, tmpl]);

  // Excel "Гүйцэтгэлийн хувь": AVERAGE over all building columns, blanks = 0.
  // Uses pending edits so the row total updates live before publishing.
  const effDone = (ri: number, r: Row) => {
    if (!buildings.length) return null;
    let sum = 0;
    for (const b of buildings) {
      const key = `${ri}:${b}`;
      const raw = key in pending ? pending[key] : origStr(r, b);
      sum += raw === "" ? 0 : Number(raw) / 100;
    }
    return sum / buildings.length;
  };

  // Header = not a leaf task. Түвшин is the signal (floor headers carry junk
  // weights like 0/2); Түвшин-3 section rows carry weight exactly 1.
  const isHeaderRow = (r: Row) =>
    r.level !== 3 || (r.weight != null && Math.abs(r.weight - 1) < 1e-6);

  // Footer averages (over leaf tasks only, blanks = 0), pending-aware.
  const leafRows = rows
    .map((r, ri) => ({ r, ri }))
    .filter(({ r }) => !isHeaderRow(r));
  const avg = (fn: (r: Row, ri: number) => number) =>
    leafRows.length
      ? leafRows.reduce((s, { r, ri }) => s + fn(r, ri), 0) / leafRows.length
      : null;
  const doneAvg = avg((r, ri) => effDone(ri, r) ?? 0);

  // Next editable (non-header) row index in a direction, or -1.
  const nextEditable = (from: number, step: number) => {
    for (let i = from + step; i >= 0 && i < rows.length; i += step)
      if (!isHeaderRow(rows[i])) return i;
    return -1;
  };
  // Open a cell for editing, prefilled with its effective value.
  const openCell = (ri: number, b: string) => {
    const r = rows[ri];
    if (!r) return setEdit(null);
    const key = `${ri}:${b}`;
    setVal(key in pending ? pending[key] : origStr(r, b));
    setEdit({ ri, bld: b });
  };

  // --- range selection ---
  const biOf = (b: string) => buildings.indexOf(b);
  const selRect = () => {
    if (!sel) return null;
    return {
      r0: Math.min(sel.a.ri, sel.f.ri),
      r1: Math.max(sel.a.ri, sel.f.ri),
      c0: Math.min(biOf(sel.a.b), biOf(sel.f.b)),
      c1: Math.max(biOf(sel.a.b), biOf(sel.f.b)),
    };
  };
  const inSel = (ri: number, b: string) => {
    const q = selRect();
    if (!q) return false;
    const bi = biOf(b);
    return ri >= q.r0 && ri <= q.r1 && bi >= q.c0 && bi <= q.c1;
  };
  const isFocus = (ri: number, b: string) =>
    !!sel && sel.f.ri === ri && sel.f.b === b;
  // Editable (non-header) cells inside the selection.
  const selectedCells = () => {
    const q = selRect();
    const out: { ri: number; b: string; row: Row }[] = [];
    if (!q) return out;
    for (let ri = q.r0; ri <= q.r1; ri++) {
      const row = rows[ri];
      if (!row || isHeaderRow(row)) continue;
      for (let ci = q.c0; ci <= q.c1; ci++) out.push({ ri, b: buildings[ci], row });
    }
    return out;
  };
  function applyToSelection(value: string) {
    const cells = selectedCells();
    if (!cells.length) return;
    setUndoStack((u) => [...u, pending]);
    setRedoStack([]);
    setPending((p) => {
      const n = { ...p };
      for (const c of cells) {
        const key = `${c.ri}:${c.b}`;
        const orig = origStr(c.row, c.b);
        if (value.trim() === orig) delete n[key];
        else n[key] = value.trim();
      }
      return n;
    });
  }

  // Stage a cell edit locally (no service call). Drop the key if it matches the
  // original so Publish stays clean. Pushes an undo snapshot.
  function commitEdit(row: Row, ri: number, bld: string, raw: string) {
    setEdit(null);
    const key = `${ri}:${bld}`;
    const orig = origStr(row, bld);
    const next = { ...pending };
    if (raw.trim() === orig) delete next[key];
    else next[key] = raw.trim();
    if (JSON.stringify(next) === JSON.stringify(pending)) return; // no change
    setUndoStack((u) => [...u, pending]);
    setRedoStack([]);
    setPending(next);
  }

  function undo() {
    if (!undoStack.length) return;
    setRedoStack((r) => [...r, pending]);
    setPending(undoStack[undoStack.length - 1]);
    setUndoStack((u) => u.slice(0, -1));
    setEdit(null);
  }
  function redo() {
    if (!redoStack.length) return;
    setUndoStack((u) => [...u, pending]);
    setPending(redoStack[redoStack.length - 1]);
    setRedoStack((r) => r.slice(0, -1));
    setEdit(null);
  }
  // Open the attachment panel for a cell. Existing feature → load its server
  // attachments; new (unpublished) cell → its images live in pendingFiles.
  async function openAttach(ri: number, bld: string) {
    setAttach({ ri, bld });
    setAttErr("");
    setAttList([]);
    const fid = rows[ri]?.cells[bld]?.fid;
    if (fid == null) return; // new cell: images held locally
    setAttBusy(true);
    try {
      setAttList(await listAttachments(fid));
    } catch (e) {
      setAttErr(String(e));
    } finally {
      setAttBusy(false);
    }
  }
  async function uploadAttach(files: FileList) {
    if (!attach || !files.length) return;
    const key = `${attach.ri}:${attach.bld}`;
    const fid = rows[attach.ri]?.cells[attach.bld]?.fid;
    if (fid == null) {
      // New cell: keep files locally until Publish creates the feature.
      const added = Array.from(files).map((file) => ({
        file,
        url: URL.createObjectURL(file),
      }));
      setPendingFiles((m) => ({ ...m, [key]: [...(m[key] || []), ...added] }));
      return;
    }
    setAttBusy(true);
    setAttErr("");
    try {
      for (const f of Array.from(files)) await addAttachment(fid, f);
      setAttList(await listAttachments(fid));
    } catch (e) {
      setAttErr(String(e));
    } finally {
      setAttBusy(false);
    }
  }
  async function removeServerAttach(id: number) {
    const fid = attach && rows[attach.ri]?.cells[attach.bld]?.fid;
    if (fid == null) return;
    setAttBusy(true);
    setAttErr("");
    try {
      await deleteAttachment(fid, id);
      setAttList((l) => l.filter((a) => a.id !== id));
    } catch (e) {
      setAttErr(String(e));
    } finally {
      setAttBusy(false);
    }
  }
  function removeLocalAttach(i: number) {
    if (!attach) return;
    const key = `${attach.ri}:${attach.bld}`;
    setPendingFiles((m) => {
      const arr = m[key] || [];
      if (arr[i]) URL.revokeObjectURL(arr[i].url);
      const next = arr.filter((_, j) => j !== i);
      const copy = { ...m };
      if (next.length) copy[key] = next;
      else delete copy[key];
      return copy;
    });
  }

  // Local (not UTC) YYYY-MM-DD, matching the String Огноо format.
  const todayStr = () => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  // Apply all pending edits in one applyEdits call, upload any held images to
  // the features just created, then reload. Photos are optional.
  async function publish() {
    // Append model: each changed cell becomes a NEW row stamped today, so old
    // dates are never touched (light DB — only edited cells, not the whole
    // sheet). Re-editing a cell already published *today* updates that same row
    // instead of stacking duplicates. Clearing a cell appends a today row with
    // pct = null (a tombstone the as-of read sees as the latest = empty).
    const today = todayStr();
    const adds: { attributes: Record<string, unknown> }[] = [];
    const addKeys: string[] = []; // cell key per add, parallel to addResults
    const updates: { attributes: Record<string, unknown> }[] = [];
    // Photos held for cells updated in place (today's row) → upload to their fid.
    const updFiles: { fid: number; key: string }[] = [];
    for (const [key, raw] of Object.entries(pending)) {
      const ri = Number(key.split(":")[0]);
      const bld = key.slice(key.indexOf(":") + 1);
      const row = rows[ri];
      if (!row) continue;
      const existing = row.cells[bld]; // latest (as-of) value for this cell
      const sameDay = existing && existing.date === today;
      const p = raw === "" ? null : Number(raw) / 100;
      if (sameDay) {
        updates.push({ attributes: { [F.oid]: existing!.fid, [F.pct]: p } });
        if (pendingFiles[key]?.length)
          updFiles.push({ fid: existing!.fid, key });
      } else if (raw !== "" || existing) {
        // New value, or a tombstone over an older-dated value.
        adds.push({
          attributes: { ...row.tmpl, [F.ognoo]: today, [F.bld]: bld, [F.pct]: p },
        });
        addKeys.push(key);
      }
    }
    setBusy(true);
    setErr("");
    try {
      const r = await agsFetch(`${base}/applyEdits`, {
        adds: JSON.stringify(adds),
        updates: JSON.stringify(updates),
        rollbackOnFailure: "true",
      });
      const fail = [
        ...(r.addResults || []),
        ...(r.updateResults || []),
      ].find((x: { success?: boolean }) => !x.success);
      if (fail) throw new Error("publish failed: " + JSON.stringify(fail));
      // Upload each new cell's held images to its freshly-created feature.
      const addRes = r.addResults || [];
      const attachErrs: string[] = [];
      for (let i = 0; i < addRes.length; i++) {
        const oid = addRes[i]?.objectId;
        const files = pendingFiles[addKeys[i]];
        if (oid == null || !files?.length) continue;
        for (const f of files) {
          try {
            await addAttachment(oid, f.file);
          } catch (e) {
            attachErrs.push(String(e));
          }
        }
      }
      // Upload photos held for updated (existing) cells to their own feature.
      for (const { fid, key } of updFiles) {
        for (const f of pendingFiles[key] || []) {
          try {
            await addAttachment(fid, f.file);
          } catch (e) {
            attachErrs.push(String(e));
          }
        }
      }
      // Show today (= current merged state). If already viewing today, reload
      // in place; otherwise switch date and let the effect reload as-of today.
      setOgnooList((l) => (l.includes(today) ? l : [...l, today].sort()));
      if (ognoo === today) {
        await loadSlice(); // revokes object URLs + clears pendingFiles
        if (attachErrs.length)
          setErr("Зураг хавсаргахад алдаа: " + attachErrs[0]);
      } else {
        setOgnoo(today);
      }
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  const dirtyCount = Object.keys(pending).length;

  // Ctrl/Cmd+S = publish, Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "s") {
        e.preventDefault();
        if (!busy && dirtyCount) publish();
      } else if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, dirtyCount, pending, undoStack, redoStack]);

  // End a drag-selection anywhere.
  useEffect(() => {
    const up = () => setSelecting(false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  // Keyboard on a selection (when not inline-editing): type+Enter to fill,
  // Delete to clear, arrows to move / Shift+arrows to extend, Esc to cancel.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (edit || !sel || e.ctrlKey || e.metaKey) return;
      const k = e.key;
      if (k === "Escape") {
        setFill(null);
        setSel(null);
        return;
      }
      if (k === "Delete" || k === "Backspace") {
        e.preventDefault();
        if (fill !== null) setFill(fill.slice(0, -1));
        else applyToSelection(""); // stage deletes
        return;
      }
      if (/^[0-9.-]$/.test(k)) {
        e.preventDefault();
        setFill((fill ?? "") + k);
        return;
      }
      if (k === "Enter") {
        e.preventDefault();
        if (fill !== null) {
          applyToSelection(fill);
          setFill(null);
          // Single filled cell → offer the photo panel (optional; close to skip).
          const q = selRect();
          if (
            q &&
            q.r0 === q.r1 &&
            q.c0 === q.c1 &&
            fill.trim() !== origStr(rows[sel.f.ri], sel.f.b) &&
            fill.trim() !== "" &&
            !pendingFiles[`${sel.f.ri}:${sel.f.b}`]?.length
          )
            openAttach(sel.f.ri, sel.f.b);
        } else openCell(sel.f.ri, sel.f.b);
        return;
      }
      const move = (dr: number, dc: number) => {
        e.preventDefault();
        setFill(null);
        const ri = Math.max(0, Math.min(rows.length - 1, sel.f.ri + dr));
        const bi = Math.max(0, Math.min(buildings.length - 1, biOf(sel.f.b) + dc));
        const nf = { ri, b: buildings[bi] };
        setSel((state) =>
          e.shiftKey && state ? { a: state.a, f: nf } : { a: nf, f: nf },
        );
      };
      if (k === "ArrowDown") move(1, 0);
      else if (k === "ArrowUp") move(-1, 0);
      else if (k === "ArrowRight") move(0, 1);
      else if (k === "ArrowLeft") move(0, -1);
      else if (k === "Tab") move(0, e.shiftKey ? -1 : 1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, fill, edit, pending, rows, buildings]);

  // Close the context menu on any click / scroll / Escape.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", esc);
    };
  }, [menu]);

  let n = 0;
  return (
    <div className={st.wrap}>
      <div className={st.toolbar}>
        <label className={st.field}>
          Багц{" "}
          <select
            className={st.select}
            value={bagts}
            onChange={(e) => setBagts(e.target.value)}
          >
            {bagtsList.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <label className={st.field}>
          Огноо{" "}
          <select
            className={st.select}
            value={ognoo}
            onChange={(e) => setOgnoo(e.target.value)}
          >
            {ognooList.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
        <button
          className={st.publishBtn}
          onClick={publish}
          disabled={busy || dirtyCount === 0}
          title="Өөрчилсөн нүдүүдийг өнөөдрийн огноогоор хадгална (Ctrl+S)"
        >
          Нийтлэх{dirtyCount ? ` (${dirtyCount})` : ""}
        </button>
        {busy && <span className={st.muted}>нийтэлж байна…</span>}
      </div>

      {err && <p className={st.error}>{err}</p>}

      {rows.length > 0 && (
        <div className={st.scroll}>
          <table className={st.xl} onMouseLeave={() => setHover(null)}>
            <thead>
              <tr>
                <th className={cls("fz c-no")}>№</th>
                <th className={cls("fz c-ajil")}>Ажил</th>
                <th className={cls("fz c-jin")}>Жин</th>
                {buildings.map((b) => (
                  <th key={b} className={cls("bld")}>
                    {b}
                  </th>
                ))}
                <th className={cls("fz c-done")}>Хийгдсэн</th>
                <th className={cls("fz c-dutuu")}>Дутуу</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => {
                const header = isHeaderRow(r);
                if (!header) n++;
                // All section/group headers share one indent tier; leaves deeper.
                const tier = header ? 1 : 2;
                // Show the top category like the others: drop a leading "A. " label.
                const work = header
                  ? r.work.replace(/^[A-Za-zА-Яа-яӨөҮү]\.\s*/, "")
                  : r.work;
                const done = effDone(ri, r);
                const rowHl = hover !== null && hover.ri === ri;
                return (
                  <tr key={ri} className={header ? st.cat : undefined}>
                    <td
                      className={cls("num fz c-no")}
                      style={{
                        backgroundColor: rowHl
                          ? HL_BG
                          : header
                            ? HEADER_BG
                            : CELL_BG,
                      }}
                    >
                      {header ? "" : n}
                    </td>
                    <td
                      className={cls("fz c-ajil")}
                      style={{
                        paddingLeft: `${tier * 16 + 6}px`,
                        background: rowHl
                          ? HL_BG
                          : header
                            ? HEADER_BG
                            : CELL_BG,
                      }}
                    >
                      {work}
                    </td>
                    <td
                      className={cls("right fz c-jin")}
                      style={{
                        backgroundColor: rowHl
                          ? HL_BG
                          : header
                            ? HEADER_BG
                            : CELL_BG,
                      }}
                    >
                      {r.weight == null ? "" : r.weight}
                    </td>
                    {buildings.map((b) => {
                      const key = `${ri}:${b}`;
                      const dirty = key in pending;
                      // Effective value = pending override, else original.
                      const raw = dirty ? pending[key] : origStr(r, b);
                      const v = raw === "" ? null : Number(raw) / 100;
                      const colHl = hover !== null && hover.bld === b;
                      const hl = rowHl || colHl;
                      const selected = !header && inSel(ri, b);
                      const focused = isFocus(ri, b);
                      const editing =
                        edit && edit.ri === ri && edit.bld === b;
                      const nFiles = pendingFiles[key]?.length || 0;
                      if (editing)
                        return (
                          <td key={b} className={cls("num bld")} style={{ padding: 0 }}>
                            <input
                              autoFocus
                              type="text"
                              inputMode="decimal"
                              className={st.cellInput}
                              value={val}
                              onChange={(e) => setVal(e.target.value)}
                              onBlur={() => commitEdit(r, ri, b, val)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") return setEdit(null);
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  commitEdit(r, ri, b, val);
                                  // Filled a value → offer the photo panel (optional; close to skip).
                                  if (
                                    val.trim() !== origStr(r, b) &&
                                    val.trim() !== "" &&
                                    !pendingFiles[`${ri}:${b}`]?.length
                                  ) {
                                    openAttach(ri, b);
                                  } else {
                                    const t = nextEditable(ri, e.shiftKey ? -1 : 1);
                                    if (t >= 0) openCell(t, b);
                                  }
                                } else if (e.key === "Tab") {
                                  e.preventDefault();
                                  commitEdit(r, ri, b, val);
                                  const bi = buildings.indexOf(b);
                                  if (!e.shiftKey) {
                                    if (bi < buildings.length - 1)
                                      openCell(ri, buildings[bi + 1]);
                                    else {
                                      const t = nextEditable(ri, 1);
                                      if (t >= 0) openCell(t, buildings[0]);
                                    }
                                  } else {
                                    if (bi > 0) openCell(ri, buildings[bi - 1]);
                                    else {
                                      const t = nextEditable(ri, -1);
                                      if (t >= 0)
                                        openCell(t, buildings[buildings.length - 1]);
                                    }
                                  }
                                }
                              }}
                            />
                          </td>
                        );
                      return (
                        <td
                          key={b}
                          className={
                            (header ? cls("num bld") : cls("num bld cursor-cell")) +
                            (dirty ? " " + st.dirty : "")
                          }
                          // priority: dirty > selected > crosshair > base.
                          style={{
                            backgroundColor: dirty
                              ? DIRTY_BG
                              : selected
                                ? SEL_BG
                                : hl
                                  ? HL_BG
                                  : header
                                    ? undefined
                                    : CELL_BG,
                            outline: focused
                              ? "2px solid var(--hue)"
                              : undefined,
                            outlineOffset: focused ? "-2px" : undefined,
                          }}
                          onMouseDown={
                            header
                              ? undefined
                              : (e) => {
                                  if (e.button !== 0) return;
                                  e.preventDefault();
                                  setSel({ a: { ri, b }, f: { ri, b } });
                                  setSelecting(true);
                                  setFill(null);
                                }
                          }
                          onMouseEnter={
                            header
                              ? undefined
                              : () => {
                                  setHover({ ri, bld: b });
                                  if (selecting)
                                    setSel((prev) =>
                                      prev ? { a: prev.a, f: { ri, b } } : prev,
                                    );
                                }
                          }
                          onDoubleClick={
                            header ? undefined : () => openCell(ri, b)
                          }
                          onContextMenu={
                            header
                              ? undefined
                              : (e) => {
                                  e.preventDefault();
                                  setMenu({
                                    x: e.clientX,
                                    y: e.clientY,
                                    kind: "cell",
                                    ri,
                                    bld: b,
                                    row: r,
                                  });
                                }
                          }
                        >
                          {fill !== null && focused ? fill : pct(v)}
                          {nFiles > 0 && (
                            <sup className={st.clip}>📎</sup>
                          )}
                        </td>
                      );
                    })}
                    <td
                      className={cls("num fz c-done")}
                      style={{ backgroundColor: rowHl ? HL_BG : CALC_BG }}
                    >
                      {pct(done)}
                    </td>
                    <td
                      className={cls("num fz c-dutuu")}
                      style={{ backgroundColor: rowHl ? HL_BG : CALC_BG }}
                    >
                      {done == null ? "" : pct(1 - done)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: HEADER_BG, fontWeight: 700 }}>
                <td className={cls("fz c-no")} />
                <td className={cls("fz c-ajil")} style={{ paddingLeft: "6px" }}>
                  Дундаж
                </td>
                <td className={cls("fz c-jin")} />
                {buildings.map((b) => (
                  <td key={b} className={cls("num bld")} />
                ))}
                <td className={cls("num fz c-done")}>{pct(doneAvg)}</td>
                <td className={cls("num fz c-dutuu")}>
                  {doneAvg == null ? "" : pct(1 - doneAvg)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {menu && (
        <div
          className={st.menu}
          style={{ top: menu.y, left: menu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.kind === "cell" && (
            <>
              <button
                className={st.menuItem}
                onClick={() => {
                  openAttach(menu.ri!, menu.bld!);
                  setMenu(null);
                }}
              >
                📎 Зураг хавсаргах
              </button>
              <button
                className={st.menuItemDanger}
                onClick={() => {
                  commitEdit(menu.row!, menu.ri!, menu.bld!, "");
                  setMenu(null);
                }}
              >
                Нүд устгах
              </button>
            </>
          )}
        </div>
      )}

      {attach &&
        (() => {
          const aFid = rows[attach.ri]?.cells[attach.bld]?.fid ?? null;
          const local = pendingFiles[`${attach.ri}:${attach.bld}`] || [];
          const empty = aFid != null ? attList.length === 0 : local.length === 0;
          return (
            <div className={st.overlay} onClick={() => setAttach(null)}>
              <div className={st.modal} onClick={(e) => e.stopPropagation()}>
                <div className={st.modalHead}>
                  <h2 className={st.modalTitle}>
                    Зураг — {rows[attach.ri]?.work ?? ""} · {attach.bld}
                  </h2>
                  <button
                    className={st.closeBtn}
                    onClick={() => setAttach(null)}
                  >
                    ✕
                  </button>
                </div>

                {aFid == null && (
                  <p className={st.hint}>Нийтэлсний дараа хадгалагдана.</p>
                )}

                {attErr && <p className={st.errorSm}>{attErr}</p>}

                <label className={st.addImgBtn}>
                  + Зураг нэмэх
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className={st.hiddenInput}
                    disabled={attBusy}
                    onChange={(e) => {
                      if (e.target.files) uploadAttach(e.target.files);
                      e.target.value = ""; // allow re-selecting the same file
                    }}
                  />
                </label>

                {attBusy && <p className={st.hint}>ачаалж байна…</p>}

                {empty && !attBusy ? (
                  <p className={st.muted}>Зураг алга.</p>
                ) : (
                  <div className={st.imgGrid}>
                    {aFid != null
                      ? attList.map((a) => (
                          <div key={a.id} className={st.imgCell}>
                            <a
                              href={attachmentUrl(aFid, a.id)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={attachmentUrl(aFid, a.id)}
                                alt={a.name}
                                className={st.img}
                              />
                            </a>
                            <button
                              title="Устгах"
                              className={st.imgDel}
                              disabled={attBusy}
                              onClick={() => removeServerAttach(a.id)}
                            >
                              ✕
                            </button>
                          </div>
                        ))
                      : local.map((f, i) => (
                          <div key={i} className={st.imgCell}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={f.url}
                              alt={f.file.name}
                              className={st.img}
                            />
                            <button
                              title="Устгах"
                              className={st.imgDel}
                              onClick={() => removeLocalAttach(i)}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
    </div>
  );
}
