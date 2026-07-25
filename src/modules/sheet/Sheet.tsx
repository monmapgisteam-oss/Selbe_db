'use client';

import { useState } from "react";
import Level5 from "./Level5";
import Pivot from "./Pivot";
import Wbs from "./Wbs";
import st from "./sheet.module.css";

/**
 * «Гүйцэтгэл бөглөх» (хүснэгт засвар) + «Дүгнэлт» (төслийн нэгдсэн WBS) +
 * «Түвшин 5» (ажилбарын түвшний экспорт, зөвхөн харах).
 */
export function Sheet() {
  const [tab, setTab] = useState<"fill" | "concl" | "l5">("fill");
  return (
    <div className={st.tabs}>
      <div className={st.tabBar}>
        <button
          className={`${st.tab} ${tab === "fill" ? st.tabActive : ""}`}
          onClick={() => setTab("fill")}
        >
          Гүйцэтгэл бөглөх
        </button>
        <button
          className={`${st.tab} ${tab === "concl" ? st.tabActive : ""}`}
          onClick={() => setTab("concl")}
        >
          Дүгнэлт
        </button>
        <button
          className={`${st.tab} ${tab === "l5" ? st.tabActive : ""}`}
          onClick={() => setTab("l5")}
        >
          Түвшин 5
        </button>
      </div>
      {tab === "fill" ? <Pivot /> : tab === "concl" ? <Wbs /> : <Level5 />}
    </div>
  );
}
