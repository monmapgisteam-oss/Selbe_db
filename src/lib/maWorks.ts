import { PKGS, loadSchema } from '@/modules/sheet/bagts.pkg';
import { loadRows } from '@/modules/sheet/bagtsSheet';

/**
 * SURVEY123 MA МАЯГТЫН «ХАМААРАХ АЖЛУУД» ЖАГСААЛТ — `media/works.csv` (name,label,pkg).
 * (2026-10-09, хэрэглэгч: «ажил сонголт гарч ирэхгүй байна», «юун токен бэ»)
 *
 * ⚠️ ЯАГААД ПОРТАЛААС: бөглөх хуудсууд ArcGIS Online дээр ХААЛТТАЙ, survey нь Enterprise дээр —
 *    survey өөрөө тэднийг уншиж чадахгүй. Порталд нэвтэрсэн хэрэглэгчийн ОДООГИЙН нэвтрэлтээр
 *    (`loadRows` → `query.ts` токеныг өөрөө залгана) уншиж CSV болгоно — тусдаа токен хэрэггүй.
 * ⚠️ name = `${pkg.key}:${des}` — `des` нь мөрийн ТОГТВОРТОЙ дугаар (`oid` нийтлэл бүрд
 *    солигддог, `bagts.pkg.ts`-ийн ⚠️). label = «№ · ажил». pkg = choice_filter-ийн түлхүүр.
 *    Зөвхөн НАВЧ мөр (бүлэг биш). `tools/ma-works-csv.mjs` мөн үүнийг ашиглана.
 * ⚠️ Хуудаст мөр нэмэгдэх бүрт дахин татаж Survey123 Connect-ийн `media/works.csv`-г сольж НИЙТЭЛНЭ.
 */
export async function buildWorksCsv(onProgress?: (done: number, total: number, pkg: string) => void): Promise<{ csv: string; count: number; failed: string[] }> {
  const esc = (s: string) => { const t = s.replace(/\s+/g, ' ').trim(); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const lines = ['name,label,pkg'];
  const failed: string[] = [];
  let count = 0;
  for (let i = 0; i < PKGS.length; i++) {
    const pkg = PKGS[i];
    onProgress?.(i, PKGS.length, pkg.name);
    try {
      const sc = await loadSchema(pkg);
      const { rows } = await loadRows(pkg, sc);
      const seen = new Set<string>();
      for (const r of rows) {
        if (r.group || r.des == null) continue;
        const key = `${pkg.key}:${r.des}`;
        if (seen.has(key)) continue;
        seen.add(key);
        lines.push([key, esc(`${r.no ? `${r.no} · ` : ''}${r.work || ''}`.slice(0, 150)), pkg.key].join(','));
        count++;
      }
    } catch {
      failed.push(pkg.name);
    }
  }
  onProgress?.(PKGS.length, PKGS.length, '');
  /* ⚠️ BOM — Survey123 Connect / Excel кириллийг зөв уншина */
  return { csv: `﻿${lines.join('\n')}\n`, count, failed };
}
