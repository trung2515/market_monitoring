/**
 * Đăng nhập bằng màn hình login + cookie phiên, HẾT HẠN CUỐI NGÀY (0h giờ VN) → mỗi ngày đăng nhập 1 lần.
 * Dùng Web Crypto (có sẵn trên cả Node ≥ 20 và Cloudflare Workers) nên chạy chung cho 2 nơi.
 *
 * Cookie = "<hạn dùng ms>.<chữ ký HMAC>". Khoá ký lấy từ tài khoản + mật khẩu, nên ĐỔI MẬT KHẨU là mọi phiên cũ hết hiệu lực.
 */

export const SESSION_COOKIE = 'mm_session';

export interface AuthConfig {
  user?: string;
  password?: string;
  timeZone: string;
}

/** Đường dẫn không cần đăng nhập (trang login và file nó dùng). */
export const PUBLIC_PATHS = new Set(['/login', '/login.html', '/login.js', '/styles.css', '/favicon.ico', '/healthz']);

export const isConfigured = (c: AuthConfig): c is AuthConfig & { user: string; password: string } =>
  Boolean(c.user && c.password);

/** So sánh không phụ thuộc thời gian (tránh dò mật khẩu qua thời gian phản hồi). */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

/** Thời điểm 0h ngày hôm sau theo múi giờ (VD Asia/Ho_Chi_Minh). */
export function endOfDay(timeZone: string, now: Date = new Date()): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(now)
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  // Độ lệch múi giờ tại thời điểm hiện tại
  const localAsUtc = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
  const offset = localAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(parts.year!, parts.month! - 1, parts.day! + 1) - offset);
}

async function sign(c: AuthConfig & { user: string; password: string }, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`market-monitoring\n${c.user}\n${c.password}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
  return btoa(String.fromCharCode(...mac))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function cookieAttrs(expires: Date, secure: boolean): string {
  return `Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}${secure ? '; Secure' : ''}`;
}

/** Kiểm tra tài khoản; đúng thì trả về header Set-Cookie (hết hạn 0h đêm nay). */
export async function login(
  c: AuthConfig,
  user: string,
  password: string,
  opts: { secure: boolean; now?: Date },
): Promise<{ ok: true; setCookie: string; expiresAt: Date } | { ok: false; status: number; error: string }> {
  if (!isConfigured(c)) {
    return { ok: false, status: 503, error: 'Chưa cấu hình tài khoản đăng nhập (AUTH_USER / AUTH_PASSWORD).' };
  }
  // Luôn so sánh cả 2 để thời gian phản hồi như nhau
  const okUser = safeEqual(user, c.user);
  const okPass = safeEqual(password, c.password);
  if (!okUser || !okPass) {
    await new Promise((r) => setTimeout(r, 800)); // làm chậm việc thử mật khẩu liên tục
    return { ok: false, status: 401, error: 'Sai tên đăng nhập hoặc mật khẩu.' };
  }
  const expiresAt = endOfDay(c.timeZone, opts.now);
  const value = `${expiresAt.getTime()}.${await sign(c, String(expiresAt.getTime()))}`;
  return { ok: true, expiresAt, setCookie: `${SESSION_COOKIE}=${value}; ${cookieAttrs(expiresAt, opts.secure)}` };
}

export const logoutCookie = (secure: boolean) => `${SESSION_COOKIE}=; ${cookieAttrs(new Date(0), secure)}`;

/** Cookie phiên còn hạn và đúng chữ ký? */
export async function verifySession(c: AuthConfig, cookieHeader: string | null | undefined, now = new Date()) {
  if (!isConfigured(c) || !cookieHeader) return false;
  const raw = cookieHeader
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  const [exp, sig] = raw?.split('.') ?? [];
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) <= now.getTime()) return false;
  return safeEqual(sig, await sign(c, exp));
}
