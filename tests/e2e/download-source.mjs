/**
 * سناریوی end-to-end: «دانلودِ سورسِ کامل» از صفحه‌ی ورود
 * ---------------------------------------------------------------------
 * پیشینه: نسخه‌ی پیشین این دکمه یک مسیرِ API بود. روی میزبان‌هایی که فقط فایلِ
 * ثابت تحویل می‌دهند، آن مسیر به‌جای زیپ همان صفحه‌ی HTML را برمی‌گرداند و کاربر
 * یک فایلِ html با نامِ zip می‌گرفت. اکنون زیپ هنگامِ ساخت ساخته می‌شود و با یک
 * لینکِ ساده از صفحه‌ی ورود دانلود می‌شود؛ این تست همان را می‌سنجد:
 *
 * ۱) فایلِ واقعی در خروجیِ ساخت وجود دارد و زیپِ سالمی است (نه HTML).
 * ۲) لینکِ دانلود در صفحه‌ی ورود (پیش از ورود) دیده می‌شود.
 * ۳) سرور آن را با نوعِ درست (application/zip) می‌دهد.
 * ۴) در نسخه‌ی نمایشیِ ایستا هم فایل هست (برای انتشار روی Pages).
 * ۵) هیچ راز/داده‌ی زنده‌ای در بسته نیست.
 */
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createChecker } from './harness.mjs';

const { check, state } = createChecker();
const base = new URL('../../', import.meta.url).pathname;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * بالا آوردنِ فقطِ «صفحه‌ی ورود» — بدونِ ورود، بدونِ سرور.
 * (چرا: دکمه‌ی دانلود باید پیش از ورود هم در دسترس باشد، پس باید همین صفحه
 * را بی‌واسطه بررسی کرد، نه داشبورد را.)
 */
async function bootLanding({ online = false } = {}) {
  const html = readFileSync(`${base}/dist/index.html`, 'utf8')
    .replace(/<script type="module"[^>]*><\/script>/g, '')
    .replace(/<link rel="stylesheet"[^>]*>/g, '');
  const asset = readFileSync(`${base}/dist/index.html`, 'utf8').match(/assets\/(index-[\w-]+\.js)/)[1];
  const bundle = readFileSync(`${base}/dist/assets/${asset}`, 'utf8');
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost:8080/', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const { window } = dom;
  // پیش‌فرض آفلاین است (نسخه‌ی ورود نباید درخواستی بفرستد)؛ برای سناریویِ دانلود آنلاین می‌شود
  window.fetch = online
    ? (input, init) => fetch(new URL(String(input), 'http://localhost:8080/'), init)
    : () => Promise.reject(new Error('offline'));
  window.localStorage.clear();
  const script = window.document.createElement('script');
  script.textContent = bundle;
  window.document.body.appendChild(script);
  await wait(900);
  return { window, doc: window.document };
}

/** آیا این فایل واقعاً زیپ است؟ (امضای PK در آغازِ فایل) */
const isZip = (file) => {
  const head = readFileSync(file).subarray(0, 4);
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
};

async function run() {
  /* ------------------- ۱) فایلِ زیپ در خروجیِ ساخت ------------------- */
  const built = join(base, 'dist/source.zip');
  check('فایلِ زیپ هنگامِ ساخت تولید شده است', existsSync(built));
  check('این فایل واقعاً زیپ است، نه یک صفحه‌ی HTML', existsSync(built) && isZip(built));

  /* ------------------- ۲) سلامت و محتوای بسته ------------------- */
  const dir = mkdtempSync(join(tmpdir(), 'rakahar-zip-'));
  const copy = join(dir, 'source.zip');
  writeFileSync(copy, readFileSync(built));
  let entries = [];
  try {
    entries = execFileSync('unzip', ['-Z1', copy], { encoding: 'utf8' }).split('\n').filter(Boolean);
    check('زیپ سالم است و باز می‌شود', entries.length > 20, `${entries.length} ورودی`);
  } catch (error) {
    check('زیپ سالم است و باز می‌شود', false, String(error).slice(0, 120));
  }
  const has = (name) => entries.some((entry) => entry === name || entry.endsWith(`/${name}`));
  check('کدِ سرور در بسته هست', has('server/index.ts'));
  check('رابطِ برنامه در بسته هست', has('src/main.ts') && has('src/styles.css'));
  check('مستندات در بسته هست', entries.some((entry) => entry.startsWith('docs/')));
  check('تست‌ها در بسته هست', entries.some((entry) => entry.startsWith('tests/')));
  check('تنظیماتِ انتشار در بسته هست', entries.some((entry) => entry.includes('.github/workflows')));
  check('یادداشتِ راهنما درِ بسته هست', entries.some((entry) => !entry.includes('/') && entry.endsWith('.txt')));

  const forbidden = entries.filter((entry) =>
    /(^|\/)\.env(\.|$)/.test(entry) ||
    /(^|\/)node_modules\//.test(entry) ||
    /(^|\/)\.data\//.test(entry) ||
    /(^|\/)dist\//.test(entry) ||
    /\.(pem|key|p12|pfx)$/i.test(entry),
  );
  check('هیچ راز یا داده‌ی زنده‌ای در بسته نیست', forbidden.length === 0, forbidden.slice(0, 3).join('، ') || 'پاک');
  rmSync(dir, { recursive: true, force: true });

  /* ------------- ۳) لینکِ دانلود در صفحه‌ی ورود (بدونِ نیاز به ورود) ------------- */
  const { doc } = await bootLanding();
  check('صفحه‌ی ورود نمایش داده می‌شود', Boolean(doc.querySelector('.landing-page')));
  const links = [...doc.querySelectorAll('a.source-download')];
  check('لینکِ دانلود در صفحه‌ی ورود دیده می‌شود', links.length > 0, `${links.length} لینک`);
  check(
    'همه‌ی لینک‌ها به فایلِ زیپ اشاره می‌کنند',
    links.length > 0 && links.every((link) => (link.getAttribute('href') ?? '').endsWith('source.zip')),
    links.map((link) => link.getAttribute('href')).join('، '),
  );
  check('لینک نشانِ «دانلود» دارد (مرورگر ذخیره می‌کند نه باز کردن)', links.every((link) => link.hasAttribute('download')));
  check(
    'برچسبِ لینک فارسی است',
    links.every((link) => /دانلود/.test(link.textContent ?? '')),
    links[0]?.textContent?.trim() ?? '—',
  );
  check('دیگر دکمه‌ی شناور در داشبورد نیست', !doc.querySelector('#source-download-fab'));

  /* ------------- ۴) پاسخِ سرور: نوعِ درست برای زیپ ------------- */
  const response = await fetch('http://localhost:8080/source.zip');
  check('سرور فایلِ زیپ را در دسترس می‌گذارد', response.status === 200, `پاسخ: ${response.status}`);
  check(
    'نوعِ پاسخ «application/zip» است',
    (response.headers.get('content-type') ?? '').includes('zip'),
    response.headers.get('content-type') ?? '—',
  );
  const bytes = Buffer.from(await response.arrayBuffer());
  check('پاسخِ سرور واقعاً زیپ است (نه HTML)', bytes[0] === 0x50 && bytes[1] === 0x4b, `${bytes.subarray(0, 4).toString('hex')}`);

  /* ------------- ۵) الزام‌های برنامه‌های مدیریتِ دانلود (مثل IDM) -------------
     این برنامه‌ها نخست درخواستِ HEAD می‌فرستند و بدونِ Content-Length و
     Accept-Ranges با خطای «سرور یافت نشد» متوقف می‌شوند.                      */
  const head = await fetch('http://localhost:8080/source.zip', { method: 'HEAD' });
  check('درخواستِ HEAD پاسخِ موفق دارد', head.ok, `پاسخ: ${head.status}`);
  check(
    'HEAD نوعِ فایل را می‌فرستد',
    (head.headers.get('content-type') ?? '').includes('zip'),
    head.headers.get('content-type') ?? '—',
  );
  check(
    'HEAD اندازه‌ی فایل را می‌فرستد (الزامی برای IDM)',
    Number(head.headers.get('content-length') ?? 0) > 1000,
    head.headers.get('content-length') ?? 'ندارد',
  );
  check(
    'پشتیبانی از دریافتِ بخشی اعلام می‌شود',
    (head.headers.get('accept-ranges') ?? '') === 'bytes',
    head.headers.get('accept-ranges') ?? 'ندارد',
  );
  check(
    'برچسبِ «ضمیمه» برای ذخیره‌شدن فرستاده می‌شود',
    (head.headers.get('content-disposition') ?? '').includes('attachment'),
    (head.headers.get('content-disposition') ?? '—').slice(0, 60),
  );
  const partial = await fetch('http://localhost:8080/source.zip', { headers: { Range: 'bytes=0-999' } });
  check('دریافتِ بخشی با کدِ ۲۰۶ پاسخ می‌دهد', partial.status === 206, `پاسخ: ${partial.status}`);
  check(
    'بازه‌ی درست در پاسخِ بخشی آمده است',
    (partial.headers.get('content-range') ?? '').startsWith('bytes 0-999/'),
    partial.headers.get('content-range') ?? '—',
  );
  const partBytes = Buffer.from(await partial.arrayBuffer());
  check('اندازه‌ی بخش همان ۱۰۰۰ بایتِ درخواستی است', partBytes.length === 1000, `${partBytes.length} بایت`);

  /* ------------- ۶) دکمه‌ی تک‌مرحله‌ای روی صفحه‌ی ورود -------------
     کاربر نباید هیچ مرحله‌ی اضافه‌ای را طی کند: یک کلیک = یک فایلِ زیپِ واقعی. */
  const oneClickPage = await bootLanding({ online: true });
  const button = oneClickPage.doc.querySelector('#one-click-download-source');
  check('دکمه‌ی تک‌مرحله‌ای روی صفحه‌ی ورود هست', Boolean(button));
  const saved = [];
  oneClickPage.window.URL.createObjectURL = (blob) => { saved.push({ size: blob.size, type: blob.type }); return 'blob:test'; };
  oneClickPage.window.URL.revokeObjectURL = () => undefined;
  const createElement = oneClickPage.window.document.createElement.bind(oneClickPage.window.document);
  oneClickPage.window.document.createElement = (tag, options) => {
    const element = createElement(tag, options);
    if (String(tag).toLowerCase() === 'a') {
      element.click = () => { if (saved.length) saved[saved.length - 1].name = element.download; };
    }
    return element;
  };
  button?.dispatchEvent(new oneClickPage.window.MouseEvent('click', { bubbles: true }));
  await wait(3000);
  check('با یک کلیک دقیقاً یک فایل ذخیره می‌شود', saved.length === 1, `${saved.length} فایل`);
  check('فایلِ ذخیره‌شده اندازه‌ی واقعی دارد', (saved[0]?.size ?? 0) > 100000, `${saved[0]?.size ?? 0} بایت`);
  check(
    'نوعِ فایلِ ذخیره‌شده زیپ است (نه HTML)',
    (saved[0]?.type ?? '').includes('zip'),
    saved[0]?.type ?? '—',
  );
  check('نامِ فایل به زیپ ختم می‌شود', (saved[0]?.name ?? '').endsWith('.zip'), saved[0]?.name ?? '—');
  check(
    'کاربر از نتیجه آگاه می‌شود',
    /ذخیره شد/.test(oneClickPage.doc.querySelector('#source-download-note')?.textContent ?? ''),
    oneClickPage.doc.querySelector('#source-download-note')?.textContent?.trim().slice(0, 60) ?? '—',
  );

  /* ------------- ۷) نسخه‌ی نمایشیِ ایستا هم فایل را دارد ------------- */
  const demo = join(base, 'dist-demo/source.zip');
  check('نسخه‌ی نمایشیِ ایستا هم زیپ را دارد', existsSync(demo));
  check('زیپِ نسخه‌ی نمایشی هم واقعی است', existsSync(demo) && isZip(demo));

  return state;
}

run().then((result) => {
  console.log(`\nنتیجه: ${result.failed ? `${result.failed} مورد ناموفق` : 'همه‌ی بررسی‌ها موفق'}`);
  process.exit(result.failed ? 1 : 0);
}).catch((error) => {
  console.error('خطا در اجرای سناریو:', error);
  process.exit(1);
});
