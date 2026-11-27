/** So sánh chuỗi không phụ thuộc thời gian (tránh dò mật khẩu qua thời gian phản hồi). */
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

/**
 * Basic Auth cho Worker. Trả về Response từ chối nếu chưa đăng nhập đúng, null nếu hợp lệ.
 * Bắt buộc phải cấu hình mật khẩu – web chạy công khai trên Internet.
 */
export function checkBasicAuth(request: Request, user?: string, password?: string): Response | null {
  if (!user || !password) {
    return new Response(
      'Chưa cấu hình tài khoản đăng nhập. Chạy: npx wrangler secret put AUTH_USER và npx wrangler secret put AUTH_PASSWORD',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }
  const header = request.headers.get('Authorization') ?? '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    let decoded = '';
    try {
      decoded = new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)));
    } catch {
      decoded = '';
    }
    const idx = decoded.indexOf(':');
    if (idx >= 0 && safeEqual(decoded.slice(0, idx), user) && safeEqual(decoded.slice(idx + 1), password)) return null;
  }
  return new Response('Cần đăng nhập', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Market Monitoring", charset="UTF-8"' },
  });
}
