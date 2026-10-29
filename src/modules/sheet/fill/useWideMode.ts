import { useEffect, useState, type RefObject } from "react";

/** @param editRef нээлттэй нүдний толь · @param pickRef нээлттэй календарын толь (FillNew) */
export function useWideMode({ editRef, pickRef }: { editRef: RefObject<unknown>; pickRef: RefObject<unknown> }) {
  /**
   * БӨГЛӨХ ГОРИМ — хүснэгт БҮТЭН ДЭЛГЭЦ (2026-09-09, хэрэглэгчийн хүсэлт).
   */
  const [wide, setWide] = useState(() => {
    try { return localStorage.getItem("selbe-fill-wide") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("selbe-fill-wide", wide ? "1" : "0"); } catch { /* хаалттай орчин */ }
  }, [wide]);

  /**
   * ЗАСВАРЫН ГОРИМ — «Бөглөх» дартал нүд ЗАСАГДАХГҮЙ (2026-09-09,
   * хэрэглэгчийн заавар: «бөглөх дарах хүртэл editлэгдэхгүй»).
   */
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!wide) return undefined;
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editRef.current || pickRef.current) return;
      setWide(false);
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [wide, editRef, pickRef]);

  useEffect(() => {
    if (!wide) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [wide]);
  return { wide, setWide, editing, setEditing };
}
