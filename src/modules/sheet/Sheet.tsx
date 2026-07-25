'use client';

import { useState } from "react";
import Pivot from "./Pivot";
import Wbs from "./Wbs";
import st from "./sheet.module.css";

/** «Гүйцэтгэл бөглөх» (хүснэгт засвар) + «Дүгнэлт» (төслийн нэгдсэн WBS). */
export function Sheet() {
  const [tab, setTab] = useState<"fill" | "concl">("fill");
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
      </div>
      {tab === "fill" ? <Pivot /> : <Wbs />}
    </div>
  );
}
