const els = {
  backBtn: document.getElementById('backBtn'),
  identityCard: document.getElementById('identityCard'),
  profileName: document.getElementById('profileName'),
  profileEmail: document.getElementById('profileEmail'),
  profileAvatar: document.getElementById('profileAvatar'),
  profileSkill: document.getElementById('profileSkill'),
  profileGold: document.getElementById('profileGold'),
  profileTime: document.getElementById('profileTime'),
  streakWin: document.getElementById('streakWin'),
  streakFirstTry: document.getElementById('streakFirstTry'),
  streakSpeed: document.getElementById('streakSpeed'),
  lastResult: document.getElementById('lastResult'),
  progressCards: document.getElementById('progressCards'),
  progressSection: document.getElementById('progressSection'),
  totalsToggle: document.getElementById('totalsToggle'),
  totalsBody: document.getElementById('totalsBody'),
  totalsChevron: document.getElementById('totalsChevron'),
  totals: {
    attempts: document.getElementById('totalAttempts'),
    completed: document.getElementById('totalCompleted'),
    firstTryWins: document.getElementById('totalFirstTryWins'),
    retries: document.getElementById('totalRetries'),
    skips: document.getElementById('totalSkips'),
    maxSpeedBonusCount: document.getElementById('totalMaxSpeedBonus'),
    speedBonusUsedCount: document.getElementById('totalSpeedBonusUsed'),
    timer75SkipCount: document.getElementById('totalTimer75'),
  },
  loginBtn: document.getElementById('loginBtn'),
  profileEmpty: document.getElementById('profileEmpty'),
  content: document.getElementById('profileContent'),
};

const FALLBACK_AVATAR = './images/not-logged-in-avatar.png';

function setIdentity(user, data) {
  const name =
    user?.displayName || data?.displayName || user?.email || 'Player';
  const email = user?.email || '';
  if (els.profileName) els.profileName.textContent = name;
  if (els.profileEmail) els.profileEmail.textContent = email;
  const avatarSrc = user?.photoURL || FALLBACK_AVATAR;
  if (els.profileAvatar) {
    els.profileAvatar.src = avatarSrc;
    els.profileAvatar.alt = name ? `${name} avatar` : 'Profile avatar';
  }
  if (els.profileSkill) {
    const skillValue = Number(data?.skill);
    els.profileSkill.textContent = Number.isFinite(skillValue)
      ? Math.round(skillValue)
      : '--';
  }
  if (els.profileGold) {
    const goldValue = Number(data?.gold);
    els.profileGold.textContent = Number.isFinite(goldValue)
      ? goldValue
      : '--';
  }
}

function setStreaks(streaks) {
  const { streakWin, streakFirstTry, streakSpeed, lastResult } = els;
  const win = Number(streaks?.winStreak) || 0;
  const firstTry = Number(streaks?.firstTryStreak) || 0;
  const speed = Number(streaks?.speedBonusStreak) || 0;
  if (streakWin) streakWin.textContent = win;
  if (streakFirstTry) streakFirstTry.textContent = firstTry;
  if (streakSpeed) streakSpeed.textContent = speed;
  if (lastResult) {
    const label =
      streaks?.lastResult === 'win'
        ? 'Last: Win'
        : streaks?.lastResult === 'fail'
        ? 'Last: Fail'
        : streaks?.lastResult === 'skip'
        ? 'Last: Skip'
        : '';
    lastResult.textContent = label;
    lastResult.style.display = label ? 'inline-flex' : 'none';
  }
}

function setTotals(totals) {
  Object.entries(els.totals).forEach(([key, el]) => {
    if (!el) return;
    const value = Number(totals?.[key]) || 0;
    el.textContent = value;
  });
}

function createProgressSegment(stoneCount, value) {
  const segment = document.createElement('div');
  segment.className = 'progress-segment';
  if (Number(value) > 0) segment.classList.add('is-filled');
  const label = document.createElement('div');
  label.className = 'progress-segment__label';
  label.textContent = `${stoneCount} stones`;
  const val = document.createElement('div');
  val.className = 'progress-segment__value';
  val.textContent = Number(value) || 0;
  segment.appendChild(label);
  segment.appendChild(val);
  return segment;
}

function renderProgress(progress) {
  if (!els.progressCards) return;
  els.progressCards.innerHTML = '';
  const boards = progress?.position || {};
  const entries = Object.entries(boards);
  if (!entries.length) {
    els.progressSection.style.display = 'none';
    return;
  }
  els.progressSection.style.display = '';
  entries.forEach(([boardKey, perStones]) => {
    const card = document.createElement('div');
    card.className = 'progress-card';
    const header = document.createElement('div');
    header.className = 'progress-card__header';
    const title = document.createElement('h3');
    title.className = 'progress-card__title';
    title.textContent = boardKey;
    header.appendChild(title);
    card.appendChild(header);

    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    const stoneEntries = Object.entries(perStones || {}).sort(
      ([aKey], [bKey]) => Number(aKey) - Number(bKey)
    );
    stoneEntries.forEach(([stone, value]) => {
      bar.appendChild(createProgressSegment(stone, value));
    });
    card.appendChild(bar);
    els.progressCards.appendChild(card);
  });
}

async function loadProfile(user) {
  if (!window.goVisData?.loadProgress) return null;
  try {
    const data = await window.goVisData.loadProgress(user.uid);
    return data || {};
  } catch (err) {
    console.error('[PROFILE] Failed to load profile data', err);
    return {};
  }
}

function showLoggedOut() {
  if (els.profileEmpty) els.profileEmpty.hidden = false;
  if (els.content) els.content.classList.add('is-logged-out');
}

function hideLoggedOut() {
  if (els.profileEmpty) els.profileEmpty.hidden = true;
  if (els.content) els.content.classList.remove('is-logged-out');
}

async function renderProfile(user) {
  if (!user) {
    showLoggedOut();
    return;
  }
  hideLoggedOut();
  const data = await loadProfile(user);
  setIdentity(user, data);
  setStreaks(data?.stats?.streaks || {});
  setTotals(data?.stats?.totals || {});
  renderProgress(data?.progress || {});
}

function init() {
  els.backBtn?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  els.totalsToggle?.addEventListener('click', () => {
    const isHidden = els.totalsBody?.hasAttribute('hidden');
    if (els.totalsBody) {
      if (isHidden) {
        els.totalsBody.removeAttribute('hidden');
        els.totalsChevron.textContent = '▲';
      } else {
        els.totalsBody.setAttribute('hidden', 'true');
        els.totalsChevron.textContent = '▼';
      }
    }
  });

  els.loginBtn?.addEventListener('click', () => {
    window.goVisAuth?.login();
  });

  const waitForAuth = () => {
    if (!window.goVisAuth) {
      setTimeout(waitForAuth, 50);
      return;
    }
    window.goVisAuth.onChange((user) => {
      renderProfile(user);
    });
  };
  waitForAuth();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
