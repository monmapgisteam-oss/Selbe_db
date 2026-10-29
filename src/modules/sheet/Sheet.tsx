'use client';

import FillNew, { type SheetView } from "./FillNew";
import st from "./sheet.module.css";

/**
 * ГҮЙЦЭТГЭЛ БӨГЛӨХ — өгөгдөл оруулах ПОРТАЛ.
 */
export function Sheet({ view }: { view?: SheetView } = {}) {
  return (
    <div className={st.tabs}>
      <FillNew view={view} />
    </div>
  );
}
