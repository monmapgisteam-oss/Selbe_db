'use client';

/**
 * ЭРХИЙН ДЭЛГЭЦИЙН ШОШГО — тойм, матриц, хэрэглэгчийн карт гурвын НЭГ эх (2026-09-25).
 */

import { t as tr } from '@/lib/i18nCore';
import type { CapKey } from '@/lib/caps';
import type { PkgIssue, MatrixCol } from '@/lib/erhOverview';
import type { DerivedSys } from '@/lib/aclRoleCaps';
import { STAGE_LABEL } from '@/lib/hyanaltGroup';
import type { Stage } from '@/lib/hyanalt';

/** Үүрэгтэй систем (тойм, карт) */
export type ScopedKind = 'huvaari' | 'obyem' | 'chanar' | 'ajil' | 'butets';

/** Үүргийн монгол нэр — дэд систем бүрд өөр */
export const roleLabel = (kind: ScopedKind, role: string): string => {
  if (kind === 'huvaari') return role === 'author' ? tr('Зохиогч') : tr('Батлагч');
  if (kind === 'ajil') return role === 'editor' ? tr('Мөр нэмэгч') : tr('Батлагч');
  if (kind === 'chanar') {
    if (role === 'author') return tr('Гүйцэтгэгч');
    if (role === 'tuh') return tr('ТУХ');
    if (role === 'chanar') return tr('Чанар');
    if (role === 'habea') return tr('ХАБЭА');
    if (role === 'tug') return tr('ТУГ');
    if (role === 'cheng') return tr('ЧХ инженер');
    return role;
  }
  return role === 'editor' ? tr('Засварлагч') : tr('Батлагч');
};

/** «tuh, habea» → «ТУХ, ХАБЭА» */
export const chanarRoleNames = (list: string): string =>
  list.split(',').map((r) => roleLabel('chanar', r.trim())).join(', ');

/** Багцын жагсаалт — `null` = бүх багц */
export const bagtsText = (b: string[] | null): string =>
  (b === null ? tr('бүх багц') : b.join(' · '));

/** Системийн гарчиг */
export const sysTitle = (sys: DerivedSys | 'flow'): string => {
  if (sys === 'flow') return tr('Гүйцэтгэлийн урсгал');
  if (sys === 'huvaari') return tr('Хуваарь');
  if (sys === 'obyem') return tr('Инженерийн обьём');
  if (sys === 'ajil') return tr('Нэмэлт ажил');
  if (sys === 'chanar') return tr('Чанарын баримт');
  return tr('Дэд бүтцийн засвар');
};

/** Матрицын баганын шошго */
export const colLabel = (c: MatrixCol): string => {
  if (c.sys === 'flow') return STAGE_LABEL[c.role as Stage];
  return roleLabel(c.sys, c.role);
};

export const capLabelShort = (k: CapKey): string => {
  if (k === 'addRow') return tr('Мөр нэмэх');
  if (k === 'zovshoorol') return tr('Зөвшөөрөл');
  if (k === 'finEdit') return tr('Санхүү — утга');
  if (k === 'finRow') return tr('Санхүү — мөр');
  if (k === 'plan') return tr('Хуваарь зохиох');
  if (k === 'planApprove') return tr('Хуваарь батлах');
  if (k === 'obyemEdit') return tr('Обьём засах');
  if (k === 'obyemApprove') return tr('Обьём батлах');
  if (k === 'ajilApprove') return tr('Нэмэлт ажил батлах');
  if (k === 'chanarAuthor') return tr('Чанарын баримт ирүүлэх');
  if (k === 'chanarReview') return tr('Чанарын баримт хянах');
  if (k === 'gazar') return tr('Газар');
  if (k === 'butets') return tr('Дэд бүтэц');
  if (k === 'hamaaral') return tr('Багцын хамаарал');
  if (k === 'habeaData') return tr('ХАБЭА-ийн бүртгэл');
  if (k === 'sysClose') return tr('Систем хаах');
  if (k === 'docsUpload') return tr('Баримт оруулах');
  if (k === 'docsGroups') return tr('Баримтын бүлэг');
  if (k === 'zuragEdit') return tr('ТЭЗҮ, зураг төсөл');
  if (k === 'cfSwitch') return tr('Сарын мөнгө → Хуваарь');
  return k;
};

/** Цоорхойн мессеж — `erhOverview.pkgIssues` тайлбарын дагуу */
export const issueText = (i: PkgIssue): string => {
  const base = issueBase(i);
  return i.superOnly
    ? `${base} ${tr('(Одоогоор зөвхөн админ (super) шийдвэрлэх боломжтой — энгийн хариуцагч томилоогүй.)')}`
    : base;
};

const issueBase = (i: PkgIssue): string => {
  if (i.key === 'huvaariNoApprover') {
    return tr('{0}: хуваарийн батлагч томилоогүй — илгээсэн хуваарийг хэн ч батлахгүй.', i.args[0]);
  }
  if (i.key === 'huvaariSelfApprove') {
    return tr('{0}: {1} нь зохиогч БА батлагч хоёулаа — өөрийн илгээснийг өөрөө батлах боломжгүй тул хуваарь гацна.', i.args[0], i.args[1]);
  }
  if (i.key === 'obyemNoApprover') {
    return tr('{0}: обьёмын батлагч томилоогүй — илгээсэн засварыг хэн ч батлахгүй.', i.args[0]);
  }
  if (i.key === 'obyemSelfApprove') {
    return tr('{0}: {1} нь засварлагч БА батлагч хоёулаа — обьёмын засвар гацна.', i.args[0], i.args[1]);
  }
  if (i.key === 'ajilNoApprover') {
    return tr('{0}: нэмэлт ажлын батлагч томилоогүй — нэмсэн ажлын мөрийг хэн ч батлахгүй.', i.args[0]);
  }
  if (i.key === 'ajilSelfApprove') {
    return tr('{0}: {1} нь мөр нэмэгч БА батлагч хоёулаа — нэмэлт ажил гацна.', i.args[0], i.args[1]);
  }
  if (i.key === 'chanarNoReviewer') {
    return tr('{0}: чанарын баримтын хянагч дутуу ({1}) — тухайн төрлийн хянагч бүгд зөвшөөрөх ёстой тул ирүүлсэн баримт хэзээ ч батлагдахгүй.', i.args[0], chanarRoleNames(i.args[1]));
  }
  if (i.key === 'chanarOneManRoles') {
    return tr('{0}: {3} нь {2} үүргийн цорын ганц хянагч ({1}) — нэг хүн зөвхөн нэг үүргээр хянадаг тул баримт гацна.', i.args[0], i.args[1], chanarRoleNames(i.args[2]), i.args[3]);
  }
  if (i.key === 'flowGap') {
    return tr('{0}: гүйцэтгэлийн урсгалын {1} шат томилогдоогүй — илгээлт тэр шатанд зогсоно.', i.args[0], i.args[1]);
  }
  if (i.key === 'flowEmpty') {
    return tr('{0}: гүйцэтгэлийн урсгалын долоон шат бүгд томилогдоогүй — энэ багцын гүйцэтгэлийг хэн ч бөглөж, батлахгүй.', i.args[0]);
  }
  return i.key;
};

export const newAccountMsg = (): string => tr('Эхлээд хадгална уу — хуваарилалт хадгалагдсан аккаунтад л олгогдоно.');
export const removeMarkedMsg = (): string => tr('Устгахаар тэмдэглэсэн — хуваарилалт засахгүй.');
export const draftFlowMsg = (): string =>
  tr('Хадгалаагүй ноорогтой — урсгалын томилгоо энэ хүний эрхийн мөрийг бичдэг тул эхлээд «Хадгалах» эсвэл «Болих» дарна уу.');
