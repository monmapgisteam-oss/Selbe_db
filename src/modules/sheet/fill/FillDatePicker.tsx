/*
 * ⚠️ 2026-09-30: `FillNew.tsx` (6.9k мөр) задарсан — хуудсан дээр хөвөх огнооны календар (эхлэх/дуусах/шинэчлэгдсэн огноо).
 *    Код ЯГ хэвээр зөөгдсөн, зан төлөв өөрчлөгдөөгүй; `draft.check.mjs` ·
 *    `shareDraft.check.mjs` эх кодын шалгуураа FillNew.tsx + fill/* нийлбэрээс уншина.
 */
import type { Dispatch, SetStateAction } from "react";
import type { SheetRow } from "../bagtsSheet";
import DatePicker from "../DatePicker";
import { endOf } from "@/lib/plan";
import { t as tr } from "@/lib/i18nCore";
import { RO, dt, inputToMs, type PickState } from "./util";

export function FillDatePicker({ pick, setPick, busy, say, setAsOf, commitDate, pendDate }: {
  pick: PickState | null; setPick: Dispatch<SetStateAction<PickState | null>>; busy: boolean;
  say: (msg: string) => void; setAsOf: Dispatch<SetStateAction<number | null>>;
  commitDate: (r: SheetRow, b: number, k: "s" | "e", raw: string) => void; pendDate: Record<string, string>;
}) {
  return (
    <>
      {/* Огнооны календар — нүдэнд биш, ХУУДСАН ДЭЭР хөвж гарна (fixed).
          Хүснэгтийн нүд дотор байрлуулбал `overflow: hidden`-д таслагдана. */}
      {pick && (
        <DatePicker
          value={pick.value}
          anchor={pick.rect}
          onClose={() => setPick(null)}
          onPick={(v) => {
            /* ⚠️ Илгээлт явж байхад бичихгүй — `RO.busy`-ийн ⚠️ (2026-09-25) */
            if (busy) { say(RO.busy); return; }
            if (pick.kind === "asOf") {
              // ⚠️ Хоосон болговол calc=[] болж бүх мөр алга болно — тиймээс
              //    задлагдсан үед л солино.
              const ms = inputToMs(v);
              if (ms != null) setAsOf(ms);
            } else {
              commitDate(pick.row, pick.b, pick.kind, v);
              /* ⚠️ ҮРГЭЛЖЛЭХ ХОНОГ (2026-09-17): «Эхлэх» нүдэнд хоног бичсэн бол
                 дуусах огноог хамт тавина — `endOf` хоёр тал орсон (`plan.ts`). */
              const n = Math.floor(Number(pick.days));
              const s0 = inputToMs(v);
              if (pick.kind === "s" && n >= 1 && s0 != null) {
                commitDate(pick.row, pick.b, "e", dt(endOf(s0, n)));
              }
            }
            setPick(null);
          }}
          days={pick.kind === "asOf" ? undefined : (() => {
            /* Эхлэх ms — ноорог эсвэл хадгалагдсан утга */
            const sKey = `${pick.row.oid}:${pick.b}:s`;
            const sRaw = pick.kind === "s" ? pick.value : (pendDate[sKey] ?? dt(pick.row.start[pick.b] ?? null));
            const s0 = inputToMs(sRaw);
            const n = Math.floor(Number(pick.days));
            return {
              value: pick.days,
              onChange: (v: string) => setPick((cur) => (cur ? { ...cur, days: v } : cur)),
              canApply: n >= 1 && s0 != null,
              onApply: () => {
                if (busy) { say(RO.busy); return; }
                if (!(n >= 1) || s0 == null) { say(tr("Эхлэх огноог эхлээд сонгоно")); return; }
                if (pick.kind === "s") commitDate(pick.row, pick.b, "s", sRaw);
                commitDate(pick.row, pick.b, "e", dt(endOf(s0, n)));
                setPick(null);
              },
            };
          })()}
        />
      )}
    </>
  );
}
