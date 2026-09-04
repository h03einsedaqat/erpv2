/**
 * رفتارِ برنامه هنگامی که سرور نشست را نمی‌پذیرد (۴۰۱ِ پیاپی).
 * انتظار:
 *  ۱) پس از چند تلاشِ ناموفق، برنامه درخواستِ بی‌حاصل نمی‌فرستد (کنسول پر از ۴۰۱ نمی‌شود)
 *  ۲) برنامه در دسترس و قابلِ استفاده می‌ماند (حالت محلی)
 *  ۳) نشانگر، حالتِ محلی را نشان می‌دهد
 *  ۴) با کلیک روی نشانگر، دوباره تلاش می‌شود
 */
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` ${detail}` : ''}`);
};

const base = new URL('../../dist/', import.meta.url).pathname;
const html = readFileSync(`${base}index.html`, 'utf8')
  .replace(/<script type="module"[^>]*><\/script>/g, '')
  .replace(/<link rel="stylesheet"[^>]*>/g, '');
const asset = readFileSync(`${base}index.html`, 'utf8').match(/assets\/(index-[\w-]+\.js)/)[1];
const bundle = readFileSync(`${base}assets/${asset}`, 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost:8080/', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
const { window } = dom;
const doc = window.document;

// سروری که ورود را می‌پذیرد تا برنامه بالا بیاید، اما بقیه‌ی درخواست‌ها ۴۰۱ می‌دهند
let calls = 0;
let rejectAll = false;
window.fetch = async (input, init) => {
  const path = String(input);
  calls += 1;
  if (rejectAll && !path.includes('/api/health')) {
    return new Response(JSON.stringify({ error: 'نشست معتبر نیست', code: 'AUTH_REQUIRED' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  return fetch(new URL(path, 'http://localhost:8080/'), init);
};
window.localStorage.clear();
const script = doc.createElement('script');
script.textContent = bundle;
doc.body.appendChild(script);
await wait(900);
doc.querySelector('#landing-login')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(400);
doc.querySelector('#username').value = 'admin';
doc.querySelector('#password').value = 'admin123';
doc.querySelector('#login-form')?.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(3000);
check('ورودِ نخست انجام می‌شود', /متصل/.test(doc.querySelector('#api-chip')?.textContent ?? ''), doc.querySelector('#api-chip')?.textContent?.trim());

// از این لحظه سرور همه‌چیز را ۴۰۱ می‌دهد
rejectAll = true;
// بررسیِ وضعیت را (مانندِ بازگشت به تب) راه می‌اندازیم تا برنامه با خطا روبه‌رو شود
for (let i = 0; i < 3; i += 1) {
  doc.dispatchEvent(new window.Event('visibilitychange', { bubbles: true }));
  await wait(2500);
}
calls = 0;
await wait(6000);                       // آیا برنامه دست از درخواستِ بی‌حاصل می‌کشد؟
const duringFault = calls;
check('برنامه پس از چند تلاش، درخواستِ بی‌حاصل نمی‌فرستد', duringFault <= 12, `${duringFault} درخواست در ۹ ثانیه`);
check('نشانگر حالتِ محلی را نشان می‌دهد', /محلی|اتصال|سرویس/.test(doc.querySelector('#api-chip')?.textContent ?? ''), doc.querySelector('#api-chip')?.textContent?.trim());
check('برنامه در دسترس است (منوها پابرجا)', doc.querySelectorAll('[data-module]').length > 0, `${doc.querySelectorAll('[data-module]').length} ماژول`);
check('داده‌ای برای کار وجود دارد (نمونه در حالتِ محلی)', (doc.querySelector('#app')?.textContent ?? '').trim().length > 200);

// کلیک روی نشانگر یعنی «دوباره امتحان کن»
calls = 0;
doc.querySelector('#api-chip')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(2500);
check('با کلیک روی نشانگر دوباره تلاش می‌شود', calls > 0, `${calls} درخواست`);

console.log(`\nنتیجه: ${failures ? `${failures} مورد ناموفق` : 'همه‌ی بررسی‌ها موفق'}`);
process.exit(failures ? 1 : 0);
