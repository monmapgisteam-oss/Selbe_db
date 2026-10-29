/**
 * BUILD-ИЙН ТАНИХ ТЭМДЭГ — байршуулсан сайт аль commit-оос болсныг хэрэглэгчид харуулна (2026-10-26, аудит G3).
 */
export const BUILD_SHA: string = (process.env.NEXT_PUBLIC_BUILD_SHA ?? '').trim();

/** Товч хэлбэр — commit-ийн эхний 7 тэмдэгт, эсвэл «dev» */
export const buildLabel = (sha: string = BUILD_SHA): string => (/^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7).toLowerCase() : 'dev');
