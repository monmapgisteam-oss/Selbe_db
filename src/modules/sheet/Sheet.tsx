'use client';

import { useState, type ReactNode } from "react";
import FillNew from "./FillNew";
import Level5 from "./Level5";
import Pivot from "./Pivot";
import Wbs from "./Wbs";
import st from "./sheet.module.css";

type Tab = "new" | "fill" | "concl" | "l5";

const TABS: { key: Tab; title: string }[] = [
  { key: "new", title: "Гүйцэтгэл шинэ" },
  { key: "fill", title: "Гүйцэтгэл бөглөх" },
  { key: "concl", title: "Дүгнэлт" },
  { key: "l5", title: "Түвшин 5" },
];

/**
 * «Гүйцэтгэл шинэ» (багцуудын `*_final_publish` хуудас) + «Гүйцэтгэл бөглөх»
 * (хүснэгт засвар) + «Дүгнэлт» (төслийн нэгдсэн WBS) + «Түвшин 5» (ажилбарын
 * түвшний экспорт, зөвхөн харах).
 *
 * ⚠️ Таб солиход өмнөх таб САЛГАХГҮЙ, зөвхөн НУУНА. Салгавал:
 *   • нийтлээгүй засвар (`pending`) чимээгүй алга болно;
 *   • буцаж ирэх бүрд 1400+ мөр дахин татагдаж, дэлгэсэн/хаасан бүлэг,
 *     гүйлтийн байрлал, сонгосон багц бүгд эхнээсээ эхэлнэ.
 * Тиймээс табыг НЭГ УДАА зочилсны дараа санд үлдээж (`seen`), идэвхгүй үед
 * `display: none`-оор нуудаг «keep-alive» загвар. Огт нээгээгүй таб огт
 * ачаалагдахгүй тул анхны нээлт хурдан хэвээр.
 */
export function Sheet() {
  // ⚠️ Навигацийн «Гүйцэтгэл бөглөх» товчоор ороход ЭНЭ таб шууд нээгдэнэ.
  const [tab, setTab] = useState<Tab>("new");
  const [seen, setSeen] = useState<Set<Tab>>(new Set(["new"]));

  const open = (k: Tab) => {
    setTab(k);
    setSeen((s) => (s.has(k) ? s : new Set(s).add(k)));
  };

  const body: Record<Tab, ReactNode> = {
    new: <FillNew />,
    fill: <Pivot />,
    concl: <Wbs />,
    l5: <Level5 />,
  };

  return (
    <div className={st.tabs}>
      <div className={st.tabBar}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`${st.tab} ${tab === t.key ? st.tabActive : ""}`}
            onClick={() => open(t.key)}
          >
            {t.title}
          </button>
        ))}
      </div>
      {TABS.filter((t) => seen.has(t.key)).map((t) => (
        <div
          key={t.key}
          // `hidden` төдийгүй inline `display` — дээд элемент нь flex тул `[hidden]`-ийн
          // анхны `display: none` дарагдах эрсдэлтэй.
          hidden={tab !== t.key}
          style={tab === t.key ? undefined : { display: "none" }}
        >
          {body[t.key]}
        </div>
      ))}
    </div>
  );
}
