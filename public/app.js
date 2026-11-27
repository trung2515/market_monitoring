// Giao diện đơn giản, không cần build. Gọi các API trong src/web/routes/api.ts
(() => {
  const $ = (sel) => document.querySelector(sel);
  const form = $('#export-form');
  const fmtMoney = (v) => (v == null ? '' : v.toLocaleString('vi-VN') + ' ₫');
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  let options = { ownBrand: '', competitorBrands: [], categories: [], brands: [] };

  const escapeHtml = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  async function api(path, init) {
    const res = await fetch(path, init);
    if (!res.ok) {
      let message = `Lỗi ${res.status}`;
      try { message = (await res.json()).error || message; } catch { /* không phải JSON */ }
      throw new Error(message);
    }
    return res;
  }

  function setMsg(el, text, type) {
    el.textContent = text;
    el.className = `msg ${type || ''}`;
  }

  const checked = (container) => [...container.querySelectorAll('input:checked')].map((i) => i.value);

  // ---------- Bộ lọc ----------
  async function loadOptions() {
    options = await (await api('/api/options')).json();
    $('#categories').innerHTML = options.categories
      .map((c) => `<label><input type="checkbox" value="${escapeHtml(c.slug)}" /> ${escapeHtml(c.name)}</label>`)
      .join('');
    $('#preview-category').innerHTML =
      '<option value="">Tất cả danh mục</option>' +
      options.categories.map((c) => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</option>`).join('');
    const own = options.ownBrand.toLowerCase();
    $('#brands').innerHTML = options.brands
      .map(
        (b) =>
          `<label class="${b.brand.toLowerCase() === own ? 'own' : ''}"><input type="checkbox" value="${escapeHtml(b.brand)}" /> ${escapeHtml(b.brand)} <small>(${b.productCount})</small></label>`,
      )
      .join('') || '<small>Chưa có dữ liệu – hãy cào dữ liệu trước.</small>';
  }

  document.querySelectorAll('[data-brands]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const focus = new Set([options.ownBrand, ...options.competitorBrands].map((b) => b.toLowerCase()));
      $('#brands').querySelectorAll('input').forEach((i) => {
        i.checked = btn.dataset.brands === 'focus' && focus.has(i.value.toLowerCase());
      });
    }),
  );

  // ---------- Kỳ báo cáo ----------
  function currentPeriod() {
    return form.querySelector('input[name="period"]:checked').value;
  }

  function updatePeriodUi() {
    const p = currentPeriod();
    form.querySelectorAll('[data-show]').forEach((el) => {
      el.hidden = !el.dataset.show.split(' ').includes(p);
    });
    const date = form.date.value || today;
    const d = new Date(date + 'T00:00:00');
    let hint = '';
    if (p === 'week') {
      const day = (d.getDay() + 6) % 7; // 0 = Thứ Hai
      const mon = new Date(d); mon.setDate(d.getDate() - day);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      hint = `→ Tuần ${mon.toLocaleDateString('vi-VN')} – ${sun.toLocaleDateString('vi-VN')}`;
    } else if (p === 'month') {
      hint = `→ Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
    }
    $('#period-hint').textContent = hint;
  }
  form.addEventListener('change', updatePeriodUi);

  // ---------- Xuất Excel ----------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#export-btn');
    const msg = $('#export-msg');
    const params = new URLSearchParams({ period: currentPeriod() });
    if (currentPeriod() === 'custom') {
      if (!form.from.value || !form.to.value) return setMsg(msg, 'Chọn đủ Từ ngày và Đến ngày', 'err');
      params.set('from', form.from.value);
      params.set('to', form.to.value);
    } else {
      params.set('date', form.date.value || today);
    }
    const cats = checked($('#categories'));
    const brands = checked($('#brands'));
    if (cats.length) params.set('categories', cats.join(','));
    if (brands.length) params.set('brands', brands.join(','));

    btn.disabled = true;
    setMsg(msg, 'Đang tạo file…');
    try {
      const res = await api(`/api/export?${params}`);
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const name = decodeURIComponent((disposition.match(/filename\*=UTF-8''([^;]+)/) || [])[1] || 'BaoCao.xlsx');
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      setMsg(msg, `Đã tải ${name}`, 'ok');
    } catch (err) {
      setMsg(msg, err.message, 'err');
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- Trạng thái & cào ----------
  const STATUS_LABEL = { success: 'Thành công', partial: 'Một phần', failed: 'Lỗi', running: 'Đang chạy' };
  const TRIGGER_LABEL = { schedule: 'Theo lịch', manual: 'Bấm tay', cli: 'Dòng lệnh' };
  let pollTimer = null;

  async function loadStatus() {
    const s = await (await api('/api/status')).json();
    $('#status').textContent = s.lastCrawlDate
      ? `Dữ liệu: ${s.crawlDayCount} ngày (${s.firstCrawlDate} → ${s.lastCrawlDate}) • ${s.productCount} sản phẩm`
      : 'Chưa có dữ liệu';
    $('#runs').innerHTML = s.recentRuns
      .map((r) => {
        const notes = [r.error, ...(r.warnings || [])].filter(Boolean).join(' | ');
        return `<tr><td>${escapeHtml(r.crawlDate)}<br><small>${new Date(r.startedAt).toLocaleTimeString('vi-VN')}</small></td>
          <td>${TRIGGER_LABEL[r.trigger] || r.trigger}</td>
          <td><span class="badge ${r.status}">${STATUS_LABEL[r.status] || r.status}</span></td>
          <td class="num">${r.productCount}</td><td><small>${escapeHtml(notes)}</small></td></tr>`;
      })
      .join('');
    $('#crawl-btn').disabled = s.running;
    if (s.running && !pollTimer) {
      pollTimer = setInterval(async () => {
        const st = await (await api('/api/status')).json();
        if (!st.running) {
          clearInterval(pollTimer);
          pollTimer = null;
          setMsg($('#crawl-msg'), 'Cào xong!', 'ok');
          await Promise.all([loadStatus(), loadOptions(), loadPreview()]);
        }
      }, 5000);
    }
  }

  $('#crawl-btn').addEventListener('click', async () => {
    const msg = $('#crawl-msg');
    try {
      const res = await api('/api/crawl', { method: 'POST' });
      setMsg(msg, (await res.json()).message, 'ok');
      await loadStatus();
    } catch (err) {
      setMsg(msg, err.message, 'err');
    }
  });

  // ---------- Xem nhanh ----------
  let searchTimer;
  async function loadPreview() {
    const params = new URLSearchParams({ limit: '1000' });
    const q = $('#search').value.trim();
    if (q) params.set('q', q);
    const cat = $('#preview-category').value;
    if (cat) params.set('categories', cat);
    const data = await (await api(`/api/products?${params}`)).json();
    $('#preview-date').textContent = data.date ? `(ngày ${data.date}, ${data.items.length} sản phẩm)` : '';
    const own = options.ownBrand.toLowerCase();
    $('#preview').innerHTML = data.items
      .map(
        (p) => `<tr class="${p.brand.toLowerCase() === own ? 'own' : ''}">
          <td>${escapeHtml(p.categoryName)}</td><td>${escapeHtml(p.brand)}</td><td>${escapeHtml(p.modelCode)}</td>
          <td><a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.name)}</a></td>
          <td class="num">${fmtMoney(p.listPrice)}</td><td class="num"><b>${fmtMoney(p.price)}</b></td>
          <td class="num">${p.discountPercent != null ? p.discountPercent + '%' : ''}</td>
          <td class="num">${fmtMoney(p.flashPrice)}</td><td>${escapeHtml((p.soldText || '').replace(/^Đã bán\s*/i, ''))}</td></tr>`,
      )
      .join('') || '<tr><td colspan="9">Chưa có dữ liệu</td></tr>';
  }
  $('#preview-category').addEventListener('change', loadPreview);
  $('#search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadPreview, 300);
  });

  // ---------- Khởi động ----------
  form.date.value = today;
  updatePeriodUi();
  loadOptions()
    .then(() => Promise.all([loadStatus(), loadPreview()]))
    .catch((err) => setMsg($('#export-msg'), err.message, 'err'));
})();
