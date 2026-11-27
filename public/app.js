// Giao diện web – HTML/JS thuần, không cần build. Gọi các API trong src/web/routes/api.ts
(() => {
  const $ = (sel) => document.querySelector(sel);
  const form = $('#export-form');
  const state = { options: { ownBrand: '', competitorBrands: [], categories: [], brands: [] }, status: null };

  // ---------- Tiện ích ----------
  const pad = (n) => String(n).padStart(2, '0');
  const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = toIso(new Date());
  const parseIso = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const dm = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  const dmy = (d) => `${dm(d)}/${d.getFullYear()}`;
  const isoDm = (s) => (s ? dm(parseIso(s)) : '');
  const money = (v) => (v == null ? '' : v.toLocaleString('vi-VN') + ' ₫');
  const escapeHtml = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );

  /** Số tuần ISO-8601 */
  function isoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  }

  async function api(path, init) {
    const res = await fetch(path, init);
    if (!res.ok) {
      let message = `Lỗi ${res.status}`;
      try {
        message = (await res.json()).error || message;
      } catch {
        /* không phải JSON */
      }
      throw new Error(message);
    }
    return res;
  }

  function setMsg(el, text, type) {
    el.textContent = text;
    el.className = `msg ${type || ''}`;
  }

  function setBusy(btn, busy, text) {
    btn.setAttribute('aria-busy', String(busy));
    btn.disabled = busy;
    if (text) btn.querySelector('.btn-text').textContent = text;
  }

  const checkedValues = (container) => [...container.querySelectorAll('input:checked')].map((i) => i.value);

  // ---------- Bộ lọc ----------
  function chip(value, label, extra = '', cls = '') {
    return `<label class="chip ${cls}"><input type="checkbox" value="${escapeHtml(value)}" /><span>${escapeHtml(label)}${extra}</span></label>`;
  }

  async function loadOptions() {
    const o = (state.options = await (await api('/api/options')).json());
    const own = o.ownBrand.toLowerCase();

    $('#categories').innerHTML = o.categories.map((c) => chip(c.slug, c.name)).join('');
    $('#brands').innerHTML =
      o.brands
        .map((b) =>
          chip(b.brand, b.brand, ` <small>${b.productCount}</small>`, b.brand.toLowerCase() === own ? 'own' : ''),
        )
        .join('') || '<p class="note">Chưa có dữ liệu. Bấm "Lấy data hôm nay" trước.</p>';

    $('#preview-category').innerHTML =
      '<option value="">Tất cả danh mục</option>' +
      o.categories.map((c) => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</option>`).join('');
    $('#focus-brands-btn').textContent = `${o.ownBrand} + đối thủ chính`;
    $('#only-own-label').textContent = `Chỉ ${o.ownBrand}`;
    $('#brand-sub').textContent = `Công ty: ${o.ownBrand}`;
    updateCounts();
  }

  function updateCounts() {
    const c = checkedValues($('#categories')).length;
    const b = checkedValues($('#brands')).length;
    $('#cat-count').textContent = c ? `Đã chọn ${c}` : 'Tất cả';
    $('#brand-count').textContent = b ? `Đã chọn ${b}` : 'Tất cả';
  }
  form.addEventListener('change', updateCounts);

  document.querySelectorAll('[data-clear]').forEach((btn) =>
    btn.addEventListener('click', () => {
      $(`#${btn.dataset.clear}`)
        .querySelectorAll('input')
        .forEach((i) => (i.checked = false));
      updateCounts();
    }),
  );
  $('#focus-brands-btn').addEventListener('click', () => {
    const o = state.options;
    const focus = new Set([o.ownBrand, ...o.competitorBrands].map((b) => b.toLowerCase()));
    $('#brands')
      .querySelectorAll('input')
      .forEach((i) => (i.checked = focus.has(i.value.toLowerCase())));
    updateCounts();
  });

  // ---------- Kỳ báo cáo ----------
  const currentPeriod = () => form.querySelector('input[name="period"]:checked').value;

  function updatePeriodUi() {
    const p = currentPeriod();
    form.querySelectorAll('[data-show]').forEach((el) => {
      el.hidden = !el.dataset.show.split(' ').includes(p);
    });

    let title = '';
    if (p === 'week') {
      const d = parseIso(form.date.value || today);
      const mon = new Date(d);
      mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      title = `Tuần ${isoWeek(d)}: ${dm(mon)} – ${dmy(sun)}`;
    } else if (p === 'month') {
      const d = parseIso(form.date.value || today);
      title = `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
    } else {
      const { from, to } = form;
      title = from.value && to.value ? `${dmy(parseIso(from.value))} – ${dmy(parseIso(to.value))}` : 'Chọn khoảng ngày';
    }
    $('#period-title').textContent = title;

    const s = state.status;
    $('#period-note').textContent = s?.lastCrawlDate
      ? `Hệ thống có dữ liệu từ ${isoDm(s.firstCrawlDate)} đến ${isoDm(s.lastCrawlDate)}. Ngày nào không lấy dữ liệu sẽ để trống.`
      : 'Chưa có dữ liệu. Hãy lấy dữ liệu trước khi xuất báo cáo.';
  }
  form.addEventListener('change', updatePeriodUi);
  form.addEventListener('input', updatePeriodUi);

  // ---------- Xuất Excel ----------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#export-btn');
    const msg = $('#export-msg');
    const params = new URLSearchParams({ period: currentPeriod() });
    if (currentPeriod() === 'custom') {
      if (!form.from.value || !form.to.value) return setMsg(msg, 'Chọn đủ "Từ ngày" và "Đến ngày".', 'err');
      if (form.from.value > form.to.value) return setMsg(msg, '"Từ ngày" phải trước "Đến ngày".', 'err');
      params.set('from', form.from.value);
      params.set('to', form.to.value);
    } else {
      params.set('date', form.date.value || today);
    }
    const cats = checkedValues($('#categories'));
    const brands = checkedValues($('#brands'));
    if (cats.length) params.set('categories', cats.join(','));
    if (brands.length) params.set('brands', brands.join(','));

    setBusy(btn, true, 'Đang chuẩn bị…');
    setMsg(msg, '');
    try {
      if (!window.MarketReport) throw new Error('Thiếu file report.bundle.js – hãy chạy "npm run build:client".');
      const name = await window.MarketReport.download(
        {
          period: currentPeriod(),
          date: params.get('date') || undefined,
          from: params.get('from') || undefined,
          to: params.get('to') || undefined,
          categories: cats,
          brands,
        },
        (text) => (btn.querySelector('.btn-text').textContent = text),
      );
      setMsg(msg, `Đã tải ${name}`, 'ok');
    } catch (err) {
      setMsg(msg, err.message, 'err');
    } finally {
      setBusy(btn, false, 'Tải file Excel');
    }
  });

  // ---------- Trạng thái & lấy dữ liệu ----------
  const STATUS_LABEL = { success: 'Thành công', partial: 'Một phần', failed: 'Lỗi', running: 'Đang chạy' };
  const TRIGGER_LABEL = { schedule: 'Tự động', manual: 'Bấm tay', cli: 'Dòng lệnh' };

  async function loadStatus() {
    const s = (state.status = await (await api('/api/status')).json());

    $('#status').textContent = s.lastCrawlDate
      ? `${s.crawlDayCount} ngày dữ liệu, ${s.productCount.toLocaleString('vi-VN')} sản phẩm`
      : 'Chưa có dữ liệu';

    const box = $('#last-run');
    const last = s.recentRuns.find((r) => r.status !== 'running') ?? null;
    box.classList.toggle('is-empty', !s.lastCrawlDate);
    box.classList.toggle('is-stale', Boolean(s.lastCrawlDate && s.lastCrawlDate < today));
    if (s.lastCrawlDate) {
      const d = parseIso(s.lastCrawlDate);
      $('#last-run-date').textContent = s.lastCrawlDate === today ? `Hôm nay, ${dm(d)}` : dmy(d);
      $('#last-run-meta').textContent = last
        ? `${last.productCount.toLocaleString('vi-VN')} sản phẩm, lúc ${new Date(last.startedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}${s.lastCrawlDate < today ? '. Hôm nay chưa lấy dữ liệu.' : ''}`
        : '';
    } else {
      $('#last-run-date').textContent = 'Chưa có';
      $('#last-run-meta').textContent = 'Bấm nút bên dưới để lấy dữ liệu lần đầu.';
    }

    $('#runs').innerHTML =
      s.recentRuns
        .map((r) => {
          const time = new Date(r.startedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
          const notes = [r.error, ...(r.warnings || [])].filter(Boolean).join(' | ');
          return `<li>
            <span class="run-when">${isoDm(r.crawlDate)} ${time}</span>
            <span class="run-who">${TRIGGER_LABEL[r.trigger] || r.trigger} · <span class="badge ${r.status}">${STATUS_LABEL[r.status] || r.status}</span></span>
            <span class="run-count">${r.productCount.toLocaleString('vi-VN')} SP</span>
            ${notes ? `<span class="run-note ${r.error ? '' : 'warn'}">${escapeHtml(notes)}</span>` : ''}
          </li>`;
        })
        .join('') || '<li><span class="empty">Chưa có lần nào.</span></li>';

    const crawlBtn = $('#crawl-btn');
    if (!crawling) {
      setBusy(crawlBtn, false, s.running ? 'Tiếp tục lấy dữ liệu' : 'Lấy data hôm nay');
      if (s.running && s.progress) setMsg($('#crawl-msg'), progressText(s.progress), '');
    }
    updatePeriodUi();
  }

  const progressText = (p) =>
    `Đang lấy dữ liệu: ${p.doneJobs}/${Math.max(p.totalJobs, p.doneJobs)} trang, ${p.productCount.toLocaleString('vi-VN')} sản phẩm…`;
  let crawling = false;

  // Bấm nút → tạo lượt cào rồi gọi lặp từng bước (mỗi bước 1 trang) tới khi xong.
  // Nếu đóng trang giữa chừng, hệ thống sẽ tự làm tiếp phần còn lại theo lịch.
  $('#crawl-btn').addEventListener('click', async () => {
    const msg = $('#crawl-msg');
    const btn = $('#crawl-btn');
    if (crawling) return;
    crawling = true;
    setBusy(btn, true, 'Đang lấy dữ liệu…');
    try {
      const start = await (await api('/api/crawl', { method: 'POST' })).json();
      setMsg(msg, start.progress ? progressText(start.progress) : start.message, '');
      for (let i = 0; i < 500; i++) {
        const step = await (await api('/api/crawl/step', { method: 'POST' })).json();
        if (step.progress) setMsg(msg, progressText(step.progress), '');
        if (step.finished) break;
        if (!step.worked) await new Promise((r) => setTimeout(r, 2000));
      }
      setMsg(msg, 'Đã lấy xong dữ liệu.', 'ok');
    } catch (err) {
      setMsg(msg, `${err.message}. Bấm lại để tiếp tục.`, 'err');
    } finally {
      crawling = false;
      setBusy(btn, false, 'Lấy data hôm nay');
      await Promise.all([loadStatus(), loadOptions(), loadPreview()]).catch(() => {});
    }
  });


  // ---------- Bảng giá ----------
  let searchTimer;
  function flashCell(p) {
    if (p.flashPrice == null) return '';
    const when =
      p.flashStart && p.flashEnd
        ? p.flashStart.slice(0, 10) === p.flashEnd.slice(0, 10) &&
          p.flashStart.slice(11) === '00:00' &&
          p.flashEnd.slice(11) === '23:59'
          ? `cả ngày ${isoDm(p.flashStart.slice(0, 10))}`
          : `${p.flashStart.slice(11)} – ${p.flashEnd.slice(11)} ${isoDm(p.flashEnd.slice(0, 10))}`
        : '';
    return `<span class="flash">${money(p.flashPrice)}${when ? `<small>${escapeHtml(when)}</small>` : ''}</span>`;
  }

  async function loadPreview() {
    const params = new URLSearchParams({ limit: '1000' });
    const q = $('#search').value.trim();
    const cat = $('#preview-category').value;
    if (q) params.set('q', q);
    if (cat) params.set('categories', cat);
    if ($('#only-own').checked && state.options.ownBrand) params.set('brands', state.options.ownBrand);

    const data = await (await api(`/api/products?${params}`)).json();
    $('#preview-date').textContent = data.date
      ? `Dữ liệu ngày ${dmy(parseIso(data.date))}, ${data.items.length.toLocaleString('vi-VN')} sản phẩm. Bấm tên sản phẩm để mở trên Điện Máy Xanh.`
      : '';

    const own = state.options.ownBrand.toLowerCase();
    let lastCategory = null;
    const rows = [];
    for (const p of data.items) {
      if (!cat && p.categoryName !== lastCategory) {
        rows.push(`<tr class="group"><td colspan="7">${escapeHtml(p.categoryName)}</td></tr>`);
        lastCategory = p.categoryName;
      }
      rows.push(`<tr class="${p.brand.toLowerCase() === own ? 'own' : ''}">
        <td class="brand-cell">${escapeHtml(p.brand)}</td>
        <td><a class="product-name" href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.name)}</a>
          <span class="product-code">${escapeHtml(p.modelCode)}</span></td>
        <td class="num"><span class="price-list">${money(p.listPrice)}</span></td>
        <td class="num"><span class="price-sale">${money(p.price)}</span></td>
        <td class="num">${p.discountPercent ? `<span class="discount">-${p.discountPercent}%</span>` : ''}</td>
        <td class="num">${flashCell(p)}</td>
        <td class="num">${escapeHtml((p.soldText || '').replace(/^Đã bán\s*/i, ''))}</td>
      </tr>`);
    }
    $('#preview').innerHTML =
      rows.join('') ||
      `<tr class="empty-row"><td colspan="7">${data.date ? 'Không có sản phẩm khớp bộ lọc.' : 'Chưa có dữ liệu. Bấm "Lấy data hôm nay" để bắt đầu.'}</td></tr>`;
  }
  $('#preview-category').addEventListener('change', loadPreview);
  $('#only-own').addEventListener('change', loadPreview);
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
