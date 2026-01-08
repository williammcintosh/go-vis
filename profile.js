const els = {
  backBtn: document.getElementById('backBtn'),
  identityCard: document.getElementById('identityCard'),
  profileName: document.getElementById('profileName'),
  profileEmail: document.getElementById('profileEmail'),
  profileAvatar: document.getElementById('profileAvatar'),
  profileSkill: document.getElementById('profileSkill'),
  profileGold: document.getElementById('profileGold'),
  streakWin: document.getElementById('streakWin'),
  streakFirstTry: document.getElementById('streakFirstTry'),
  streakSpeed: document.getElementById('streakSpeed'),
  lastResult: document.getElementById('lastResult'),
  progressCardsPosition: document.getElementById('progressCardsPosition'),
  progressCardsSequence: document.getElementById('progressCardsSequence'),
  progressSection: document.getElementById('progressSection'),
  totalsBody: document.getElementById('totalsBody'),
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

function getBoardMaxStone(perStones) {
  const entries = Object.entries(perStones || {});
  if (!entries.length) return null;
  const numericKeys = entries
    .map(([stone]) => Number(stone))
    .filter((n) => Number.isFinite(n));
  if (!numericKeys.length) return null;
  return Math.max(...numericKeys);
}

function renderProgressBoards(boards, container) {
  if (!container) return;
  container.innerHTML = '';
  const targets = ['5x5', '6x6', '7x7'];
  targets.forEach((boardKey) => {
    const card = document.createElement('div');
    card.className = 'progress-card';
    const header = document.createElement('div');
    header.className = 'progress-card__header';
    const title = document.createElement('h3');
    title.className = 'progress-card__title';
    title.textContent = boardKey;
    header.appendChild(title);
    card.appendChild(header);

    const valueEl = document.createElement('div');
    valueEl.className = 'progress-card__value';
    const maxStone = getBoardMaxStone(boards?.[boardKey]);
    if (maxStone) {
      valueEl.textContent = `${maxStone} stones`;
    } else {
      valueEl.textContent = 'Locked';
      valueEl.style.opacity = '0.6';
    }

    card.appendChild(valueEl);
    container.appendChild(card);
  });
}

function renderProgress(progress) {
  if (!els.progressCardsPosition || !els.progressCardsSequence) return;
  renderProgressBoards(progress?.position || {}, els.progressCardsPosition);
  renderProgressBoards(progress?.sequence || {}, els.progressCardsSequence);
  els.progressSection.style.display = '';
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
  const progress = data?.progress || (window.getLocalProgress?.() || {});
  setIdentity(user, data);
  setStreaks(data?.stats?.streaks || {});
  setTotals(data?.stats?.totals || {});
  renderProgress(progress);
}

function init() {
  document.documentElement.classList.remove('no-scroll');
  document.body.classList.remove('no-scroll');
  document.body.classList.add('allow-scroll');

  els.backBtn?.addEventListener('click', () => {
    window.location.href = 'index.html';
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
