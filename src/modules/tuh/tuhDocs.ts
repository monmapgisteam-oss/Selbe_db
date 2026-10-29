import { MS_STATUS, type MsStatus } from '@/lib/chanarMs';
import { latestPerRespNo, loadMa, type MaRow } from '@/lib/ma';
import { loadMir, type MirRow } from '@/lib/mir';
import { PKGS } from '@/modules/sheet/bagts.pkg';

/**
 * ТУХ-ын «Материал: MA/MIR» хэсгийн баримтууд — Survey123-ын MA (`lib/ma`) ба MIR (`lib/mir`)-ээс.
 * Хуучин «Чанарын баримт» сан устсан тул тэндээс биш; шийдвэрийг `MS_STATUS`-д буулгана:
 *   A/AN → батлагдсан · R → буцаагдсан · шийдвэргүй → хянагдаж байна.
 */
export type TuhDoc = {
  oid: number;
  kind: 'MA' | 'MIR';
  /** Багцын бүлэг («Багц 3.3») — `bagtsKey`-ээр ТУХ-ын багцтай тааруулна */
  bagts: string;
  docNo: string;
  title: string;
  sentAt: number | null;
  decidedAt: number | null;
  status: MsStatus;
};

const statusOf = (v: MaRow['verdict']): MsStatus =>
  v === 'A' || v === 'AN' ? MS_STATUS.approved : v === 'R' ? MS_STATUS.returned : MS_STATUS.review;

const groupOf = (pkgKey: string): string => PKGS.find((p) => p.key === pkgKey)?.group ?? '';

/** Цэвэр хөрвүүлэлт (тестлэгдэнэ): MA — хариу бичгийн сүүлийн хувилбар л; MIR — ачаа бүр */
export function tuhDocsOf(mas: readonly MaRow[], mirs: readonly MirRow[]): TuhDoc[] {
  const out: TuhDoc[] = [];
  for (const m of latestPerRespNo(mas)) {
    out.push({
      oid: m.oid, kind: 'MA', bagts: groupOf(m.pkg), docNo: m.respNo || m.subDocNo, title: m.material,
      sentAt: m.recvDate ?? m.created, decidedAt: m.respDate, status: statusOf(m.verdict),
    });
  }
  for (const m of mirs) {
    out.push({
      oid: m.oid, kind: 'MIR', bagts: groupOf(m.pkg), docNo: m.docNo, title: m.material,
      sentAt: m.date, decidedAt: m.verdict ? m.date : null, status: statusOf(m.verdict),
    });
  }
  return out;
}

export async function loadTuhDocs(): Promise<TuhDoc[]> {
  const [mas, mirs] = await Promise.all([loadMa(), loadMir()]);
  return tuhDocsOf(mas, mirs);
}
