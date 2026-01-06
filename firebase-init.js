import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  runTransaction,
  increment,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyC37VzJ-rhwu8OgadesHqoxXimgmcM_zZ8',
  authDomain: 'go-vis.firebaseapp.com',
  projectId: 'go-vis',
  storageBucket: 'go-vis.firebasestorage.app',
  messagingSenderId: '351693325278',
  appId: '1:351693325278:web:ffd1b76056a4ed2732534f',
  measurementId: 'G-NYMBSY6R27',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const getUserDocRef = (uid) => doc(db, 'users', uid);

function buildProvider(forceChooser = false) {
  const provider = new GoogleAuthProvider();
  // Force Google to show the account chooser each time so users can switch accounts explicitly.
  provider.setCustomParameters({
    prompt: 'select_account',
  });
  return provider;
}

window.goVisAuth = {
  login: async ({ forceChooser = false } = {}) => {
    const provider = buildProvider(forceChooser);
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      // Fallback for popup blockers / COOP issues.
      console.warn('[CLOUD][AUTH] Popup sign-in failed, using redirect', err);
      await signInWithRedirect(auth, provider);
    }
  },
  logout: () => signOut(auth),
  onChange: (cb) => onAuthStateChanged(auth, cb),
};

window.goVisData = {
  loadProgress: async (uid) => {
    const snap = await getDoc(getUserDocRef(uid));
    return snap.exists() ? snap.data() : null;
  },
  saveProgress: async (uid, progress) => {
    await setDoc(
      getUserDocRef(uid),
      {
        ...progress,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  },
};

function requireUser() {
  const user = auth.currentUser;
  if (!user) throw new Error('[CLOUD] No logged in user found.');
  return user;
}

window.goVisDB = {
  saveProgress: async (progressObj) => {
    const user = requireUser();
    const payload = {
      progress: progressObj || {},
      updatedAt: serverTimestamp(),
    };
    console.log('[CLOUD] Saving progress for', user.uid, payload);
    await setDoc(getUserDocRef(user.uid), payload, { merge: true });
  },
  loadProgress: async () => {
    const user = requireUser();
    const snap = await getDoc(getUserDocRef(user.uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    return data?.progress ?? null;
  },
  recordRound: async (skillRating) => {
    const user = requireUser();
    if (!skillRating) {
      console.warn('[CLOUD][STATS] Missing skillRating payload');
      return;
    }

    const docRef = getUserDocRef(user.uid);
    const meta = skillRating.meta || {};
    const timerPhase = skillRating.timerPhase || {};
    const solvePhase = skillRating.solvePhase || {};
    const rewardPhase = skillRating.rewardPhase || {};
    const completed = Boolean(meta.completed);
    const skipped = Boolean(meta.playerSkipped || timerPhase.playerSkipped);
    const speedBonus = Boolean(
      solvePhase.maxSpeedBonus || solvePhase.speedBonusUsed
    );
    const barRatio = Number(timerPhase.barRatioAtHide);
    const timer75Skip =
      (skipped ||
        (typeof rewardPhase.rewardRuleTriggered === 'string' &&
          rewardPhase.rewardRuleTriggered.includes('skip75'))) &&
      barRatio >= 0.75;
    const firstTry =
      completed && rewardPhase.rewardRuleTriggered !== 'retry';
    const isRetry = rewardPhase.rewardRuleTriggered === 'retry';

    const miscUpdates = {};
    const gold = Number(window?.gameState?.gold);
    if (Number.isFinite(gold)) miscUpdates.gold = gold;
    const skill = Number(
      skillRating.ratingResult?.rating ?? skillRating.rating
    );
    if (Number.isFinite(skill)) miscUpdates.skill = skill;

    console.log('[CLOUD][STATS] Recording round for', user.uid, {
      completed,
      skipped,
      firstTry,
      speedBonus,
      timer75Skip,
      isRetry,
      gold: miscUpdates.gold,
      skill: miscUpdates.skill,
    });

    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(docRef);
        const prevStats = snap.exists() ? snap.data()?.stats || {} : {};
        const prevTotals = prevStats.totals || {};
        const prevStreaks = prevStats.streaks || {};
        const totals = {
          attempts: Number(prevTotals.attempts) || 0,
          completed: Number(prevTotals.completed) || 0,
          firstTryWins: Number(prevTotals.firstTryWins) || 0,
          retries: Number(prevTotals.retries) || 0,
          skips: Number(prevTotals.skips) || 0,
          maxSpeedBonusCount: Number(prevTotals.maxSpeedBonusCount) || 0,
          speedBonusUsedCount: Number(prevTotals.speedBonusUsedCount) || 0,
          timer75SkipCount: Number(prevTotals.timer75SkipCount) || 0,
        };

        totals.attempts += 1;
        if (completed) totals.completed += 1;
        if (firstTry) totals.firstTryWins += 1;
        if (isRetry) totals.retries += 1;
        if (skipped) totals.skips += 1;
        if (solvePhase.maxSpeedBonus) totals.maxSpeedBonusCount += 1;
        if (solvePhase.speedBonusUsed) totals.speedBonusUsedCount += 1;
        if (timer75Skip) totals.timer75SkipCount += 1;

        const nextStreaks = {
          winStreak:
            completed && !skipped
              ? (Number(prevStreaks.winStreak) || 0) + 1
              : 0,
          firstTryStreak: firstTry
            ? (Number(prevStreaks.firstTryStreak) || 0) + 1
            : 0,
          speedBonusStreak:
            speedBonus && completed
              ? (Number(prevStreaks.speedBonusStreak) || 0) + 1
              : 0,
          lastResult: skipped ? 'skip' : completed ? 'win' : 'fail',
        };

        transaction.set(
          docRef,
          {
            ...miscUpdates,
            stats: { totals, streaks: nextStreaks },
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });
      console.log('[CLOUD][STATS] Round recorded for', user.uid);
    } catch (err) {
      console.error('[CLOUD][STATS] Failed to record round', err);
    }
  },
};

function getLocalProgress() {
  try {
    const storedPlayer = localStorage.getItem('goVizPlayerProgress');
    if (storedPlayer) {
      const parsed = JSON.parse(storedPlayer);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (err) {
    console.warn('[CLOUD] Failed to read goVizPlayerProgress', err);
  }

  try {
    const stored = localStorage.getItem('goVizProgress');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') {
        if (parsed.progress && typeof parsed.progress === 'object') {
          return parsed.progress;
        }
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[CLOUD] Failed to read goVizProgress', err);
  }

  return {};
}
window.getLocalProgress = getLocalProgress;

function initCloudDebugUI() {
  const container = document.getElementById('cloudDebug');
  if (!container) return;

  const userStatusEl = document.getElementById('cloudUserStatus');
  const saveStatusEl = document.getElementById('cloudSaveStatus');
  const outputEl = document.getElementById('cloudLoadOutput');
  const saveBtn = document.getElementById('cloudSaveBtn');
  const loadBtn = document.getElementById('cloudLoadBtn');
  const clearBtn = document.getElementById('cloudClearBtn');

  const setVisibility = (user) => {
    const isLoggedIn = Boolean(user);
    container.style.display = isLoggedIn ? 'block' : 'none';
    if (userStatusEl) {
      userStatusEl.textContent = isLoggedIn
        ? `Logged in as ${user.email || user.uid}`
        : 'Log in to use cloud save debug';
    }
    if (!isLoggedIn && outputEl) {
      outputEl.textContent = '';
    }
  };

  onAuthStateChanged(auth, (user) => {
    console.log('[CLOUD] Auth state changed', user?.uid);
    setVisibility(user);
  });

  saveBtn?.addEventListener('click', async () => {
    try {
      const localProgress = getLocalProgress();
      console.log('[CLOUD] Save button clicked with local progress', localProgress);
      await window.goVisDB.saveProgress(localProgress);
      const ts = new Date().toISOString();
      if (saveStatusEl) {
        saveStatusEl.textContent = `Last cloud save: ${ts}`;
      }
      console.log('[CLOUD] Saved at', ts);
    } catch (err) {
      console.error('[CLOUD] Save failed', err);
    }
  });

  loadBtn?.addEventListener('click', async () => {
    try {
      const cloudProgress = await window.goVisDB.loadProgress();
      console.log('[CLOUD] Loaded progress from cloud', cloudProgress);
      if (outputEl) {
        outputEl.textContent = cloudProgress
          ? JSON.stringify(cloudProgress, null, 2)
          : 'null';
      }
    } catch (err) {
      console.error('[CLOUD] Load failed', err);
    }
  });

  clearBtn?.addEventListener('click', async () => {
    try {
      console.log('[CLOUD] Clearing progress in cloud');
      await window.goVisDB.saveProgress({});
      if (outputEl) {
        outputEl.textContent = '{}';
      }
    } catch (err) {
      console.error('[CLOUD] Clear failed', err);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCloudDebugUI);
} else {
  initCloudDebugUI();
}
