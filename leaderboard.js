const els = {
  backBtn: document.getElementById('leaderboardBack'),
  tabs: document.querySelectorAll('.leaderboard-tab'),
  filters: document.querySelector('.leaderboard-filters'),
  regionSelect: document.getElementById('leaderboardRegion'),
  body: document.getElementById('leaderboardBody'),
  empty: document.getElementById('leaderboardEmpty'),
  login: document.getElementById('leaderboardLogin'),
  loginBtn: document.getElementById('leaderboardLoginBtn'),
};

const REGION_OPTIONS = ['NZ', 'AU', 'US', 'EU', 'OTHER'];
let currentTab = 'global';
let currentUser = null;

function setTab(tab) {
  currentTab = tab === 'region' ? 'region' : 'global';
  els.tabs.forEach((btn) => {
    const isActive = btn.dataset.tab === currentTab;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  if (els.filters) {
    els.filters.classList.toggle('is-active', currentTab === 'region');
  }
}

function formatProgress(progress) {
  if (!progress?.boardKey || !progress?.stones) return '--';
  return `${progress.boardKey} · ${progress.stones}`;
}

function renderRows(rows) {
  if (!els.body) return;
  els.body.innerHTML = '';
  if (!rows.length) {
    if (els.empty) els.empty.hidden = false;
    return;
  }
  if (els.empty) els.empty.hidden = true;
  rows.forEach((row, index) => {
    const stats = row.stats || {};
    const tr = document.createElement('tr');
    const isYou = currentUser && row.id === currentUser.uid;
    if (isYou) tr.classList.add('leaderboard-row--you');
    const name =
      row.displayName || row.email || row.id || 'Unknown';
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${name}${isYou ? '<span class="leaderboard-you-badge">You</span>' : ''}</td>
      <td>${Number.isFinite(stats.skill) ? Math.round(stats.skill) : '--'}</td>
      <td>${formatProgress(stats.positionProgress)}</td>
      <td>${formatProgress(stats.sequenceProgress)}</td>
      <td>${Number.isFinite(stats.winStreak) ? stats.winStreak : 0}</td>
    `;
    els.body.appendChild(tr);
  });
}

async function loadLeaderboard() {
  if (!currentUser) {
    if (els.login) els.login.hidden = false;
    if (els.empty) els.empty.hidden = true;
    if (els.body) els.body.innerHTML = '';
    return;
  }
  if (els.login) els.login.hidden = true;
  const region =
    currentTab === 'region' ? els.regionSelect?.value || 'OTHER' : null;
  try {
    const rows = await window.goVisData?.loadLeaderboard?.({
      region,
      limitTo: 50,
    });
    renderRows(rows || []);
  } catch (err) {
    console.error('[LEADERBOARD] Failed to load leaderboard', err);
    renderRows([]);
  }
}

function init() {
  els.backBtn?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });
  els.tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      setTab(btn.dataset.tab);
      loadLeaderboard();
    });
  });
  els.regionSelect?.addEventListener('change', () => {
    if (currentTab !== 'region') return;
    loadLeaderboard();
  });
  els.loginBtn?.addEventListener('click', () => {
    window.goVisAuth?.login();
  });

  const waitForAuth = () => {
    if (!window.goVisAuth) {
      setTimeout(waitForAuth, 50);
      return;
    }
    window.goVisAuth.onChange(async (user) => {
      currentUser = user || null;
      if (user) {
        try {
          const data = await window.goVisData?.loadProgress?.(user.uid);
          const region = REGION_OPTIONS.includes(data?.region)
            ? data.region
            : 'OTHER';
          if (els.regionSelect) els.regionSelect.value = region;
        } catch (err) {
          console.warn('[LEADERBOARD] Failed to resolve region', err);
        }
      }
      loadLeaderboard();
    });
  };
  waitForAuth();

  setTab('global');
  loadLeaderboard();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
