/**
 * BUILD-ИЙН ТАНИХ ТЭМДЭГ — байршуулсан сайт аль commit-оос болсныг хэрэглэгчид харуулна (2026-10-26, аудит G3).
 *
 * ⚠️ ЯАГААД: алдааны мэдээлэл («өчигдрөөс ингэж байна») ирэхэд сайт аль commit дээр байгааг мэдэх арга зөвхөн
 *    GitHub-ийн Pages deployment түүх байв. CI (`deploy.yml` · `test.yml`) `NEXT_PUBLIC_BUILD_SHA: ${{ github.sha }}`
 *    өгнө — build үед JS багцад шингэнэ. Нууц БИШ (нийтийн репогийн commit). Локал/dev-д хоосон → «dev».
 * ⚠️ `process.env.NEXT_PUBLIC_…`-ийг ЯГ ингэж (бүтэн нэрээр) уншина — Next.js зөвхөн шууд хандалтыг орлуулдаг.
 */
export const BUILD_SHA: string = (process.env.NEXT_PUBLIC_BUILD_SHA ?? '').trim();

/** Товч хэлбэр — commit-ийн эхний 7 тэмдэгт, эсвэл «dev» */
export const buildLabel = (sha: string = BUILD_SHA): string => (/^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7).toLowerCase() : 'dev');
