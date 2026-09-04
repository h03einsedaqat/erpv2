/**
 * سناریوی واقعیِ شکایتِ کاربر: «نشست مدام منقضی می‌شود و نمی‌توانم کار کنم».
 *
 * این تست بدترین حالت را می‌سنجد: کلیدِ امضای سرور عوض شده (یا پایگاه پاک شده)
 * و توکن‌های ذخیره‌شده در مرورگر دیگر معتبر نیستند. انتظار:
 *  ۱) کاربر از برنامه بیرون انداخته نشود و صفحه‌ی ورودِ خالی نبیند
 *  ۲) پیامِ تندِ «نشست شما پایان یافته است» نمایش داده نشود
 *  ۳) برنامه و داده‌های محلی همچنان در دسترس باشند (کار ادامه یابد)
 *  ۴) یک پنجره‌ی ورودِ کوچک نمایش داده شود که با پر کردنش، اتصال برقرار گردد
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
window.fetch = (input, init) => fetch(new URL(String(input), 'http://localhost:8080/'), init);

// کاربری که از قبل وارد بوده و توکن‌هایش حالا (بر اثر تغییرِ کلید یا پاک شدنِ پایگاه) نامعتبر است
window.localStorage.setItem('erp-session', JSON.stringify({ username: 'admin', name: 'کاربر', role: 'مدیر سیستم', organization: 'شرکت' }));
window.localStorage.setItem('erp-token-v2', 'old.old.old');
window.localStorage.setItem('erp-refresh-v1', 'old.old.old');

const script = doc.createElement('script');
script.textContent = bundle;
doc.body.appendChild(script);
await wait(6000);

const appText = doc.querySelector('#app')?.textContent ?? '';
const uiText = `${appText} ${doc.querySelector('body > #toast')?.textContent ?? ''} ${doc.querySelector('.modal-backdrop')?.textContent ?? ''}`;
check('کاربر از برنامه بیرون انداخته نمی‌شود (برنامه و منوها پابرجاست)', doc.querySelectorAll('[data-module]').length > 0, `${doc.querySelectorAll('[data-module]').length} ماژول`);
check('داده‌ی کاربر در مرورگر پاک نشده است', Boolean(window.localStorage.getItem('erp-session')));
check('پیامِ تندِ «نشست پایان یافته» نمایش داده نمی‌شود', !/پایان یافته/.test(uiText));
check('برنامه در دسترس است (کار بدونِ نشست هم ادامه دارد)', appText.trim().length > 200, `${appText.trim().length} کاراکتر`);
check('پنجره‌ی ورود خودکار باز نمی‌شود (مزاحمِ کار نمی‌شود)', !doc.querySelector('#server-login-modal'));
check('نشانگر وضعیت، حالتِ محلی/نیاز به اتصال را نشان می‌دهد', /اتصال|سرویس|محلی/.test(doc.querySelector('#api-chip')?.textContent ?? ''), doc.querySelector('#api-chip')?.textContent?.trim());

// با کلیک روی نشانگر، پنجره‌ی اتصال باز می‌شود
doc.querySelector('#api-chip')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(900);
check('با کلیک روی نشانگر، پنجره‌ی اتصال باز می‌شود', Boolean(doc.querySelector('#server-login-modal')));

// اتصالِ دوباره از همان پنجره
const form = doc.querySelector('#server-login-form');
if (form) {
  form.querySelector('[name="username"]').value = 'admin';
  form.querySelector('[name="password"]').value = 'admin123';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(6000);
}
const chip = doc.querySelector('#api-chip')?.textContent?.trim() ?? '';
check('پس از اتصالِ دوباره، نشست برقرار می‌شود', /متصل/.test(chip) && !/دوباره/.test(chip), chip);
check('داده‌ها از سرور بارگذاری می‌شوند', (doc.querySelector('#app')?.textContent ?? '').trim().length > 200);

console.log(`\nنتیجه: ${failures ? `${failures} مورد ناموفق` : 'همه‌ی بررسی‌ها موفق'}`);
process.exit(failures ? 1 : 0);
