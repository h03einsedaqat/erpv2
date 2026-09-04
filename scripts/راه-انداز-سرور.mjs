/**
 * بالا آوردنِ سرور — همیشه با ساختِ تازه.
 *
 * چرا این اسکریپت لازم است؟ بارها پیش آمده که پوشه‌ی خروجی (dist) به نسخه‌ای کهنه
 * برگردد (بازنشانیِ محیط، بازگردانی از مخزن) و کاربر در عمل نسخه‌ای قدیمی از برنامه
 * را ببیند؛ در حالی که کد درست بود. برای اینکه چنین اشتباهی دیگر رخ ندهد، هر بار
 * بالا آوردن، ابتدا خروجی از روی کدِ فعلی ساخته می‌شود و سپس سرویس اجرا می‌گردد.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';

const step = (label) => console.log(`▸ ${label}`);
const run = (command, args) => new Promise((done) => {
  const child = spawn(command, args, { stdio: 'inherit' });
  child.on('exit', (code) => done(code ?? 0));
});

/** اگر وابستگی‌ها نصب نباشند، نصب می‌شوند (بازنشانیِ محیط آن‌ها را پاک می‌کند) */
const depsReady = () => existsSync('node_modules/vite/package.json') && existsSync('node_modules/typescript/package.json');
if (!depsReady()) {
  step('نصبِ وابستگی‌ها…');
  const code = await run('npm', ['ci', '--include=dev', '--no-audit', '--no-fund']);
  if (code !== 0) { console.error('نصب ناموفق بود.'); process.exit(code); }
}

/** ساختِ خروجی از روی کدِ فعلی */
step('ساختِ خروجی از روی کدِ فعلی…');
let code = await run('npm', ['run', 'build']);
if (code !== 0) { console.error('ساخت ناموفق بود.'); process.exit(code); }

const assets = existsSync('dist/assets') ? readdirSync('dist/assets').filter((f) => f.endsWith('.js')) : [];
const bundle = assets[0] ? statSync(`dist/assets/${assets[0]}`) : null;
step(`خروجی آماده است: ${assets[0] ?? '—'} (${bundle ? Math.round(bundle.size / 1024) : 0} کیلوبایت)`);

step('بالا آوردنِ سرویس…');
const server = spawn('node', ['--import', 'tsx', 'server/index.ts'], { stdio: 'inherit' });
server.on('exit', (serverCode) => process.exit(serverCode ?? 0));
