'use client';

import FillNew from "./FillNew";
import { Icon } from "@/components/Icon";
import st from "./sheet.module.css";

/**
 * ГҮЙЦЭТГЭЛ БӨГЛӨХ — өгөгдөл оруулах ПОРТАЛ.
 *
 * ⚠️ 2026-08-18 (хэрэглэгчийн шийдвэр): дөрвөн табтай байсныг ЗӨВХӨН «Гүйцэтгэл
 * шинэ» (FillNew) болгож хумив — энэ нь өгөгдөл ОРУУЛДАГ цор ганц хэсэг, бусад
 * гурав (Pivot/Wbs/Level5) нь харах/экспортын хуудаснууд байсан. Тэдгээрийн код
 * ба ТООЦООЛОЛ (`bagtsSheet.ts → computeAll`, excel-ийн томъёонууд) ХЭВЭЭР —
 * FillNew дотор ажилладаг хэвээр, зөвхөн навигаци нь хасагдсан.
 */
export function Sheet() {
  return (
    <div className={st.tabs}>
      {/* Порталын толгой — таб биш, өгөгдөл оруулах хэсгийн тодорхойлолт */}
      <header className={st.portalHead}>
        <span className={st.portalIcon}><Icon name="pen" size={16} /></span>
        <div className={st.portalText}>
          <h2 className={st.portalTitle}>Гүйцэтгэл бөглөх</h2>
          <p className={st.portalDesc}>
            Багцын гүйцэтгэлийн өгөгдөл оруулах портал — блок бүрийн нүдэнд ЭНЭ
            УДААД хийсэн ОБЬЁМоо бичихэд гүйцэтгэлийн хувь, нийлбэр, жин, дүн
            автоматаар бодогдоно.
          </p>
        </div>
      </header>
      <FillNew />
    </div>
  );
}
