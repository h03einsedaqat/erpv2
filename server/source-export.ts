/**
 * بسته‌ی کاملِ سورسِ برنامه برای دانلود
 * ---------------------------------------------------------------------
 * هدف: مدیرِ برنامه بتواند از داخلِ خودِ برنامه، کلِ کدِ پروژه را یک‌جا
 * دانلود کند (دکمه‌ی پایینِ سمتِ چپِ صفحه).
 *
 * نکته‌ی امنیتیِ مهم (و غیرقابلِ چشم‌پوشی):
 *   این بسته هرگز نباید حاویِ راز باشد. برای همین:
 *     - فایل‌های .env و هرچه به آن شبیه است، بیرون گذاشته می‌شوند
 *     - پوشه‌ی داده‌های زنده (.data) که نشست‌ها و پایگاهِ داده در آن است، نه
 *     - پوشه‌ی وابستگی‌ها (node_modules) و خروجیِ ساخت (dist*) بیرون می‌مانند
 *     - کلیدها و گواهی‌نامه‌ها (که در این پروژه نداریم) هم مستثنی‌اند
 *   تنها چیزی که می‌رود: کد، مستندات، تنظیماتِ نمونه و فایل‌های ساخت.
 *
 * زیپ با امکاناتِ خودِ Node ساخته می‌شود (بدون کتابخانه‌ی خارجی) تا نصبِ
 * برنامه روی هر دستگاهی، حتی بدون اینترنت، بی‌دردسر بماند.
 */
import { readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { join, relative, extname, sep } from 'node:path';
import { deflateRawSync } from 'node:zlib';

/* ------------------------------- نوشتنِ زیپ ------------------------------- */

/** جدولِ CRC32 (الگوریتمِ استانداردِ زیپ) */
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) crc = crcTable[(crc ^ buffer[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** تبدیلِ تاریخ به قالبِ زمانِ داس که زیپ استفاده می‌کند */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

type ZipEntry = { name: string; data: Buffer; time: number; date: number };

/** سراسرِ فایلِ زیپ را از فهرستِ ورودی‌ها می‌سازد (فشرده با deflate) */
function buildZip(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const compressed = deflateRawSync(entry.data, { level: 9 });
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // امضایِ سرآیندِ محلی
    local.writeUInt16LE(20, 4); // نسخه‌ی مورد نیاز
    local.writeUInt16LE(0x0800, 6); // پرچم: نام‌ها یوتی‌اف-۸ هستند (برای نام‌های فارسی)
    local.writeUInt16LE(8, 8); // روش: deflate
    local.writeUInt16LE(entry.time, 10);
    local.writeUInt16LE(entry.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // بدون بخشِ اضافی
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // امضایِ فهرستِ مرکزی
    central.writeUInt16LE(20, 4); // ساخته‌شده با نسخه
    central.writeUInt16LE(20, 6); // نسخه‌ی مورد نیاز
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(entry.time, 12);
    central.writeUInt16LE(entry.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // بدون بخشِ اضافی
    central.writeUInt16LE(0, 32); // بدون توضیح
    central.writeUInt16LE(0, 34); // شماره‌ی دیسک
    central.writeUInt16LE(0, 36); // ویژگی‌های داخلی
    central.writeUInt32LE(0, 38); // ویژگی‌های خارجی
    central.writeUInt32LE(offset, 42); // جایگاهِ سرآیندِ محلی
    centralParts.push(central, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // امضایِ پایانِ فهرستِ مرکزی
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // بدون توضیح

  return Buffer.concat([...localParts, centralDirectory, end]);
}

/* --------------------------- گزینشِ امنِ فایل‌ها --------------------------- */

/** پوشه‌هایی که هرگز نباید در بسته باشند (داده، خروجی، وابستگی، history) */
const skipDirs = new Set([
  'node_modules',
  '.git',
  '.data',
  'dist',
  'dist-demo',
  'dist-win',
  'coverage',
  '.cache',
  '.next',
  '.turbo',
  '.venv',
  'build',
  'out',
  'tmp',
  'کد-کامل', // خودِ خروجی‌های گردآوری‌شده، نه کد
]);

/** پسوندها و نام‌هایی که هرگز نباید در بسته باشند */
const skipExtensions = new Set(['.pem', '.key', '.p12', '.pfx', '.jks', '.log', '.tsbuildinfo']);

/** نام‌هایی که نشانه‌ی راز یا داده‌ی زنده‌اند */
const secretLike = (name: string): boolean =>
  name === '.env' ||
  name.startsWith('.env.') ||
  name === '.npmrc' ||
  name === '.netrc' ||
  name === '.htpasswd' ||
  /\.(key|pem|p12|pfx)$/i.test(name) ||
  /secret/i.test(name);

const codeExtensions = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx', '.json', '.css', '.html', '.svg', '.md',
  '.yml', '.yaml', '.sql', '.bat', '.sh', '.txt', '.env.example', '.toml', '.ini',
]);

const maxFileBytes = 6 * 1024 * 1024; // هر فایل تا ۶ مگابایت
const maxTotalBytes = 80 * 1024 * 1024; // کلِ بسته تا ۸۰ مگابایت

/** گردش در پوشه‌ها با حذفِ مواردِ حساس؛ خروجی: مسیرهای نسبی */
function collectFiles(root: string, dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let info;
    try {
      info = statSync(full);
    } catch {
      continue;
    }
    if (info.isDirectory()) {
      // اجازه‌ی ورود به .github (تنظیماتِ انتشار)؛ بقیه‌ی پوشه‌های پنهان نه
      if (skipDirs.has(entry) || (entry.startsWith('.') && entry !== '.github')) continue;
      collectFiles(root, full, acc);
      continue;
    }
    if (!info.isFile()) continue;
    if (secretLike(entry)) continue;
    if (info.size > maxFileBytes) continue;
    const extension = extname(entry).toLowerCase();
    if (skipExtensions.has(extension)) continue;
    // فایل‌های بدون پسوند (مثل Dockerfile یا LICENSE) هم ارسال می‌شوند
    if (extension && !codeExtensions.has(extension)) continue;
    acc.push(relative(root, full).split(sep).join('/'));
  }
  return acc;
}

/* --------------------------------- خروجی --------------------------------- */

export type SourceBundle = { zip: Buffer; fileName: string; files: number; bytes: number };

/**
 * ساختِ بسته‌ی سورس.
 * نامِ فایل با تاریخِ امروز است تا هر بار دانلود، مشخص باشد مربوط به کیست.
 */
export function buildSourceBundle(root: string = process.cwd()): SourceBundle {
  const safeRoot = realpathSync(root);
  const stamp = new Date().toISOString().slice(0, 10);
  const files = collectFiles(safeRoot, safeRoot).sort((a, b) => a.localeCompare(b, 'fa'));

  const now = new Date();
  const { time, date } = dosDateTime(now);
  const entries: ZipEntry[] = [];
  let total = 0;

  /** یادداشتِ کوچکی که درِ بسته می‌گذاریم تا گیرنده بداند چه گرفته است */
  const note = [
    'راهکار — بسته‌ی کاملِ سورس',
    `تاریخِ دریافت: ${stamp}`,
    `شمارِ فایل‌ها: ${files.length}`,
    '',
    'برای اجرا:',
    '  1) npm ci        (نصبِ وابستگی‌ها)',
    '  2) npm start     (ساختِ خروجی و بالا آوردنِ سرویس روی ۸۰۸۰)',
    '',
    'ورودِ پیش‌فرض: admin / admin123',
    '',
    'نکته‌ی امنیتی: این بسته عمداً بدونِ فایل‌های .env، پوشه‌ی داده (.data)،',
    'وابستگی‌ها (node_modules) و خروجیِ ساخت (dist) است.',
    'هرگز کلید یا رمزِ واقعی را در فایل‌های این پروژه ننویسید؛ جایگاه‌ها در .env.example است.',
  ].join('\r\n');
  entries.push({ name: 'راهنمای-دانلود.txt', data: Buffer.from(note, 'utf8'), time, date });

  for (const relativePath of files) {
    const full = join(safeRoot, relativePath);
    // محافظت در برابرِ پیوندهای نمادینِ فراری
    try {
      if (!realpathSync(full).startsWith(safeRoot)) continue;
    } catch {
      continue;
    }
    let data: Buffer;
    try {
      data = readFileSync(full);
    } catch {
      continue;
    }
    if (total + data.length > maxTotalBytes) break;
    total += data.length;
    const modified = statSync(full).mtime;
    const stamped = dosDateTime(modified);
    entries.push({ name: relativePath, data, time: stamped.time, date: stamped.date });
  }

  return {
    zip: buildZip(entries),
    fileName: `راهکار-سورس-${stamp}.zip`,
    files: entries.length,
    bytes: total,
  };
}
