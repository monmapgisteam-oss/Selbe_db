'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

import { t as tr } from '@/lib/i18nCore';

/**
 * ХАМГИЙН ГАДНА ДАВХАРГЫН АЛДААНЫ ХАШЛАГА (2026-08 аудит, олдвор #9).
 *
 * ⚠️ Яагаад хэрэгтэй вэ: портал 5+ гадаад үйлчилгээний АМЬД өгөгдлөөр рендер
 * хийдэг тул талбарын бүтэц өөрчлөгдөх, гэнэтийн null/NaN зэрэг нь аль нэг
 * компонентод рендерийн throw үүсгэж болно. Хашлагагүй үед React 19 бүх
 * root-оо unmount хийж, статик export тул сервер fallback ч байхгүй —
 * хэрэглэгч Next-ийн стайлгүй англи «Application error…» хуудас л харна.
 * `useAsync` зөвхөн async алдааг барьдаг, рендерийн throw-г хамгаалахгүй.
 *
 * ⚠️ Class компонент байх ШАЛТГААН: React 19-д ч алдаа барих цорын ганц зам
 * нь `getDerivedStateFromError`/`componentDidCatch` — hook-оор ийм API алга.
 * Мөн заавал 'use client': layout.tsx нь сервер компонент тул class-ыг
 * шууд тэнд бичиж болохгүй (SkipLink-тэй ижил хуваалт).
 *
 * ⚠️ Fallback-ийн стайл ЗОРИУД inline: алдаа CSS модулиудын аль нэгэнд
 * холбоотой байж ч болзошгүй тул зөвхөн globals.css-ийн токенуудад найдна
 * (тэдгээр нь root layout-д үргэлж ачаалагдсан байдаг).
 */

/**
 * ⚠️ 2026-10-05: CHUNK АЧААЛАГДААГҮЙ алдаа мөн үү (JS/CSS). Портал нь GitHub Pages дээрх
 *    статик экспорт — шинэ хувилбар байршуулахад хуучин chunk-ийн hash-тай файлууд УСТДАГ тул
 *    нээлттэй таб дараагийн харагдацаа нээхэд 404 авна. «Дахин оролдох» (төлөв цэвэрлэх)
 *    тусгүй: `next/dynamic` унасан амлалтаа хадгалдаг, файл ч сервер дээр байхгүй.
 *    Цорын ганц засвар — хуудсыг дахин ачаалах. `ui.friendlyError` мөн үүнийг ашиглана.
 * ⚠️ АВТОМАТААР reload ХИЙХГҮЙ — хадгалаагүй ажил алдагдана; товчийг хэрэглэгч өөрөө дарна
 *    (`navGuard`-ийн `beforeunload` хамгаалалт хэвээр ажиллана).
 */
export function isChunkLoadError(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name ?? '';
  const m = String((e as { message?: string } | null)?.message ?? e ?? '');
  return name === 'ChunkLoadError'
    || /loading (css )?chunk \S+ failed|chunkloaderror|failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i.test(m);
}

/** Chunk-ийн алдааны хэрэглэгчийн мессеж — хашлага ба `friendlyError` НЭГ мөр хуваалцана */
export const chunkErrorText = (): string => tr('Порталын шинэ хувилбар гарсан — хуудсыг дахин ачаална уу');

const BTN_STYLE = {
  padding: '6px 16px',
  borderRadius: 8,
  border: '1px solid var(--line-strong)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  font: 'inherit',
  fontSize: 12,
  cursor: 'pointer',
} as const;

type Props = {
  children: ReactNode;
  /**
   * ХАРАГДАЦЫН хүрээнд ажиллах горим (2026-09-03-ны хэрэглэгч талын аудит).
   *
   * ⚠️ Урьд нь хашлага ЗӨВХӨН root-д байсан тул нэг модулийн рендерийн throw
   * бүх порталыг (навигац, каталог, газрын зураг, ХАДГАЛААГҮЙ НООРОГ) бүтэн
   * дэлгэцийн алдаагаар СОЛИДОГ байв. Модуль бүрийг тусад нь ороосноор
   * унасан харагдац л мессеж болж, бусад нь ажиллаж үлдэнэ.
   *
   * ⚠️ Дуудагч нь харагдац бүрд ӨӨР `key` өгнө: React нь `key` солигдоход
   * хашлагыг remount хийдэг тул харагдац сольсны дараа хуучин алдаа арилна.
   */
  scope?: 'view';
  /** Дэлгэцэд харагдах нэр — «Санхүүжилт нээгдсэнгүй» гэх мэт */
  label?: string;
};
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Статик export — серверийн лог байхгүй тул console л цорын ганц мөр
    console.error('ErrorBoundary:', error, info.componentStack);
  }

  render() {
    /* ⚠️ 2026-10-05: chunk-ийн алдаа — ХОЁР горимд ИЖИЛ: «шинэ хувилбар» + reload товч
       (`isChunkLoadError`-ийн ⚠️). Харагдацын горимд бүтэн дэлгэц эзлэхгүй хэвээр. */
    if (this.state.error && isChunkLoadError(this.state.error)) {
      const view = this.props.scope === 'view';
      return (
        <div
          role="alert"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            minHeight: view ? 240 : '100dvh',
            height: view ? '100%' : undefined,
            padding: 24,
            background: view ? undefined : 'var(--bg)',
            color: 'var(--ink)',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 600 }}>{chunkErrorText()}</p>
          <button type="button" onClick={() => location.reload()} style={BTN_STYLE}>
            {tr('Хуудсыг дахин ачаалах')}
          </button>
        </div>
      );
    }
    if (this.state.error && this.props.scope === 'view') {
      /* ⚠️ ХАРАГДАЦЫН fallback: бүтэн дэлгэц ЭЗЛЭХГҮЙ, reload ч ХИЙХГҮЙ —
         навигац амьд үлддэг тул хэрэглэгч өөр харагдац руу шилжиж ажлаа
         үргэлжлүүлнэ. «Дахин оролдох» нь зөвхөн ЭНЭ хашлагын төлөвийг арилгана
         (root-ынхоос ялгаатай: тэнд бүтэн reload хэрэгтэй байдаг). */
      return (
        <div
          role="alert"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            minHeight: 240,
            height: '100%',
            padding: 24,
            color: 'var(--ink)',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 600 }}>
            {this.props.label ?? tr('Энэ хэсэг нээгдсэнгүй')}
          </p>
          <p style={{ fontSize: 12, color: 'var(--ink-3)', maxWidth: 460 }}>
            {tr('Бусад хэсэг ажиллаж байгаа — цэсээр өөр харагдац руу шилжиж болно.')}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            style={{
              padding: '6px 16px',
              borderRadius: 8,
              border: '1px solid var(--line-strong)',
              background: 'var(--surface)',
              color: 'var(--ink)',
              font: 'inherit',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {tr('Дахин оролдох')}
          </button>
        </div>
      );
    }
    if (this.state.error) {
      return (
        <div
          role="alert"
          style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: 24,
            background: 'var(--bg)',
            color: 'var(--ink)',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 15, fontWeight: 600 }}>
            {tr('Алдаа гарлаа — хуудсыг дахин ачаална уу')}
          </p>
          {/* ⚠️ Remount БИШ, бүтэн reload: рендерийн throw ихэвчлэн санах ойн
              кэштэй өгөгдлөөс детерминист давтагддаг тул зөвхөн state
              цэвэрлэвэл дороо дахин унана. Reload нь кэшийг шинээр эхлүүлнэ. */}
          <button
            type="button"
            onClick={() => location.reload()}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: '1px solid var(--line-strong)',
              background: 'var(--surface)',
              color: 'var(--ink)',
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            {tr('Дахин оролдох')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
