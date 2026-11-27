import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { endOfDay, login, verifySession } from '../src/auth/session';
import worker from '../src/worker/index';
import { createFakeD1 } from './fakeD1';

const auth = { user: 'elmich', password: 'mat-khau', timeZone: 'Asia/Ho_Chi_Minh' };

describe('Đăng nhập theo ngày', () => {
  it('phiên hết hạn lúc 0h giờ VN', () => {
    // 27/11 14:00 giờ VN = 07:00 UTC → hết hạn 28/11 00:00 VN = 27/11 17:00 UTC
    assert.equal(endOfDay('Asia/Ho_Chi_Minh', new Date('2026-11-27T07:00:00Z')).toISOString(), '2026-11-27T17:00:00.000Z');
    // 27/11 23:30 VN = 16:30 UTC → vẫn hết hạn lúc 17:00 UTC
    assert.equal(endOfDay('Asia/Ho_Chi_Minh', new Date('2026-11-27T16:30:00Z')).toISOString(), '2026-11-27T17:00:00.000Z');
  });

  it('đúng mật khẩu mới có phiên, phiên hết hạn sang ngày mới hoặc khi đổi mật khẩu', async () => {
    const now = new Date('2026-11-27T07:00:00Z');
    assert.equal((await login(auth, 'elmich', 'sai', { secure: true, now })).ok, false);
    const ok = await login(auth, 'elmich', 'mat-khau', { secure: true, now });
    assert.ok(ok.ok);
    const cookie = ok.setCookie.split(';')[0]!;
    assert.match(ok.setCookie, /HttpOnly/);
    assert.equal(await verifySession(auth, `a=1; ${cookie}`, now), true);
    assert.equal(await verifySession(auth, cookie, new Date('2026-11-27T17:00:01Z')), false);
    assert.equal(await verifySession({ ...auth, password: 'mat-khau-moi' }, cookie, now), false);
    assert.equal(await verifySession(auth, cookie.replace(/.$/, 'x'), now), false);
    assert.equal(await verifySession(auth, undefined, now), false);
  });

  it('Worker: chưa đăng nhập thì chuyển về /login, đăng nhập xong thì vào được', async () => {
    const w = ((worker as unknown as { default?: typeof worker }).default ?? worker) as typeof worker;
    const env = {
      DB: createFakeD1(),
      ASSETS: { fetch: async (r: Request) => new Response(`asset ${new URL(r.url).pathname}`) },
      AUTH_USER: auth.user,
      AUTH_PASSWORD: auth.password,
    } as never;
    const go = (path: string, init?: RequestInit) => w.fetch(new Request(`https://x.dev${path}`, init), env);

    const home = await go('/');
    assert.equal(home.status, 302);
    assert.equal(home.headers.get('Location'), 'https://x.dev/login');
    assert.equal((await go('/api/status')).status, 401);
    assert.equal(await (await go('/login')).text(), 'asset /login');
    assert.equal(await (await go('/styles.css')).text(), 'asset /styles.css');

    const bad = await go('/api/login', { method: 'POST', body: JSON.stringify({ user: 'elmich', password: 'x' }) });
    assert.equal(bad.status, 401);
    const res = await go('/api/login', { method: 'POST', body: JSON.stringify({ user: 'elmich', password: 'mat-khau' }) });
    assert.equal(res.status, 200);
    const cookie = res.headers.get('Set-Cookie')!.split(';')[0]!;
    assert.match(res.headers.get('Set-Cookie')!, /Secure/);

    const headers = { Cookie: cookie };
    assert.equal(await (await go('/', { headers })).text(), 'asset /');
    assert.equal((await go('/api/status', { headers })).status, 200);
    assert.equal((await go('/login', { headers })).status, 302);
    assert.match((await go('/api/logout', { method: 'POST' })).headers.get('Set-Cookie') ?? '', /Expires=Thu, 01 Jan 1970/);
  });
});
