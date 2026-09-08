'use client';

/**
 * ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМЫН ЭРХ ТОХИРУУЛАХ ПАНЕЛ — БАГЦААР.
 *
 * ⚠️ `HuvaariAcl.tsx`-ТЭЙ ИЖИЛ БҮТЭЦ, ӨӨР АСУУЛТ (2026-09-08). Тэр нь
 * ОГНОО («хэзээ»), энэ нь ОБЬЁМ («хэр их») төлөвлөх эрхийг хуваарилна.
 *
 * ⚠️ БАГЦ ТУС БҮР ӨӨРИЙН ХӨЗӨРТЭЙ — ажил нь БАГЦААР хуваарилагддаг тул
 * дэлгэц ч мөн багцаар. Багц бүрд хоёр үүрэг:
 *   · Засварлагч — «Гүйцэтгэл бөглөх» хуудасны «Инженерийн төлөвлөсөн обьём»
 *                  баганын нүднүүдийг засаж, батлуулахаар илгээнэ
 *   · Батлагч    — илгээгдсэнийг батлах / буцаах
 *
 * ⚠️ Нэг хүн НЭГ БАГЦАД хоёр үүрэгтэй байвал ӨӨРИЙГӨӨ БАТЛАХ зам нээгдэхгүй:
 * `obyemBatlah.decideObyem` зохиогч=батлагч тохиолдлыг татгалзана. Гэхдээ
 * панел нь анхааруулга харуулна — админ мэдэлгүй тийм тохиргоо хийвэл тэр
 * багцын обьёмын засвар гацна (илгээх хүн бий, батлах хүн үгүй).
 *
 * ⚠️ ХАДГАЛАЛТ нь ХЭРЭГЛЭГЧЭЭР (`obyemAcl`: нэг аккаунт = нэг мөр). Энэ
 * панел түүнийг БАГЦААР эргүүлж харуулна — дэлгэцийн бүтэц ба хадгалалтын
 * бүтэц ӨӨР.
 */

import { useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import {
  ALL_BAGTS, listObyemAssigns, obyemFailedUsers, removeObyemAssign, setObyemAssign,
  subscribeObyemAcl, type ObyemAssign, type ObyemRole,
} from '@/lib/obyemAcl';
import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';
import { dirtyKeys, listUsers, subscribe } from '@/lib/permissions';
import { roleForUser } from '@/lib/services';
import s from './guitsetgel.module.css';

/** ⚠️ Шошгыг ЗУРАГДАХ агшинд — модулийн түвшинд `tr()` хэл солиход шинэчлэгдэхгүй */
const roleLabel = (r: ObyemRole): string =>
  (r === 'editor' ? tr('Засварлагч') : tr('Батлагч'));

const ROLES: ObyemRole[] = ['editor', 'approver'];

/** Тухайн багцад тэр үүргээр хуваарилагдсан аккаунтууд */
const usersOf = (rows: ObyemAssign[], group: string, role: ObyemRole): string[] =>
  rows
    .filter((a) => a.roles.includes(role)
      && (a.bagts.includes(ALL_BAGTS) || a.bagts.includes(group)))
    .map((a) => a.user);

export function ObyemAcl() {
  const [, tick] = useState(0);
  useEffect(() => subscribeObyemAcl(() => tick((n) => n + 1)), []);
  useEffect(() => subscribe(() => tick((n) => n + 1)), []);

  /**
   * ⚠️ Гараар бичихгүй — порталд БАЙГАА аккаунтаас л сонгоно.
   * ⚠️ Хатуу super-ийг САНАЛ БОЛГОХГҮЙ — түүнд хязгаар үйлчилдэггүй.
   */
  const all = listUsers().map((u) => u.username);
  const accounts = all.filter((a) => roleForUser(a) !== 'super');
  const known = new Set(all.map((a) => a.toLowerCase()));

  const rows = listObyemAssigns();
  const failed = new Set(obyemFailedUsers());
  /*
   * ⚠️ ХАСАЛТ УНАСНЫГ ПАНЕЛИЙН ТҮВШИНД ХЭЛНЭ (2026-09-08) — мөрийн `failed`
   *    тэмдэг нь ЗӨВХӨН жагсаагдсан аккаунт дээр зурагддаг тул хасалт унахад
   *    (мөр нь локалаас аль хэдийн арилсан) хаана ч харагдахгүй байв.
   *    `GuitsetgelAcl` / `QaqcAcl`-ийн ижил хяналт.
   */
  const orphanFail = [...failed].some((u) => !rows.some((a) => a.user === u));
  const dirtyPerms = new Set(dirtyKeys());
  const [err, setErr] = useState('');

  /**
   * БАГЦАД ААКАУНТ НЭМЭХ — тухайн хэрэглэгчийн мөрөнд багц ба үүргийг нэмнэ.
   *
   * ⚠️ «Бүх багц»-тай хүнд ДАХИН нэмэхгүй: түүний хүрээ аль хэдийн бүрэн тул
   *    жагсаалт руу буулгавал хүрээ нь ХУМИГДАНА (бүх багц → зөвхөн энэ нэг).
   *
   * ⚠️ ХӨНДЛӨН ҮРЖВЭРИЙГ ХААНА — FAIL-CLOSED (2026-09-08). Хадгалалт нь
   *    `{roles[], bagts[]}` буюу үүрэг × багцын ҮРЖВЭР (`obyemScope` нь
   *    `roles.includes` ба `bagts.includes`-ыг ТУСАД нь шалгадаг), харин
   *    панел нь багц бүрд, үүрэг бүрд тусдаа хөзөр харуулна. Тиймээс «Багц 1 ·
   *    Засварлагч»-тай хүнийг «Багц 2 · Батлагч» болгож нэмбэл тэр нь Багц 1-д
   *    ч БАТЛАГЧ болж, өөрийн засварыг батлах хос эрхийг олж авна — Багц 1 нь
   *    `stuck` (засварлагч=батлагч) болж ГАЦНА. Шинэ үүрэг ЭСВЭЛ шинэ багц
   *    нэмэх нь нөгөө хэмжээсийг өргөтгөх тохиолдолд үйлдлийг ЗОГСООЖ админд
   *    ил хэлнэ — хадгалалтын схемийг үүрэг тус бүрийн багцаар салгах
   *    хүртэлх хамгаалалт.
   */
  const addTo = (group: string, role: ObyemRole, user: string) => {
    const u = user.trim().toLowerCase();
    if (!u) return;
    const cur = rows.find((a) => a.user === u);
    const roles = [...new Set([...(cur?.roles ?? []), role])];
    let bagts: string[];
    if (!cur) {
      bagts = [group];
    } else if (cur.bagts.includes(ALL_BAGTS)) {
      bagts = cur.bagts; // хязгааргүй — хэвээр
    } else {
      bagts = [...new Set([...cur.bagts, group])];
    }
    /*
     * ⚠️ `ALL_BAGTS` НЬ УРТ 1 (2026-09-08). Хамгаалалт нь `bagts.length > 1`
     *    гэж тоолдог байсан тул `['*']` («бүх багц») хүрээтэй хүнийг ШҮҮДЭГГҮЙ
     *    байв — яг тэр нь ХАМГИЙН ӨРГӨН хүрээ. Үр дүнд нь UserAdmin-ы унтраалгаар
     *    `[ALL_BAGTS]`-тай болсон хүнд энд шинэ үүрэг нэмэхэд шалгалт чимээгүй
     *    өнгөрч, тэр үүрэг нь БҮХ 7 багцад тарж, зохиогч=батлагч давхцал үүсгэн
     *    багцуудыг гацаадаг байлаа. «Өргөн хүрээ» = ALL_BAGTS ЭСВЭЛ 1-ээс олон багц.
     */
    const wide = cur ? (cur.bagts.includes(ALL_BAGTS) || bagts.includes(ALL_BAGTS) || bagts.length > 1) : false;
    if (cur && (roles.length > cur.roles.length) && wide) {
      setErr(tr('«{0}» нь {1} багцад аль хэдийн хуваарилагдсан тул шинэ үүрэг нэмбэл ТЭР багцуудад ч үйлчилнэ. Эхлээд түүнийг хуваарилалтаас хасаад дараа нь дахин томилно уу.', user, cur.bagts.join(', ')));
      return;
    }
    /* ⚠️ Нөгөө чиглэлд ч ижил: `ALL_BAGTS` нэмэх нь урт нэмэгдэхгүй ч хүрээг
       хамгийн өргөн болгоно. `bagts.length > cur.bagts.length` нь `['Багц 1']`-ээс
       `['*']` руу шилжихийг ОГТ барихгүй тул тусад нь шалгана. */
    const widening = !!cur && (bagts.length > cur.bagts.length
      || (bagts.includes(ALL_BAGTS) && !cur.bagts.includes(ALL_BAGTS)));
    if (cur && widening && roles.length > 1) {
      setErr(tr('«{0}» нь {1} үүрэгтэй тул шинэ багц нэмбэл ТЭР үүргүүд нь ч шинэ багцад үйлчилнэ. Эхлээд түүнийг хуваарилалтаас хасаад дараа нь дахин томилно уу.', user, cur.roles.map(roleLabel).join(', ')));
      return;
    }
    const r = setObyemAssign(u, roles, bagts);
    setErr(r.ok ? '' : (r.error ?? ''));
    void r.sync;
  };

  /**
   * БАГЦААС ААКАУНТ ХАСАХ.
   *
   * ⚠️ ГУРВАН ТОХИОЛДОЛ:
   *   · «Бүх багц»-тай хүн — энэ багцаас ганцаарчлан хасах БОЛОМЖГҮЙ.
   *   · Энэ багц нь түүний СҮҮЛИЙНХ ба өөр үүрэг байхгүй — мөрийг бүхэлд нь
   *     хасна (эрх нь мөн буцаагдана).
   *   · Бусад — зөвхөн энэ багцыг (эсвэл үүргийг) хасна.
   */
  const removeFrom = (group: string, role: ObyemRole, user: string) => {
    const cur = rows.find((a) => a.user === user);
    if (!cur) return;
    /*
     * ⚠️ «БҮХ БАГЦ»-ТАЙ ХҮНИЙГ ЭНДЭЭС ХАСНА (2026-09-08). Урьд нь «доорх мөрөөс
     *    нь бүхэлд нь хасна уу» гэж заадаг байсан ч ТИЙМ МӨР UI-д ОГТ БАЙХГҮЙ:
     *    `removeObyemAssign` нь зөвхөн доорх `otherPkgs === 0 && otherRoles === 0`
     *    салаанаас дуудагддаг бөгөөд `ALL_BAGTS`-тай хүн тэнд хэзээ ч хүрэхгүй.
     *    Үр дүнд нь санамсаргүй «бүх багц» болгосон хуваарилалтыг ХАСАХ ЗАМГҮЙ
     *    үлдэж, тэр хүн бүх багцад засварлагч ба батлагч хоёул болж, обьёмын
     *    батлах урсгал бүхэлдээ гацдаг байв (`decideObyem` зохиогч=батлагчийг
     *    татгалздаг). Хүрээ нь багцаар салгагддаггүй тул хасалт нь БҮТЭН мөрөөр.
     */
    if (cur.bagts.includes(ALL_BAGTS)) {
      if (!window.confirm(tr('«{0}» нь БҮХ багцад хуваарилагдсан тул нэг багцаас нь салгаж хасах боломжгүй. Хуваарилалтыг нь БҮХЭЛД НЬ хасах уу? «Инженерийн обьём засах» ба «Инженерийн обьём батлах» эрх нь мөн буцаагдана.', user))) return;
      setErr('');
      void removeObyemAssign(user).sync;
      return;
    }
    setErr('');
    /* Тэр хүн энэ үүргээр ӨӨР багцад ажилладаг эсэх */
    const otherPkgs = cur.bagts.filter((b) => b !== group);
    /* Энэ багцад НӨГӨӨ үүрэг нь үлдэх үү */
    const otherRoles = cur.roles.filter((r) => r !== role);

    if (otherPkgs.length === 0 && otherRoles.length === 0) {
      if (!window.confirm(tr('«{0}»-г инженерийн обьёмын хуваарилалтаас бүрэн хасах уу? «Инженерийн обьём засах» ба «Инженерийн обьём батлах» эрх нь мөн буцаагдана.', user))) return;
      void removeObyemAssign(user).sync;
      return;
    }
    if (otherPkgs.length === 0) {
      /* Багц нь ганц — үүргийг нь л хасна, багц хэвээр */
      void setObyemAssign(user, otherRoles, cur.bagts).sync;
      return;
    }
    /*
     * ⚠️ ОЛОН БАГЦТАЙ ҮЕД зөвхөн энэ БАГЦЫГ хасна — үүрэг нь бусад багцад
     *    хэвээр үйлчилнэ. Үүргийг хасвал бүх багцад нь алга болно.
     *
     * ⚠️ ГЭХДЭЭ ЭНЭ БАГЦАД НӨГӨӨ ҮҮРЭГ НЬ БАЙВАЛ ЗОГСОНО (2026-09-08).
     *    Хадгалалт нь үржвэр тул `bagts`-аас `group`-ыг хасахад тэр багц дахь
     *    НӨГӨӨ үүрэг нь ч чимээгүй алга болно — админ зөвхөн засварлагчийг
     *    хасахыг хүссэн атлаа тэр багцын цорын ганц батлагчаа алдаж болно.
     */
    if (otherRoles.length > 0) {
      setErr(tr('«{0}» нь энэ багцад {1} үүрэгтэй ч байна — хадгалалт нь үүргийг багцаар салгадаггүй тул ганцаарчлан хасах боломжгүй. Мөрийг бүхэлд нь хасаад дахин томилно уу.', user, otherRoles.map(roleLabel).join(', ')));
      return;
    }
    void setObyemAssign(user, cur.roles, otherPkgs).sync;
  };

  return (
    <div className={s.aclWrap}>
      <p className={s.aclNote}>
        {tr('Багц тус бүрд Засварлагч ба Батлагч аккаунтыг тусад нь томилно. Нэг багцад хэдэн ч аккаунт байж болно.')}
        {' '}
        {tr('Засварлагч «Гүйцэтгэл бөглөх» хуудасны «Инженерийн төлөвлөсөн обьём» баганыг засаж батлуулахаар илгээнэ; батлагч зөвшөөрсний дараа л утга үндсэн өгөгдөлд бичигдэнэ.')}
        {' '}
        {tr('⚠️ Гүйцэтгэлийн урсгал ба хуваарийн эрхээс ТУСДАА: обьёмын үүрэг олгосон нь гүйцэтгэл зөвшөөрөх, хуваарь засах эрх өгөхгүй.')}
      </p>
      {err && <div className={s.aclErr} role="alert">{err}</div>}
      {orphanFail && (
        <div className={s.aclErr} role="alert">
          {tr('⚠️ ArcGIS-т бичигдсэнгүй — хуваарилалт түр зөвхөн энэ browser-т. Холболтоо шалгаад дахин оролдоно уу.')}
        </div>
      )}

      <div className={s.aclGrid}>
        {PKG_GROUPS.map((g) => (
          <PkgCol
            key={g}
            group={g}
            rows={rows}
            accounts={accounts}
            known={known}
            failed={failed}
            dirtyPerms={dirtyPerms}
            onAdd={addTo}
            onRemove={removeFrom}
          />
        ))}
      </div>
    </div>
  );
}

/** НЭГ БАГЦЫН хөзөр — Засварлагч ба Батлагчийн жагсаалт */
function PkgCol({
  group, rows, accounts, known, failed, dirtyPerms, onAdd, onRemove,
}: {
  group: string;
  rows: ObyemAssign[];
  accounts: string[];
  known: Set<string>;
  failed: Set<string>;
  dirtyPerms: Set<string>;
  onAdd: (group: string, role: ObyemRole, user: string) => void;
  onRemove: (group: string, role: ObyemRole, user: string) => void;
}) {
  const editors = usersOf(rows, group, 'editor');
  const approvers = usersOf(rows, group, 'approver');
  /**
   * ⚠️ ГАЦААНЫ АНХААРУУЛГА: засварлагч нь бий атлаа батлагч нь ЗӨВХӨН тэр өөрөө
   *    бол илгээсэн засварыг нь хэн ч батлах боломжгүй болно
   *    (`decideObyem` өөрийгөө батлахыг татгалздаг). Багц бүхэлдээ гацна.
   */
  const usable = approvers.filter((u) => !editors.includes(u));
  const stuck = editors.length > 0 && approvers.length > 0 && usable.length === 0;

  return (
    <div className={s.aclCol}>
      <div className={s.aclHead}>
        <span>{group}</span>
        <span className={s.aclCount}>{editors.length + approvers.length}</span>
      </div>

      {ROLES.map((role) => {
        const list = role === 'editor' ? editors : approvers;
        /* Тэр багцад тэр үүргээр аль хэдийн байгааг санал болгохгүй */
        const free = accounts.filter((a) => !list.includes(a.toLowerCase()));
        return (
          <RoleBlock
            key={role}
            group={group}
            role={role}
            list={list}
            free={free}
            known={known}
            failed={failed}
            dirtyPerms={dirtyPerms}
            onAdd={onAdd}
            onRemove={onRemove}
          />
        );
      })}

      {stuck && (
        <div className={s.aclErr} role="alert">
          {tr('⚠️ Батлагч нь засварлагчтай ижил хүн — өөрийн илгээснийг өөрөө батлах боломжгүй тул энэ багцын обьёмын засвар гацна. Өөр батлагч нэмнэ үү.')}
        </div>
      )}
      {editors.length > 0 && approvers.length === 0 && (
        <div className={s.aclErr} role="alert">
          {tr('⚠️ Батлагч томилоогүй — илгээсэн засварыг хэн ч батлахгүй.')}
        </div>
      )}
    </div>
  );
}

/** Нэг үүргийн блок — жагсаалт + нэмэх сонгогч */
function RoleBlock({
  group, role, list, free, known, failed, dirtyPerms, onAdd, onRemove,
}: {
  group: string;
  role: ObyemRole;
  list: string[];
  free: string[];
  known: Set<string>;
  failed: Set<string>;
  dirtyPerms: Set<string>;
  onAdd: (group: string, role: ObyemRole, user: string) => void;
  onRemove: (group: string, role: ObyemRole, user: string) => void;
}) {
  const [add, setAdd] = useState('');

  return (
    <div className={s.aclRole}>
      <div className={s.aclRoleHead}>{roleLabel(role)}</div>

      {list.length === 0 && (
        <div className={s.aclEmpty}>
          {role === 'editor' ? tr('Засварлагч томилоогүй') : tr('Батлагч томилоогүй')}
        </div>
      )}

      {list.map((u) => (
        <div key={u} className={s.aclUser}>
          <span className={s.aclName} title={u}>{u}</span>
          {!known.has(u) && (
            <span className={s.aclEmpty} title={tr('устгагдсан аккаунт')}>⚠️</span>
          )}
          {failed.has(u) && (
            <span className={s.aclErr} title={tr('ArcGIS-т хадгалагдсангүй — зөвхөн энэ browser-т')}>⚠️</span>
          )}
          {dirtyPerms.has(u) && (
            <span className={s.aclErr} title={tr('Эрхийн мөр ArcGIS-т хадгалагдсангүй — «Хэрэглэгчдийн эрх удирдах» → «Дахин синк»')}>⚠️</span>
          )}
          <button
            type="button"
            className={s.aclX}
            title={tr('Энэ багцаас хасах')}
            onClick={() => onRemove(group, role, u)}
          >
            ✕
          </button>
        </div>
      ))}

      <div className={s.aclAdd}>
        {/* ⚠️ Гараар бичихгүй — порталд БАЙГАА аккаунтаас л сонгоно. */}
        <select
          className={s.aclInput}
          value={add}
          onChange={(e) => setAdd(e.target.value)}
          disabled={free.length === 0}
        >
          <option value="">{free.length ? tr('Аккаунт нэмэх…') : tr('Чөлөөтэй аккаунт алга')}</option>
          {free.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button
          type="button"
          className={s.aclBtn}
          disabled={!add.trim()}
          onClick={() => { onAdd(group, role, add); setAdd(''); }}
        >
          {tr('Нэмэх')}
        </button>
      </div>
    </div>
  );
}
