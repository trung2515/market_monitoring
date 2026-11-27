// Màn hình đăng nhập: gửi tài khoản lên /api/login, đúng thì máy chủ đặt cookie phiên (hết hạn 0h đêm nay).
(() => {
  const form = document.getElementById('login-form');
  const btn = document.getElementById('login-btn');
  const msg = document.getElementById('login-msg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = form.user.value.trim();
    const password = form.password.value;
    if (!user || !password) {
      msg.className = 'msg err';
      msg.textContent = 'Nhập đủ tên đăng nhập và mật khẩu.';
      return;
    }
    btn.disabled = true;
    btn.querySelector('.btn-text').textContent = 'Đang đăng nhập…';
    msg.className = 'msg';
    msg.textContent = '';
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Lỗi ${res.status}`);
      location.replace('/');
    } catch (err) {
      msg.className = 'msg err';
      msg.textContent = err.message;
      form.password.value = '';
      form.password.focus();
      btn.disabled = false;
      btn.querySelector('.btn-text').textContent = 'Đăng nhập';
    }
  });
})();
