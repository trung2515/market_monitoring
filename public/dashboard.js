// Dashboard thị trường – vẽ biểu đồ SVG thuần (không thư viện), dữ liệu lấy từ window.MarketReport.data()
// (cùng bộ phân tích với file Excel, chạy trên trình duyệt).
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const root = $('#dashboard');
  if (!root) return;

  // ---------- Màu (đã kiểm tra phân biệt được với người mù màu) ----------
  // Màu đi theo THƯƠNG HIỆU, không theo thứ hạng: Elmich luôn xanh lá, 3 đối thủ chính theo thứ tự trong cấu hình.
  const OWN_COLOR = '#008a17';
  const RIVAL_COLORS = ['#257de0', '#ee7fac', '#f2a600'];
  const OTHER_COLOR = '#a9b4ba';

  const escapeHtml = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const pad = (n) => String(n).padStart(2, '0');
  const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
  const int = (v) => Math.round(v).toLocaleString('vi-VN');
  const pct = (v) => `${(Math.round(v * 10) / 10).toLocaleString('vi-VN')}%`;
  const moneyShort = (v) =>
    v >= 1_000_000
      ? `${(Math.round(v / 100_000) / 10).toLocaleString('vi-VN')} tr`
      : `${Math.round(v / 1000).toLocaleString('vi-VN')}k`;
  const money = (v) => `${Math.round(v).toLocaleString('vi-VN')} ₫`;
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  const svgEl = (w, h, inner) =>
    `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;

  // ---------- Tooltip dùng chung ----------
  const tip = document.createElement('div');
  tip.className = 'dash-tip';
  tip.hidden = true;
  document.body.appendChild(tip);
  function showTip(html, evt) {
    tip.innerHTML = html;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let x = evt.clientX + 14;
    let y = evt.clientY + 14;
    if (x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - 14;
    if (y + r.height > window.innerHeight - 8) y = evt.clientY - r.height - 14;
    tip.style.transform = `translate(${x}px, ${y}px)`;
  }
  const hideTip = () => (tip.hidden = true);

  /** Gắn tooltip cho các phần tử có data-tip (theo chỉ số trong mảng tips). */
  function bindTips(el, tips) {
    el.querySelectorAll('[data-tip]').forEach((node) => {
      node.addEventListener('mousemove', (e) => showTip(tips[Number(node.dataset.tip)], e));
      node.addEventListener('mouseleave', hideTip);
    });
  }

  // ---------- Biểu đồ cột ngang (1 chuỗi số) ----------
  function barChart(el, rows, { format }) {
    if (!rows.length) return empty(el);
    const width = Math.max(320, el.clientWidth);
    const labelW = Math.min(150, Math.round(width * 0.32));
    const valueW = 64;
    const rowH = 30;
    const barH = 14;
    const plotW = width - labelW - valueW - 8;
    const max = Math.max(...rows.map((r) => r.value), 1);
    const tips = [];
    const inner = rows
      .map((r, i) => {
        const y = i * rowH;
        const w = Math.max(r.value > 0 ? 3 : 0, (r.value / max) * plotW);
        const by = y + (rowH - barH) / 2;
        const rad = Math.min(4, w / 2);
        tips.push(r.tip);
        // Đầu cột bo 4px, gốc cột vuông (bám trục)
        const bar =
          w > 0
            ? `<path d="M${labelW},${by} h${w - rad} a${rad},${rad} 0 0 1 ${rad},${rad} v${barH - 2 * rad} a${rad},${rad} 0 0 1 -${rad},${rad} h-${w - rad} z" fill="${r.color}"/>`
            : '';
        return `<g class="dash-row" data-tip="${i}">
          <rect x="0" y="${y}" width="${width}" height="${rowH}" fill="transparent"/>
          <text x="${labelW - 10}" y="${y + rowH / 2}" class="dash-label${r.own ? ' own' : ''}" text-anchor="end" dominant-baseline="central">${escapeHtml(truncate(r.label, 20))}</text>
          ${bar}
          <text x="${labelW + w + 6}" y="${y + rowH / 2}" class="dash-value" dominant-baseline="central">${escapeHtml(format(r.value))}</text>
        </g>`;
      })
      .join('');
    el.innerHTML = svgEl(width, rows.length * rowH, `<line x1="${labelW}" x2="${labelW}" y1="0" y2="${rows.length * rowH}" class="dash-axis"/>${inner}`);
    bindTips(el, tips);
  }

  // ---------- Biểu đồ cột nhóm (vd SKU theo khoảng giá: Elmich vs hãng khác) ----------
  function groupedBars(el, categories, series) {
    if (!categories.length) return empty(el);
    const width = Math.max(320, el.clientWidth);
    const height = 230;
    const m = { top: 12, right: 8, bottom: 40, left: 40 };
    const plotW = width - m.left - m.right;
    const plotH = height - m.top - m.bottom;
    const max = niceMax(Math.max(...series.flatMap((s) => s.values), 1));
    const groupW = plotW / categories.length;
    const barW = Math.min(28, (groupW * 0.7 - 2 * (series.length - 1)) / series.length);
    const y = (v) => m.top + plotH - (v / max) * plotH;
    const tips = [];
    let marks = '';
    categories.forEach((cat, ci) => {
      const gx = m.left + ci * groupW + (groupW - (barW * series.length + 2 * (series.length - 1))) / 2;
      tips.push(
        `<b>${escapeHtml(cat)}</b>` +
          series.map((s) => `<div>${swatch(s.color)}${escapeHtml(s.name)}: <b>${int(s.values[ci])}</b> SKU</div>`).join(''),
      );
      marks += `<rect x="${m.left + ci * groupW}" y="${m.top}" width="${groupW}" height="${plotH}" fill="transparent" data-tip="${ci}"/>`;
      series.forEach((s, si) => {
        const v = s.values[ci];
        if (!v) return;
        const x = gx + si * (barW + 2);
        const top = y(v);
        const h = m.top + plotH - top;
        const rad = Math.min(4, h, barW / 2);
        marks += `<path d="M${x},${m.top + plotH} v-${h - rad} a${rad},${rad} 0 0 1 ${rad},-${rad} h${barW - 2 * rad} a${rad},${rad} 0 0 1 ${rad},${rad} v${h - rad} z" fill="${s.color}" pointer-events="none"/>`;
      });
      // Nhãn khoảng giá: hẹp thì xuống 2 dòng ("200k –" / "400k")
      const cx = m.left + ci * groupW + groupW / 2;
      const parts = groupW < 70 ? cat.split(/(?<=–)\s/) : [cat];
      marks += `<text x="${cx}" y="${height - m.bottom + 16}" class="dash-tick" text-anchor="middle">${parts
        .map((t, k) => `<tspan x="${cx}" dy="${k ? 13 : 0}">${escapeHtml(t)}</tspan>`)
        .join('')}</text>`;
    });
    el.innerHTML = svgEl(width, height, yGrid(max, y, m, width) + marks);
    bindTips(el, tips);
  }

  // ---------- Biểu đồ đường theo ngày (có đường dóng + tooltip) ----------
  function lineChart(el, dates, series, { format }) {
    if (dates.length < 2 || !series.length) return empty(el, 'Cần dữ liệu từ 2 ngày trở lên để vẽ diễn biến.');
    const width = Math.max(320, el.clientWidth);
    const height = 240;
    const m = { top: 12, right: 92, bottom: 28, left: 40 };
    const plotW = width - m.left - m.right;
    const plotH = height - m.top - m.bottom;
    const max = niceMax(Math.max(...series.flatMap((s) => s.values), 1));
    const x = (i) => m.left + (dates.length === 1 ? plotW / 2 : (i / (dates.length - 1)) * plotW);
    const y = (v) => m.top + plotH - (v / max) * plotH;
    const step = Math.max(1, Math.ceil(dates.length / Math.max(2, Math.floor(plotW / 56))));
    let ticks = '';
    dates.forEach((d, i) => {
      if (i % step === 0 || i === dates.length - 1)
        ticks += `<text x="${x(i)}" y="${height - 8}" class="dash-tick" text-anchor="middle">${dm(d)}</text>`;
    });
    const lines = series
      .map((s) => `<path d="${s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')}" class="dash-line" stroke="${s.color}"/>`)
      .join('');
    // Nhãn trực tiếp ở cuối đường, đẩy nhẹ để không đè nhau
    const ends = series
      .map((s) => ({ s, y: y(s.values.at(-1)) }))
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 14);
    const labels = ends
      .map(
        ({ s, y: ly }) =>
          `<circle cx="${x(dates.length - 1)}" cy="${y(s.values.at(-1))}" r="3.5" fill="${s.color}" stroke="var(--panel)" stroke-width="2"/>` +
          `<text x="${x(dates.length - 1) + 8}" y="${ly}" class="dash-end" dominant-baseline="central">${escapeHtml(truncate(s.name, 11))}</text>`,
      )
      .join('');
    el.innerHTML = svgEl(
      width,
      height,
      yGrid(max, y, m, width) +
        ticks +
        lines +
        labels +
        `<line class="dash-cross" y1="${m.top}" y2="${m.top + plotH}" visibility="hidden"/>` +
        `<g class="dash-dots"></g>` +
        `<rect class="dash-hit" x="${m.left}" y="${m.top}" width="${plotW}" height="${plotH}" fill="transparent"/>`,
    );
    const svg = $('svg', el);
    const cross = $('.dash-cross', svg);
    const dots = $('.dash-dots', svg);
    const hit = $('.dash-hit', svg);
    hit.addEventListener('mousemove', (e) => {
      const box = svg.getBoundingClientRect();
      const px = ((e.clientX - box.left) / box.width) * width;
      const i = Math.max(0, Math.min(dates.length - 1, Math.round(((px - m.left) / plotW) * (dates.length - 1))));
      cross.setAttribute('x1', x(i));
      cross.setAttribute('x2', x(i));
      cross.setAttribute('visibility', 'visible');
      dots.innerHTML = series
        .map((s) => `<circle cx="${x(i)}" cy="${y(s.values[i])}" r="4.5" fill="${s.color}" stroke="var(--panel)" stroke-width="2"/>`)
        .join('');
      const rows = [...series]
        .sort((a, b) => b.values[i] - a.values[i])
        .map((s) => `<div>${swatch(s.color)}${escapeHtml(s.name)}: <b>${escapeHtml(format(s.values[i]))}</b></div>`)
        .join('');
      showTip(`<b>Ngày ${dm(dates[i])}</b>${rows}`, e);
    });
    hit.addEventListener('mouseleave', () => {
      cross.setAttribute('visibility', 'hidden');
      dots.innerHTML = '';
      hideTip();
    });
  }

  function yGrid(max, y, m, right) {
    let out = '';
    for (let k = 0; k <= 4; k++) {
      const v = (max / 4) * k;
      out += `<line x1="${m.left}" x2="${right - m.right}" y1="${y(v)}" y2="${y(v)}" class="${k ? 'dash-gridline' : 'dash-axis'}"/>`;
      out += `<text x="${m.left - 6}" y="${y(v)}" class="dash-tick" text-anchor="end" dominant-baseline="central">${int(v)}</text>`;
    }
    return out;
  }
  /** Giá trị trần trục Y "đẹp", chia hết cho 4 vạch (vd 10 → 12, 37 → 40). */
  function niceMax(v) {
    const p = 10 ** Math.floor(Math.log10(Math.max(v, 1)));
    const n = v / p;
    const max = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 8 ? 8 : 10) * p;
    const step = Math.ceil(max / 4);
    return step * 4;
  }
  const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const swatch = (c) => `<i class="dash-swatch" style="background:${c}"></i>`;
  function empty(el, text = 'Chưa có dữ liệu cho bộ lọc này.') {
    el.innerHTML = `<p class="dash-empty">${escapeHtml(text)}</p>`;
  }
  const legend = (items) =>
    `<div class="dash-legend">${items.map((s) => `<span>${swatch(s.color)}${escapeHtml(s.name)}</span>`).join('')}</div>`;
  function dataTable(headers, rows) {
    return `<details class="dash-table"><summary>Xem số liệu</summary><div class="table-wrap"><table>
      <thead><tr>${headers.map((h, i) => `<th${i ? ' class="num"' : ''}>${escapeHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i ? ' class="num"' : ''}>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div></details>`;
  }

  // ---------- Gom dữ liệu từ ReportData ----------
  function brandTotals(data) {
    const own = data.ownBrand.toLowerCase();
    const map = new Map();
    for (const r of data.market.shares) {
      const b = map.get(r.brand) ?? { brand: r.brand, own: r.brand.toLowerCase() === own, sku: 0, sold: 0, priceSum: 0, priceN: 0, discSum: 0, discN: 0 };
      b.sku += r.skuCount;
      b.sold += r.sold;
      if (r.avgPrice != null) {
        b.priceSum += r.avgPrice * r.skuCount;
        b.priceN += r.skuCount;
      }
      if (r.avgDiscount != null) {
        b.discSum += r.avgDiscount * r.skuCount;
        b.discN += r.skuCount;
      }
      map.set(r.brand, b);
    }
    const sold = new Map();
    for (const d of data.soldDeltas) sold.set(d.product.brand, (sold.get(d.product.brand) ?? 0) + d.delta);
    return [...map.values()].map((b) => ({
      ...b,
      avgPrice: b.priceN ? b.priceSum / b.priceN : null,
      avgDiscount: b.discN ? b.discSum / b.discN : null,
      soldInPeriod: sold.get(b.brand) ?? 0,
    }));
  }

  /** Top N hãng + gộp phần còn lại thành "Hãng khác" (luôn giữ Elmich). */
  function topWithOther(rows, n, key) {
    const sorted = [...rows].sort((a, b) => b[key] - a[key]);
    const top = sorted.slice(0, n);
    const own = sorted.find((r) => r.own);
    if (own && !top.includes(own)) top[top.length - 1] = own;
    const rest = sorted.filter((r) => !top.includes(r));
    const restSum = sum(rest.map((r) => r[key]));
    return { top, rest, restSum };
  }

  // ---------- Vẽ toàn bộ dashboard ----------
  let lastData = null;

  function render(data) {
    lastData = data;
    const own = data.ownBrand;
    const brands = brandTotals(data);
    const totalSku = sum(brands.map((b) => b.sku));
    const totalSold = sum(brands.map((b) => b.sold));
    const totalInPeriod = sum(brands.map((b) => b.soldInPeriod));
    const me = brands.find((b) => b.own) ?? { sku: 0, sold: 0, soldInPeriod: 0, avgPrice: null };
    const newRivals = data.newProducts.filter((p) => p.product.brand.toLowerCase() !== own.toLowerCase());

    // KPI
    const rank = [...brands].sort((a, b) => b.sold - a.sold).findIndex((b) => b.own) + 1;
    $('#dash-kpis').innerHTML = [
      kpi('Thị phần lượt bán', totalSold ? pct((me.sold / totalSold) * 100) : '—', rank ? `Đứng thứ ${rank}/${brands.length} hãng` : `${own} chưa có sản phẩm`),
      kpi('Số sản phẩm (SKU)', int(me.sku), totalSku ? `${pct((me.sku / totalSku) * 100)} trên tổng ${int(totalSku)} SKU` : ''),
      kpi(
        'Bán trong kỳ (ước tính)',
        data.baselineDate ? int(me.soldInPeriod) : '—',
        data.baselineDate ? (totalInPeriod ? `${pct((me.soldInPeriod / totalInPeriod) * 100)} tổng bán trong kỳ` : '') : 'Cần thêm ngày dữ liệu để so',
      ),
      kpi('SP mới của đối thủ', int(newRivals.length), 'Xuất hiện lần đầu trong kỳ'),
    ].join('');

    const color = (b) => (b.own ? OWN_COLOR : OTHER_COLOR);

    // 1. Thị phần lượt bán
    {
      const { top, restSum } = topWithOther(brands, 8, 'sold');
      const rows = top.map((b) => ({
        label: b.brand,
        own: b.own,
        value: totalSold ? (b.sold / totalSold) * 100 : 0,
        color: color(b),
        tip: `<b>${escapeHtml(b.brand)}</b><div>Thị phần: <b>${pct(totalSold ? (b.sold / totalSold) * 100 : 0)}</b></div><div>Đã bán cộng dồn: ${int(b.sold)}</div><div>${int(b.sku)} SKU</div>`,
      }));
      if (restSum > 0)
        rows.push({ label: 'Hãng khác', value: (restSum / totalSold) * 100, color: OTHER_COLOR, tip: `<b>Hãng khác</b><div>${pct((restSum / totalSold) * 100)}</div>` });
      barChart($('#chart-share'), rows, { format: pct });
      $('#chart-share-table').innerHTML = dataTable(
        ['Hãng', 'Thị phần', 'Đã bán', 'SKU'],
        [...brands].sort((a, b) => b.sold - a.sold).map((b) => [b.brand, pct(totalSold ? (b.sold / totalSold) * 100 : 0), int(b.sold), int(b.sku)]),
      );
    }

    // 2. Bán trong kỳ theo hãng
    {
      const el = $('#chart-sold');
      if (!data.baselineDate || totalInPeriod === 0) {
        empty(el, 'Cần dữ liệu từ 2 ngày trở lên để tính số bán trong kỳ.');
        $('#chart-sold-table').innerHTML = '';
      } else {
        const { top } = topWithOther(brands, 8, 'soldInPeriod');
        barChart(
          el,
          top.map((b) => ({
            label: b.brand,
            own: b.own,
            value: b.soldInPeriod,
            color: color(b),
            tip: `<b>${escapeHtml(b.brand)}</b><div>Bán trong kỳ: <b>${int(b.soldInPeriod)}</b></div><div>${pct((b.soldInPeriod / totalInPeriod) * 100)} tổng bán trong kỳ</div>`,
          })),
          { format: int },
        );
        $('#chart-sold-table').innerHTML = dataTable(
          ['Hãng', 'Bán trong kỳ', '% tổng'],
          [...brands].sort((a, b) => b.soldInPeriod - a.soldInPeriod).map((b) => [b.brand, int(b.soldInPeriod), pct((b.soldInPeriod / totalInPeriod) * 100)]),
        );
      }
    }

    // 3. Giá bán trung bình theo hãng
    {
      const rows = brands
        .filter((b) => b.avgPrice != null && b.sku > 0)
        .sort((a, b) => b.sku - a.sku)
        .slice(0, 8);
      if (!rows.some((b) => b.own) && me.avgPrice != null) rows[rows.length - 1] = me;
      rows.sort((a, b) => b.avgPrice - a.avgPrice);
      barChart(
        $('#chart-price'),
        rows.map((b) => ({
          label: b.brand,
          own: b.own,
          value: b.avgPrice,
          color: color(b),
          tip: `<b>${escapeHtml(b.brand)}</b><div>Giá bán TB: <b>${money(b.avgPrice)}</b></div><div>Giảm giá TB: ${b.avgDiscount == null ? '—' : pct(b.avgDiscount)}</div><div>${int(b.sku)} SKU</div>`,
        })),
        { format: moneyShort },
      );
      $('#chart-price-table').innerHTML = dataTable(
        ['Hãng', 'Giá bán TB', 'Giảm giá TB', 'SKU'],
        rows.map((b) => [b.brand, money(b.avgPrice), b.avgDiscount == null ? '—' : pct(b.avgDiscount), int(b.sku)]),
      );
    }

    // 4. SKU theo khoảng giá
    {
      const bands = [];
      const ownCount = new Map();
      const total = new Map();
      for (const r of data.market.priceBands) {
        if (!total.has(r.band)) bands.push(r.band);
        total.set(r.band, (total.get(r.band) ?? 0) + r.skuCount);
        ownCount.set(r.band, (ownCount.get(r.band) ?? 0) + r.ownCount);
      }
      const series = [
        { name: own, color: OWN_COLOR, values: bands.map((b) => ownCount.get(b) ?? 0) },
        { name: 'Các hãng khác', color: OTHER_COLOR, values: bands.map((b) => (total.get(b) ?? 0) - (ownCount.get(b) ?? 0)) },
      ];
      $('#chart-bands-legend').innerHTML = legend(series);
      groupedBars($('#chart-bands'), bands, series);
      $('#chart-bands-table').innerHTML = dataTable(
        ['Khoảng giá', own, 'Các hãng khác'],
        bands.map((b, i) => [b, int(series[0].values[i]), int(series[1].values[i])]),
      );
    }

    // 5. Số SKU có flash sale mỗi ngày (Elmich + 3 đối thủ chính)
    {
      const { dates, rows } = data.market.flashCalendar;
      const names = [own, ...state.rivals];
      const series = names.map((name, i) => ({
        name,
        color: i === 0 ? OWN_COLOR : RIVAL_COLORS[i - 1],
        values: dates.map((_, di) => rows.filter((r) => r.product.brand.toLowerCase() === name.toLowerCase() && r.flash[di] != null).length),
      }));
      $('#chart-flash-legend').innerHTML = legend(series);
      lineChart($('#chart-flash'), dates, series, { format: (v) => `${int(v)} SKU` });
      $('#chart-flash-table').innerHTML = dataTable(['Ngày', ...names], dates.map((d, di) => [dm(d), ...series.map((s) => int(s.values[di]))]));
    }

    // 6. SP mới của đối thủ
    {
      const list = [...newRivals].sort((a, b) => b.product.firstSeenDate.localeCompare(a.product.firstSeenDate)).slice(0, 12);
      $('#dash-new').innerHTML = list.length
        ? `<div class="table-wrap"><table class="dash-new-table"><thead><tr><th>Ngày</th><th>Hãng</th><th>Sản phẩm</th><th class="num">Giá bán</th><th></th></tr></thead><tbody>${list
            .map(
              (p) => `<tr><td>${dm(p.product.firstSeenDate)}</td><td>${escapeHtml(p.product.brand)}</td><td>${escapeHtml(p.product.name)}</td>
              <td class="num">${p.snapshot.price == null ? '—' : money(p.snapshot.price)}</td>
              <td><a href="${escapeHtml(p.product.url)}" target="_blank" rel="noopener">Xem</a></td></tr>`,
            )
            .join('')}</tbody></table></div>${newRivals.length > list.length ? `<p class="note">Và ${newRivals.length - list.length} sản phẩm khác – xem đủ trong sheet "SP mới" của file Excel.</p>` : ''}`
        : '<p class="dash-empty">Chưa phát hiện sản phẩm mới nào của đối thủ trong kỳ này.</p>';
    }
  }

  const kpi = (label, value, sub) =>
    `<div class="kpi"><p class="kpi-label">${escapeHtml(label)}</p><p class="kpi-value">${escapeHtml(value)}</p><p class="kpi-sub">${escapeHtml(sub)}</p></div>`;

  // ---------- Bộ lọc & tải dữ liệu ----------
  const state = { days: 30, category: '', rivals: [], loading: 0 };

  async function load() {
    const status = $('#dash-status');
    if (!window.MarketReport) return (status.textContent = 'Thiếu file report.bundle.js.');
    const token = ++state.loading;
    root.setAttribute('aria-busy', 'true');
    status.className = 'msg';
    status.textContent = 'Đang tải dữ liệu…';
    try {
      const to = new Date();
      const from = new Date(to);
      from.setDate(from.getDate() - (state.days - 1));
      const data = await window.MarketReport.data(
        { period: 'custom', from: toIso(from), to: toIso(to), categories: state.category ? [state.category] : [] },
        (text) => token === state.loading && (status.textContent = text),
      );
      if (token !== state.loading) return;
      const opts = await (await fetch('/api/options')).json();
      state.rivals = opts.competitorBrands.slice(0, 3);
      render(data);
      status.textContent = data.endDate
        ? `Dữ liệu ${data.crawlDates.length} ngày, từ ${dm(data.crawlDates[0])} đến ${dm(data.endDate)}${data.baselineDate ? `, so với ngày ${dm(data.baselineDate)}` : ''}.`
        : 'Chưa có dữ liệu trong khoảng thời gian này.';
    } catch (err) {
      if (token !== state.loading) return;
      status.className = 'msg err';
      status.textContent = err.message;
    } finally {
      if (token === state.loading) root.removeAttribute('aria-busy');
    }
  }

  $('#dash-range').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-days]');
    if (!btn) return;
    state.days = Number(btn.dataset.days);
    root.querySelectorAll('#dash-range button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    load();
  });
  $('#dash-category').addEventListener('change', (e) => {
    state.category = e.target.value;
    load();
  });

  /** Danh sách danh mục cho bộ lọc (gọi lại khi danh mục thay đổi). */
  window.Dashboard = {
    setCategories(categories) {
      const sel = $('#dash-category');
      const current = sel.value;
      sel.innerHTML =
        '<option value="">Tất cả danh mục</option>' +
        categories.map((c) => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</option>`).join('');
      sel.value = categories.some((c) => c.slug === current) ? current : '';
    },
    reload: load,
  };

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => lastData && render(lastData), 200);
  });

  load();
})();
