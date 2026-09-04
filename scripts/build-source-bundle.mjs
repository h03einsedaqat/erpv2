/**
 * ساختِ «فایلِ زیپِ سورس» درونِ خروجیِ ساخت
 * ---------------------------------------------------------------------
 * چرا این فایل exists دارد؟ چون یک مسیرِ API روی میزبان‌هایی که فقط فایلِ ثابت
 * تحویل می‌دهند (مثل GitHub Pages یا پیش‌نمایشِ ایستا) کار نمی‌کند و به‌جای زیپ،
 * همان صفحه‌ی HTML را برمی‌گرداند. با این روش، فایلِ زیپ یک داراییِ ساده است که
 * با یک لینکِ معمولی دانلود می‌شود — نیازی به ورود، نشست یا سرور ندارد.
 *
 * اجرا:  node --import tsx scripts/ساخت-بسته-سورس.mjs [نامِ پوشه‌ی خروجی]
 * پیش‌فرضِ خروجی: dist/source.zip
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildSourceBundle } from '../server/source-export.ts';

const outDir = process.argv[2] ?? 'dist';
const target = join(process.cwd(), outDir);

if (!existsSync(target)) mkdirSync(target, { recursive: true });

const bundle = buildSourceBundle();
// نامِ فایل انگلیسی و ثابت است تا در هر میزبانی و هر سیستمی بی‌دردسر دانلود شود
const zipPath = join(target, 'source.zip');
writeFileSync(zipPath, bundle.zip);

const kb = (bytes) => `${Math.round(bytes / 1024).toLocaleString('fa-IR')} کیلوبایت`;
console.log(`▸ بسته‌ی سورس آماده شد: ${outDir}/source.zip — ${bundle.files} فایل — ${kb(bundle.zip.length)}`);
