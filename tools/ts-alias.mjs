/**
 * `ts-alias-hooks.mjs`-ийг Node-ийн модулийн шийдвэрлэгчид БҮРТГЭНЭ.
 *
 * ⚠️ `--import <hooks>` дангаараа хангалтгүй: тэр нь файлыг зүгээр л ажиллуулна.
 * `resolve` дэгээ ажиллахын тулд `register()`-ээр тусад нь бүртгэх ёстой.
 *
 * Хэрэглээ:  node --import ./tools/ts-alias.mjs <тестийн файл>
 */

import { register } from 'node:module';

register('./ts-alias-hooks.mjs', import.meta.url);
