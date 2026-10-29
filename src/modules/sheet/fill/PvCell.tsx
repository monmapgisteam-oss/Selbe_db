import { useState } from "react";
import type { SheetRow } from "../bagtsSheet";
import { t as tr } from "@/lib/i18nCore";
import { normCell } from "../paste";
import { RO, qty } from "./util";
import st from "../sheet.module.css";
import { cw } from "../colWidths";

/**
 * ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМЫН НҮД.
 */
export function PvCell({
  r, canEdit, draft, preview, hasField, locked, onSet, cls, ro, negj, onBad, notEditing = false,
}: {
  r: SheetRow;
  canEdit: boolean;
  draft: string | undefined;
  preview: number | null | undefined;
  hasField: boolean;
  locked: boolean;
  onSet: (v: string | null) => void;
  cls: (c: string) => string;
  ro: (msg: string) => { title: string; onClick: () => void };
  negj: string | null;
  onBad?: (msg: string) => void;
  notEditing?: boolean;
}) {
  const [open, setOpen] = useState(false);

  /* Хадгалагдсан → ноорог → (батлагчид) илгээгдсэн утга */
  const saved = r.plannedVol;
  const dirty = draft !== undefined;
  const draftNum = dirty
    ? (draft.trim() === "" ? null : Number(draft))
    : undefined;
  const shown: number | null = dirty
    ? (draftNum != null && !Number.isFinite(draftNum) ? saved : draftNum ?? null)
    : preview !== undefined ? preview : saved;
  const pendingDiff = preview !== undefined && preview !== saved;

  if (open && canEdit) {
    return (
      <td className={cls("right c-vol editable")} style={cw("pvol", "vol")}>
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          className={st.cellInputLine}
          defaultValue={dirty ? draft : (saved == null ? "" : String(saved))}
          placeholder={tr('обьём')}
          onBlur={(e) => {
            const t0 = e.target.value.trim();
            const t = t0 === "" ? "" : normCell(t0);
            if (t === null || (t !== "" && Number(t) < 0)) {
              onBad?.(tr('Төлөвлөсөн обьём: «{0}» — тоо биш, тодорхойгүй эсвэл сөрөг тул бичигдсэнгүй. 1250 эсвэл 1.25 гэж бичнэ үү.', t0));
              setOpen(false);
              return;
            }
            /* Хадгалагдсантайгаа ижил бол ноорогт ҮЛДЭЭХГҮЙ */
            const v = t === "" ? null : Number(t);
            if ((saved ?? null) === v) onSet(null); else onSet(t);
            setOpen(false);
          }}
          onKeyDown={(e) => {
            const td = e.currentTarget.closest("td");
            const back = () => requestAnimationFrame(() => td?.focus());
            if (e.key === "Escape") { setOpen(false); back(); return; }
            if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); back(); return; }
            if (e.key === "Tab") e.currentTarget.blur();
          }}
        />
      </td>
    );
  }

  /* ЗАСАГДАХГҮЙ шалтгааныг ТОДОРХОЙ хэлнэ — чимээгүй түгжихгүй */
  const why = r.group
    ? RO.plannedVolGroup
    : !hasField
      ? RO.plannedVolNoField
      : r.oid < 0
        ? RO.plannedVolNewRow
        : locked
          ? RO.plannedVolLocked
          : notEditing
            ? RO.notEditing
            : RO.plannedVol;

  return (
    <td
      style={cw("pvol", "vol")}
      className={cls("right c-vol" + (canEdit ? " editable" : "")
        + (dirty ? " dirty" : "") + (pendingDiff ? " chg" : ""))}
      tabIndex={canEdit ? 0 : undefined}
      onClick={canEdit ? () => setOpen(true) : ro(why).onClick}
      title={canEdit ? RO.plannedVol : why}
      onKeyDown={canEdit ? (e) => {
        if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); setOpen(true); }
      } : undefined}
    >
      {qty(shown)}
      {!r.group && shown != null && negj && (
        <span className={st.negj}>{negj}</span>
      )}
    </td>
  );
}
