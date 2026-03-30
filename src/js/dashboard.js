/* ===== AD SPENDING DASHBOARD ===== */
(function () {
  'use strict';

  var STORAGE_KEY = 'adDashboardData';

  var PLATFORM_LABELS = {
    facebook: 'Facebook Ads',
    google: 'Google Ads',
    linkedin: 'LinkedIn Ads'
  };

  var PLATFORM_COLORS = {
    facebook: { bg: 'rgba(24,119,242,0.15)', border: '#1877F2' },
    google: { bg: 'rgba(52,168,83,0.15)', border: '#34A853' },
    linkedin: { bg: 'rgba(10,102,194,0.15)', border: '#0A66C2' }
  };

  // ===== DATA PERSISTENCE =====
  function loadData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveData(entries) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  // ===== UTILITY =====
  function fmt(n, decimals) {
    if (decimals === undefined) decimals = 2;
    return Number(n).toLocaleString('pl-PL', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function safeDiv(a, b) {
    return b > 0 ? a / b : 0;
  }

  // ===== SUMMARY CARDS =====
  function updateSummary(entries) {
    var totalSpend = 0;
    var totalClicks = 0;
    var totalImpressions = 0;
    var totalConversions = 0;
    var totalRevenue = 0;

    entries.forEach(function (e) {
      totalSpend += e.spend;
      totalClicks += e.clicks;
      totalImpressions += e.impressions;
      totalConversions += e.conversions;
      totalRevenue += e.revenue || 0;
    });

    document.getElementById('total-spend').textContent = fmt(totalSpend) + ' zł';
    document.getElementById('total-spend-period').textContent =
      entries.length > 0 ? entries.length + ' wpisów' : 'Brak danych';

    document.getElementById('avg-cpc').textContent = fmt(safeDiv(totalSpend, totalClicks)) + ' zł';
    document.getElementById('avg-ctr').textContent = fmt(safeDiv(totalClicks, totalImpressions) * 100) + '%';
    document.getElementById('total-conversions').textContent = totalConversions;
    document.getElementById('avg-cpa-label').textContent =
      'CPA: ' + fmt(safeDiv(totalSpend, totalConversions)) + ' zł';
    document.getElementById('avg-roas').textContent =
      fmt(safeDiv(totalRevenue, totalSpend), 1) + 'x';
  }

  // ===== PLATFORM COMPARISON TABLE =====
  function updatePlatformTable(entries) {
    var tbody = document.getElementById('platform-table-body');
    if (entries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="dash-table__empty">Dodaj dane, aby zobaczyć porównanie</td></tr>';
      return;
    }

    var platforms = {};
    entries.forEach(function (e) {
      if (!platforms[e.platform]) {
        platforms[e.platform] = { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
      }
      var p = platforms[e.platform];
      p.spend += e.spend;
      p.impressions += e.impressions;
      p.clicks += e.clicks;
      p.conversions += e.conversions;
      p.revenue += e.revenue || 0;
    });

    var html = '';
    Object.keys(platforms).sort().forEach(function (key) {
      var p = platforms[key];
      var ctr = safeDiv(p.clicks, p.impressions) * 100;
      var cpc = safeDiv(p.spend, p.clicks);
      var cpm = safeDiv(p.spend, p.impressions) * 1000;
      var cpa = safeDiv(p.spend, p.conversions);
      var roas = safeDiv(p.revenue, p.spend);

      html += '<tr>'
        + '<td><span class="platform-badge platform-badge--' + key + '">' + PLATFORM_LABELS[key] + '</span></td>'
        + '<td>' + fmt(p.spend) + ' zł</td>'
        + '<td>' + fmt(p.impressions, 0) + '</td>'
        + '<td>' + fmt(p.clicks, 0) + '</td>'
        + '<td>' + fmt(ctr) + '%</td>'
        + '<td>' + fmt(cpc) + ' zł</td>'
        + '<td>' + fmt(cpm) + ' zł</td>'
        + '<td>' + fmt(p.conversions, 0) + '</td>'
        + '<td>' + fmt(cpa) + ' zł</td>'
        + '<td>' + fmt(roas, 1) + 'x</td>'
        + '</tr>';
    });

    tbody.innerHTML = html;
  }

  // ===== LOG TABLE =====
  function updateLogTable(entries) {
    var tbody = document.getElementById('log-table-body');
    if (entries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" class="dash-table__empty">Brak wpisów</td></tr>';
      return;
    }

    var sorted = entries.slice().sort(function (a, b) {
      return b.month.localeCompare(a.month) || a.platform.localeCompare(b.platform);
    });

    var html = '';
    sorted.forEach(function (e, i) {
      var ctr = safeDiv(e.clicks, e.impressions) * 100;
      var cpc = safeDiv(e.spend, e.clicks);
      var roas = safeDiv(e.revenue || 0, e.spend);

      html += '<tr>'
        + '<td>' + e.month + '</td>'
        + '<td><span class="platform-badge platform-badge--' + e.platform + '">' + PLATFORM_LABELS[e.platform] + '</span></td>'
        + '<td>' + (e.campaign || '—') + '</td>'
        + '<td>' + fmt(e.spend) + ' zł</td>'
        + '<td>' + fmt(e.impressions, 0) + '</td>'
        + '<td>' + fmt(e.clicks, 0) + '</td>'
        + '<td>' + fmt(ctr) + '%</td>'
        + '<td>' + fmt(cpc) + ' zł</td>'
        + '<td>' + fmt(e.conversions, 0) + '</td>'
        + '<td>' + fmt(roas, 1) + 'x</td>'
        + '<td><button class="btn-delete" data-index="' + entries.indexOf(e) + '" title="Usuń">&times;</button></td>'
        + '</tr>';
    });

    tbody.innerHTML = html;
  }

  // ===== CHARTS =====
  var chartInstances = {};

  function getMonths(entries) {
    var monthSet = {};
    entries.forEach(function (e) { monthSet[e.month] = true; });
    return Object.keys(monthSet).sort();
  }

  function aggregateByMonthPlatform(entries, field) {
    var months = getMonths(entries);
    var platforms = ['facebook', 'google', 'linkedin'];
    var result = {};

    platforms.forEach(function (p) {
      result[p] = months.map(function (m) {
        var items = entries.filter(function (e) { return e.month === m && e.platform === p; });
        var total = 0;
        items.forEach(function (e) { total += e[field] || 0; });
        return total;
      });
    });

    return { months: months, data: result };
  }

  function buildDatasets(agg) {
    var platforms = ['facebook', 'google', 'linkedin'];
    return platforms.map(function (p) {
      return {
        label: PLATFORM_LABELS[p],
        data: agg.data[p],
        backgroundColor: PLATFORM_COLORS[p].bg,
        borderColor: PLATFORM_COLORS[p].border,
        borderWidth: 2,
        tension: 0.3,
        fill: true
      };
    });
  }

  function createOrUpdateChart(id, type, labels, datasets, yLabel) {
    if (chartInstances[id]) {
      chartInstances[id].destroy();
    }

    var ctx = document.getElementById(id);
    if (!ctx) return;

    chartInstances[id] = new Chart(ctx, {
      type: type,
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16 } }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: !!yLabel, text: yLabel || '' },
            grid: { color: 'rgba(0,0,0,0.05)' }
          },
          x: {
            grid: { display: false }
          }
        }
      }
    });
  }

  function updateCharts(entries) {
    if (entries.length === 0) {
      ['chart-spend', 'chart-cpc', 'chart-ctr', 'chart-conversions'].forEach(function (id) {
        if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
      });
      return;
    }

    var months = getMonths(entries);
    var platforms = ['facebook', 'google', 'linkedin'];

    // Spend chart
    var spendAgg = aggregateByMonthPlatform(entries, 'spend');
    createOrUpdateChart('chart-spend', 'bar', months, buildDatasets(spendAgg), 'Wydatki (zł)');

    // CPC chart - computed
    var cpcDatasets = platforms.map(function (p) {
      var values = months.map(function (m) {
        var items = entries.filter(function (e) { return e.month === m && e.platform === p; });
        var spend = 0; var clicks = 0;
        items.forEach(function (e) { spend += e.spend; clicks += e.clicks; });
        return safeDiv(spend, clicks);
      });
      return {
        label: PLATFORM_LABELS[p],
        data: values,
        backgroundColor: PLATFORM_COLORS[p].bg,
        borderColor: PLATFORM_COLORS[p].border,
        borderWidth: 2,
        tension: 0.3,
        fill: false
      };
    });
    createOrUpdateChart('chart-cpc', 'line', months, cpcDatasets, 'CPC (zł)');

    // CTR chart - computed
    var ctrDatasets = platforms.map(function (p) {
      var values = months.map(function (m) {
        var items = entries.filter(function (e) { return e.month === m && e.platform === p; });
        var clicks = 0; var impressions = 0;
        items.forEach(function (e) { clicks += e.clicks; impressions += e.impressions; });
        return safeDiv(clicks, impressions) * 100;
      });
      return {
        label: PLATFORM_LABELS[p],
        data: values,
        backgroundColor: PLATFORM_COLORS[p].bg,
        borderColor: PLATFORM_COLORS[p].border,
        borderWidth: 2,
        tension: 0.3,
        fill: false
      };
    });
    createOrUpdateChart('chart-ctr', 'line', months, ctrDatasets, 'CTR (%)');

    // Conversions chart
    var convAgg = aggregateByMonthPlatform(entries, 'conversions');
    createOrUpdateChart('chart-conversions', 'bar', months, buildDatasets(convAgg), 'Konwersje');
  }

  // ===== REFRESH ALL =====
  function refreshDashboard() {
    var entries = loadData();
    updateSummary(entries);
    updatePlatformTable(entries);
    updateLogTable(entries);
    updateCharts(entries);
  }

  // ===== FORM HANDLING =====
  function initForm() {
    var form = document.getElementById('campaign-form');
    if (!form) return;

    // Set default month to current
    var now = new Date();
    var monthInput = document.getElementById('f-month');
    monthInput.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var entry = {
        id: Date.now(),
        platform: document.getElementById('f-platform').value,
        month: document.getElementById('f-month').value,
        campaign: document.getElementById('f-campaign').value,
        spend: parseFloat(document.getElementById('f-spend').value) || 0,
        impressions: parseInt(document.getElementById('f-impressions').value) || 0,
        clicks: parseInt(document.getElementById('f-clicks').value) || 0,
        conversions: parseInt(document.getElementById('f-conversions').value) || 0,
        revenue: parseFloat(document.getElementById('f-revenue').value) || 0
      };

      var entries = loadData();
      entries.push(entry);
      saveData(entries);

      // Reset form but keep platform and month
      var savedPlatform = entry.platform;
      var savedMonth = entry.month;
      form.reset();
      document.getElementById('f-platform').value = savedPlatform;
      document.getElementById('f-month').value = savedMonth;

      refreshDashboard();

      // Scroll to summary
      document.getElementById('dash-summary').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ===== DELETE ENTRY =====
  function initDeleteHandlers() {
    document.getElementById('log-table-body').addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-delete');
      if (!btn) return;

      var index = parseInt(btn.getAttribute('data-index'));
      var entries = loadData();
      if (index >= 0 && index < entries.length) {
        entries.splice(index, 1);
        saveData(entries);
        refreshDashboard();
      }
    });
  }

  // ===== CLEAR ALL =====
  function initClearAll() {
    var btn = document.getElementById('btn-clear-all');
    if (!btn) return;

    btn.addEventListener('click', function () {
      if (confirm('Na pewno chcesz usunąć wszystkie dane? Tej operacji nie można cofnąć.')) {
        saveData([]);
        refreshDashboard();
      }
    });
  }

  // ===== CSV EXPORT =====
  function initExport() {
    var btn = document.getElementById('btn-export-csv');
    if (!btn) return;

    btn.addEventListener('click', function () {
      var entries = loadData();
      if (entries.length === 0) {
        alert('Brak danych do eksportu.');
        return;
      }

      var headers = ['Miesiąc', 'Platforma', 'Kampania', 'Wydatki', 'Wyświetlenia', 'Kliknięcia', 'CTR%', 'CPC', 'CPM', 'Konwersje', 'CPA', 'Przychód', 'ROAS'];
      var rows = entries.map(function (e) {
        var ctr = safeDiv(e.clicks, e.impressions) * 100;
        var cpc = safeDiv(e.spend, e.clicks);
        var cpm = safeDiv(e.spend, e.impressions) * 1000;
        var cpa = safeDiv(e.spend, e.conversions);
        var roas = safeDiv(e.revenue || 0, e.spend);
        return [
          e.month, PLATFORM_LABELS[e.platform], e.campaign, e.spend.toFixed(2),
          e.impressions, e.clicks, ctr.toFixed(2), cpc.toFixed(2), cpm.toFixed(2),
          e.conversions, cpa.toFixed(2), (e.revenue || 0).toFixed(2), roas.toFixed(2)
        ].join(';');
      });

      var csv = '\uFEFF' + headers.join(';') + '\n' + rows.join('\n');
      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'wydatki_reklamowe_' + new Date().toISOString().split('T')[0] + '.csv';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // ===== INIT =====
  document.addEventListener('DOMContentLoaded', function () {
    initForm();
    initDeleteHandlers();
    initClearAll();
    initExport();
    refreshDashboard();
  });
})();
