/*
 * ⚠️ 2026-09-30: `FillNew.tsx` (6.9k мөр) задарсан — инженерийн төлөвлөсөн обьёмын нүд (тусдаа компонент байсан).
 *    Код ЯГ хэвээр зөөгдсөн, зан төлөв өөрчлөгдөөгүй; `draft.check.mjs` ·
 *    `shareDraft.check.mjs` эх кодын шалгуураа FillNew.tsx + fill/* нийлбэрээс уншина.
 */
import { useState } from "react";
import type { SheetRow } from "../bagtsSheet";
import { t as tr } from "@/lib/i18nCore";
import { RO, qty } from "./util";
import st from "../sheet.module.css";

/**
 * ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМЫН НҮД.
 *
 * ⚠️ ТУСДАА КОМПОНЕНТ: гүйцэтгэлийн блокийн нүд нь `edit` төлөв, `commit`,
 * буулгалт, огноо зэрэг олон замтай холбогдсон тул тэнд шигтгэвэл хоёр
 * урсгал холилдоно. Энэ нүд НЭГ утга л хөтөлнө.
 *
 * ⚠️ Оролт нь УДИРДЛАГАГҮЙ (`defaultValue` + `key`): бичих бүрд эцэг
 * компонент дахин зурагдвал 1,400 мөрийн хуудас гацна. Утга нь зөвхөн
 * blur/Enter үед `onSet` рүү очно.
 */
export function PvCell({
  r, canEdit, draft, preview, hasField, locked, onSet, cls, ro, negj,
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
}) {
  const [open, setOpen] = useState(false);

  /* Хадгалагдсан → ноорог → (батлагчид) илгээгдсэн утга */
  const saved = r.plannedVol;
  const dirty = draft !== undefined;
  /* ⚠️ Ноорогт бичигдсэн текст ТОО БИШ байж болно (бичиж байх зуур) —
     тэр үед хадгалагдсаныг харуулна, NaN зурахгүй. */
  const draftNum = dirty
    ? (draft.trim() === "" ? null : Number(draft))
    : undefined;
  const shown: number | null = dirty
    ? (draftNum != null && !Number.isFinite(draftNum) ? saved : draftNum ?? null)
    : preview !== undefined ? preview : saved;
  /* ⚠️ Илгээгдсэн утга нь ХАДГАЛАГДСАНААС өөр бол ялгаж тэмдэглэнэ */
  const pendingDiff = preview !== undefined && preview !== saved;

  if (open && canEdit) {
    return (
      <td className={cls("right c-vol editable")}>
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          className={st.cellInputLine}
          defaultValue={dirty ? draft : (saved == null ? "" : String(saved))}
          placeholder={tr('обьём')}
          onBlur={(e) => {
            const t = e.target.value.trim();
            /* Хадгалагдсантайгаа ижил бол ноорогт ҮЛДЭЭХГҮЙ */
            const v = t === "" ? null : Number(t);
            if (t !== "" && !Number.isFinite(v)) { setOpen(false); return; }
            if ((saved ?? null) === v) onSet(null); else onSet(t);
            setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setOpen(false); return; }
            if (e.key === "Enter" || e.key === "Tab") e.currentTarget.blur();
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
          : RO.plannedVol;

  return (
    <td
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
