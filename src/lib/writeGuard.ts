/**
 * БИЧИЛТИЙН ХАМГААЛАЛТ — хүснэгтэд бичдэг доод түвшний функцүүдэд (2026-11-19, аудит).
 *
 * Эдгээр функц урьд нь зөвхөн дэлгэцийн товч нуугдсанаар хамгаалагддаг байсан: «зөвхөн харах» эрхтэй хүн функцийг шууд
 * дуудахад юу ч зогсоодоггүй байв. Энд ХАМГИЙН БАГА шалгуур тавина — тухайн хүн ерөөсөө бичих үүрэгтэй юу. Багц, шатны
 * нарийн шалгуур нь урьдын адил дуудагч урсгалд (`hyanaltStore.authz`, `huvaariBatlah`, `ajilBatlah` …) хэвээр.
 * Нэвтрэлт унтраалттай (локал dev), Node (тест, хэрэгсэл), шалгуурын горимд (`who._setWriteGuards(false)`) шалгахгүй.
 */
import { t as tr } from './i18nCore';
import { AUTH } from './services';
import { capsOf, type CapKey } from './caps';
import { currentUser, writeGuardsOn } from './who';

/** Бичих эрх биш (зөвхөн харах / ашиглах) нэмэлт эрхүүд */
const NOT_WRITE: ReadonlySet<CapKey> = new Set<CapKey>(['aiAgent', 'habeaOwn']);

const off = (): boolean => !writeGuardsOn() || typeof window === 'undefined' || !AUTH.appId;

/**
 * Гүйцэтгэлийн хуудас (`bagtsSheet.applyAdds` · `applyUpdates` · `applyDeletes`), нэгтгэл (`negtgelWrite.registerApproved`),
 * төлбөрийн актын автомат мөр (`ipcAutoWrite.syncIpcFromFill`) — системийн админ, гүйцэтгэлийн урсгалын аль нэг шатанд
 * томилогдсон хүн, эсвэл бичих аль нэг нэмэлт эрхтэй хүн. Юу ч үгүй (зөвхөн харах) бол шиднэ.
 */
export async function requireWriter(): Promise<void> {
  if (off()) return;
  const u = currentUser();
  if (u) {
    if (capsOf(u).some((c) => !NOT_WRITE.has(c))) return;
    const [{ roleOf }, { stageOfUser }] = await Promise.all([import('./permissions'), import('./guitsetgelAcl')]);
    if (roleOf(u) === 'super' || stageOfUser(u) != null) return;
  }
  throw new Error(tr('Энэ хүснэгтэд бичих эрхгүй — танд зөвхөн харах эрх байна.'));
}

/** Дуудагчийн өгсөн нэр нэвтэрсэн хэрэглэгчтэй ижил байх ёстой (хуваарийн батлах түгжээ — бусдын нэрээр чөлөөлөхгүй) */
export function requireSelf(name: string): void {
  if (off()) return;
  if ((currentUser() ?? '') === name.trim().toLowerCase() && name.trim()) return;
  throw new Error(tr('Энэ үйлдлийг зөвхөн өөрийн нэрээр хийнэ.'));
}
