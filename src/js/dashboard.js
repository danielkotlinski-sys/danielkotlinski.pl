/* ===== AD SPENDING DASHBOARD — Auth + API ===== */
(function () {
  'use strict';

  // ===== CONFIG =====
  // SHA-256 hash of the dashboard password.
  // To change: run in browser console:
  //   crypto.subtle.digest('SHA-256', new TextEncoder().encode('YOUR_PASSWORD'))
  //     .then(h => console.log(Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('')))
  // Then paste the hash below.
  var PASSWORD_HASH = 'SET_YOUR_PASSWORD_HASH_HERE';

  var API_BASE = '/api';
  var SESSION_KEY = 'dashSession';
  var CACHE_KEY = 'dashCache';
  var MAX_LOGIN_ATTEMPTS = 5;
  var LOCKOUT_MS = 15 * 60 * 1000; // 15 min lockout
  var SESSION_DURATION_MS = 4 * 60 * 60 * 1000; // 4h session
  var ATTEMPTS_KEY = 'dashLoginAttempts';

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

  // ===== AUTH =====
  async function hashPassword(password) {
    var encoded = new TextEncoder().encode(password);
    var buffer = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(buffer))
      .map(function (b) { return b.toString(16).padStart(2, '0'); })
      .join('');
  }

  function getLoginAttempts() {
    try {
      var data = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) || '{}');
      // Reset if lockout expired
      if (data.lockedUntil && Date.now() > data.lockedUntil) {
        localStorage.removeItem(ATTEMPTS_KEY);
        return { count: 0, lockedUntil: null };
      }
      return data;
    } catch (e) {
      return { count: 0, lockedUntil: null };
    }
  }

  function recordFailedAttempt() {
    var data = getLoginAttempts();
    data.count = (data.count || 0) + 1;
    if (data.count >= MAX_LOGIN_ATTEMPTS) {
      data.lockedUntil = Date.now() + LOCKOUT_MS;
    }
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(data));
    return data;
  }

  function resetLoginAttempts() {
    localStorage.removeItem(ATTEMPTS_KEY);
  }

  function createSession(passwordHash) {
    var session = {
      token: passwordHash,
      created: Date.now(),
      expires: Date.now() + SESSION_DURATION_MS
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function getSession() {
    try {
      var session = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      if (!session) return null;
      if (Date.now() > session.expires) {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
      return session;
    } catch (e) {
      return null;
    }
  }

  function destroySession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function getDashboardSecret() {
    var session = getSession();
    return session ? session.token : null;
  }

  // ===== API FETCHING =====
  function getCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setCache(data) {
    data.cachedAt = Date.now();
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  }

  async function fetchPlatform(platform, params) {
    var url = API_BASE + '/' + platform;
    if (params) {
      var qs = new URLSearchParams(params).toString();
      if (qs) url += '?' + qs;
    }

    var response = await fetch(url, {
      headers: { 'X-Dashboard-Token': getDashboardSecret() || '' }
    });

    var data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'API error ' + response.status);
    }
    return data;
  }

  async function fetchAllPlatforms(params) {
    var statusEl = document.getElementById('api-status');
    var results = { facebook: null, google: null, linkedin: null };
    var allEntries = [];

    var platforms = ['facebook', 'google', 'linkedin'];

    // Show loading state
    statusEl.innerHTML = platforms.map(function (p) {
      return '<span class="api-badge api-badge--loading">' + PLATFORM_LABELS[p] + ': ładowanie...</span>';
    }).join('');

    var fetches = platforms.map(function (platform) {
      return fetchPlatform(platform, params)
        .then(function (data) {
          results[platform] = { ok: true, data: data };
          allEntries = allEntries.concat(data.entries || []);
        })
        .catch(function (err) {
          results[platform] = { ok: false, error: err.message };
        });
    });

    await Promise.all(fetches);

    // Update status badges
    statusEl.innerHTML = platforms.map(function (p) {
      var r = results[p];
      if (r.ok) {
        var count = (r.data.entries || []).length;
        return '<span class="api-badge api-badge--ok">' + PLATFORM_LABELS[p] + ': ' + count + ' wpisów</span>';
      } else {
        return '<span class="api-badge api-badge--error">' + PLATFORM_LABELS[p] + ': ' + escapeHtml(r.error) + '</span>';
      }
    }).join('');

    // Cache results
    setCache({ entries: allEntries, results: results });

    return allEntries;
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

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===== SUMMARY CARDS =====
  function updateSummary(entries) {
    var totalSpend = 0, totalClicks = 0, totalImpressions = 0;
    var totalConversions = 0, totalRevenue = 0;

    entries.forEach(function (e) {
      totalSpend += e.spend || 0;
      totalClicks += e.clicks || 0;
      totalImpressions += e.impressions || 0;
      totalConversions += e.conversions || 0;
      totalRevenue += e.revenue || 0;
    });

    document.getElementById('total-spend').textContent = fmt(totalSpend) + ' zł';
    document.getElementById('total-spend-period').textContent =
      entries.length > 0 ? entries.length + ' kampanii' : 'Brak danych';
    document.getElementById('avg-cpc').textContent = fmt(safeDiv(totalSpend, totalClicks)) + ' zł';
    document.getElementById('avg-ctr').textContent = fmt(safeDiv(totalClicks, totalImpressions) * 100) + '%';
    document.getElementById('total-conversions').textContent = Math.round(totalConversions);
    document.getElementById('avg-cpa-label').textContent =
      'CPA: ' + fmt(safeDiv(totalSpend, totalConversions)) + ' zł';
    document.getElementById('avg-roas').textContent =
      fmt(safeDiv(totalRevenue, totalSpend), 1) + 'x';
  }

  // ===== PLATFORM COMPARISON TABLE =====
  function updatePlatformTable(entries) {
    var tbody = document.getElementById('platform-table-body');
    if (entries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="dash-table__empty">Brak danych</td></tr>';
      return;
    }

    var platforms = {};
    entries.forEach(function (e) {
      if (!platforms[e.platform]) {
        platforms[e.platform] = { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
      }
      var p = platforms[e.platform];
      p.spend += e.spend || 0;
      p.impressions += e.impressions || 0;
      p.clicks += e.clicks || 0;
      p.conversions += e.conversions || 0;
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
        + '<td><span class="platform-badge platform-badge--' + escapeHtml(key) + '">' + escapeHtml(PLATFORM_LABELS[key] || key) + '</span></td>'
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

  // ===== CAMPAIGNS TABLE =====
  function updateLogTable(entries) {
    var tbody = document.getElementById('log-table-body');
    if (entries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="dash-table__empty">Brak danych z API</td></tr>';
      return;
    }

    var sorted = entries.slice().sort(function (a, b) {
      return (b.month || '').localeCompare(a.month || '') || (a.platform || '').localeCompare(b.platform || '');
    });

    var html = '';
    sorted.forEach(function (e) {
      var ctr = safeDiv(e.clicks, e.impressions) * 100;
      var cpc = safeDiv(e.spend, e.clicks);
      var roas = safeDiv(e.revenue || 0, e.spend);

      html += '<tr>'
        + '<td>' + escapeHtml(e.month || '') + '</td>'
        + '<td><span class="platform-badge platform-badge--' + escapeHtml(e.platform) + '">' + escapeHtml(PLATFORM_LABELS[e.platform] || e.platform) + '</span></td>'
        + '<td>' + escapeHtml(e.campaign || '—') + '</td>'
        + '<td>' + fmt(e.spend) + ' zł</td>'
        + '<td>' + fmt(e.impressions, 0) + '</td>'
        + '<td>' + fmt(e.clicks, 0) + '</td>'
        + '<td>' + fmt(ctr) + '%</td>'
        + '<td>' + fmt(cpc) + ' zł</td>'
        + '<td>' + fmt(e.conversions, 0) + '</td>'
        + '<td>' + fmt(roas, 1) + 'x</td>'
        + '</tr>';
    });

    tbody.innerHTML = html;
  }

  // ===== CHARTS =====
  var chartInstances = {};

  function getMonths(entries) {
    var monthSet = {};
    entries.forEach(function (e) { if (e.month) monthSet[e.month] = true; });
    return Object.keys(monthSet).sort();
  }

  function buildDatasets(entries, months, valueFunc) {
    var platforms = ['facebook', 'google', 'linkedin'];
    return platforms.map(function (p) {
      var values = months.map(function (m) {
        return valueFunc(entries.filter(function (e) { return e.month === m && e.platform === p; }));
      });
      return {
        label: PLATFORM_LABELS[p],
        data: values,
        backgroundColor: PLATFORM_COLORS[p].bg,
        borderColor: PLATFORM_COLORS[p].border,
        borderWidth: 2,
        tension: 0.3,
        fill: true
      };
    });
  }

  function createOrUpdateChart(id, type, labels, datasets, yLabel) {
    if (chartInstances[id]) chartInstances[id].destroy();
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
          y: { beginAtZero: true, title: { display: !!yLabel, text: yLabel || '' }, grid: { color: 'rgba(0,0,0,0.05)' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  function updateCharts(entries) {
    var chartIds = ['chart-spend', 'chart-cpc', 'chart-ctr', 'chart-conversions'];
    if (entries.length === 0) {
      chartIds.forEach(function (id) {
        if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
      });
      return;
    }

    var months = getMonths(entries);

    // Spend
    var spendDS = buildDatasets(entries, months, function (items) {
      var t = 0; items.forEach(function (e) { t += e.spend || 0; }); return t;
    });
    createOrUpdateChart('chart-spend', 'bar', months, spendDS, 'Wydatki (zł)');

    // CPC
    var cpcDS = buildDatasets(entries, months, function (items) {
      var s = 0, c = 0;
      items.forEach(function (e) { s += e.spend || 0; c += e.clicks || 0; });
      return safeDiv(s, c);
    });
    cpcDS.forEach(function (ds) { ds.fill = false; });
    createOrUpdateChart('chart-cpc', 'line', months, cpcDS, 'CPC (zł)');

    // CTR
    var ctrDS = buildDatasets(entries, months, function (items) {
      var cl = 0, im = 0;
      items.forEach(function (e) { cl += e.clicks || 0; im += e.impressions || 0; });
      return safeDiv(cl, im) * 100;
    });
    ctrDS.forEach(function (ds) { ds.fill = false; });
    createOrUpdateChart('chart-ctr', 'line', months, ctrDS, 'CTR (%)');

    // Conversions
    var convDS = buildDatasets(entries, months, function (items) {
      var t = 0; items.forEach(function (e) { t += e.conversions || 0; }); return t;
    });
    createOrUpdateChart('chart-conversions', 'bar', months, convDS, 'Konwersje');
  }

  // ===== REFRESH =====
  function refreshDashboard(entries) {
    updateSummary(entries);
    updatePlatformTable(entries);
    updateLogTable(entries);
    updateCharts(entries);
  }

  // ===== CSV EXPORT =====
  function initExport() {
    document.getElementById('btn-export-csv').addEventListener('click', function () {
      var cache = getCache();
      var entries = cache ? cache.entries : [];
      if (entries.length === 0) { alert('Brak danych do eksportu.'); return; }

      var headers = ['Miesiąc', 'Platforma', 'Kampania', 'Wydatki', 'Wyświetlenia', 'Kliknięcia', 'CTR%', 'CPC', 'CPM', 'Konwersje', 'CPA', 'Przychód', 'ROAS'];
      var rows = entries.map(function (e) {
        var ctr = safeDiv(e.clicks, e.impressions) * 100;
        var cpc = safeDiv(e.spend, e.clicks);
        var cpm = safeDiv(e.spend, e.impressions) * 1000;
        var cpa = safeDiv(e.spend, e.conversions);
        var roas = safeDiv(e.revenue || 0, e.spend);
        return [
          e.month, PLATFORM_LABELS[e.platform] || e.platform, e.campaign,
          (e.spend || 0).toFixed(2), e.impressions || 0, e.clicks || 0,
          ctr.toFixed(2), cpc.toFixed(2), cpm.toFixed(2),
          e.conversions || 0, cpa.toFixed(2), (e.revenue || 0).toFixed(2), roas.toFixed(2)
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

  // ===== MAIN INIT =====
  document.addEventListener('DOMContentLoaded', function () {
    var loginScreen = document.getElementById('dash-login');
    var app = document.getElementById('dash-app');
    var loginForm = document.getElementById('login-form');
    var loginError = document.getElementById('login-error');
    var passwordInput = document.getElementById('login-password');

    // Check existing session
    var session = getSession();
    if (session) {
      showDashboard();
      return;
    }

    // LOGIN
    loginForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      // Check lockout
      var attempts = getLoginAttempts();
      if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
        var mins = Math.ceil((attempts.lockedUntil - Date.now()) / 60000);
        loginError.textContent = 'Konto zablokowane. Spróbuj za ' + mins + ' min.';
        return;
      }

      var password = passwordInput.value;
      if (!password) return;

      var hash = await hashPassword(password);

      if (hash === PASSWORD_HASH) {
        resetLoginAttempts();
        createSession(hash);
        showDashboard();
      } else {
        var result = recordFailedAttempt();
        passwordInput.value = '';
        if (result.lockedUntil) {
          loginError.textContent = 'Zbyt wiele prób. Konto zablokowane na 15 minut.';
        } else {
          var remaining = MAX_LOGIN_ATTEMPTS - result.count;
          loginError.textContent = 'Nieprawidłowe hasło. Pozostało prób: ' + remaining;
        }
      }
    });

    function showDashboard() {
      loginScreen.style.display = 'none';
      app.style.display = 'block';
      initDashboard();
    }

    function initDashboard() {
      initExport();

      // Logout
      document.getElementById('btn-logout').addEventListener('click', function () {
        destroySession();
        location.reload();
      });

      // Set default filter dates (last 6 months)
      var now = new Date();
      var sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      document.getElementById('filter-from').value = sixMonthsAgo.toISOString().substring(0, 7);
      document.getElementById('filter-to').value = now.toISOString().substring(0, 7);

      // Load cached data first, then fetch fresh
      var cache = getCache();
      if (cache && cache.entries) {
        refreshDashboard(cache.entries);
      }

      // Fetch fresh data
      loadFromAPI();

      // Refresh button
      document.getElementById('btn-refresh-api').addEventListener('click', function () {
        loadFromAPI();
      });

      // Filter button
      document.getElementById('btn-filter').addEventListener('click', function () {
        loadFromAPI();
      });
    }

    async function loadFromAPI() {
      var fromVal = document.getElementById('filter-from').value;
      var toVal = document.getElementById('filter-to').value;

      var params = {};
      if (fromVal) params.from = fromVal + '-01';
      if (toVal) {
        // Set to last day of selected month
        var parts = toVal.split('-');
        var lastDay = new Date(parseInt(parts[0]), parseInt(parts[1]), 0).getDate();
        params.to = toVal + '-' + String(lastDay).padStart(2, '0');
      }

      try {
        var entries = await fetchAllPlatforms(params);
        refreshDashboard(entries);
      } catch (err) {
        // If API fails, show cached data
        var cache = getCache();
        if (cache && cache.entries) {
          refreshDashboard(cache.entries);
        }
      }
    }
  });
})();
