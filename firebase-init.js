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
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  where,
  limit,
  setDoc,
  serverTimestamp,
  runTransaction,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { mergeProfiles } from './profileMerge.js';

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
const REGION_OPTIONS = ['NZ', 'AU', 'US', 'EU', 'OTHER'];

window.__dumpUserDoc = async () => {
  if (!auth.currentUser) {
    console.warn('No user logged in');
    return;
  }
  const snap = await getDoc(getUserDocRef(auth.currentUser.uid));
  console.log(JSON.stringify(snap.data(), null, 2));
};

function getDefaultRegion() {
  const lang = (navigator.language || '').toLowerCase();
  if (lang.startsWith('en-nz')) return 'NZ';
  return 'OTHER';
}

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
    try {
      const derived = await deriveLeaderboardFields({
        uid,
        authUser: auth.currentUser,
        progressOverride: progress?.progress || progress,
      });
      await setDoc(
        getUserDocRef(uid),
        {
          ...progress,
          ...derived,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error('[CLOUD] Failed to save progress', err);
    }
  },
  updateUser: async (uid, payload) => {
    if (!uid) return;
    try {
      const derived = await deriveLeaderboardFields({
        uid,
        authUser: auth.currentUser,
        progressOverride: payload?.progress,
      });
      await setDoc(
        getUserDocRef(uid),
        {
          ...payload,
          ...derived,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error('[CLOUD] Failed to update user', err);
    }
  },
  loadLeaderboard: async ({ region = null, limitTo = 50 } = {}) => {
    const base = collection(db, 'users');
    const constraints = [];
    if (region) {
      constraints.push(where('region', '==', region));
    }
    constraints.push(orderBy('stats.skill', 'desc'));
    constraints.push(orderBy('stats.positionRank', 'desc'));
    constraints.push(orderBy('stats.sequenceRank', 'desc'));
    constraints.push(orderBy('stats.winStreak', 'desc'));
    constraints.push(limit(limitTo));
    // Composite index needed:
    // Collection: users, Fields: region Asc, stats.skill Desc, stats.positionRank Desc,
    // stats.sequenceRank Desc, stats.winStreak Desc.
    const leaderboardQuery = query(base, ...constraints);
    try {
      const snap = await getDocs(leaderboardQuery);
      return snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
    } catch (err) {
      console.error('[LEADERBOARD] Query failed', err);
      throw err;
    }
  },
};

function requireUser() {
  const user = auth.currentUser;
  if (!user) throw new Error('[CLOUD] No logged in user found.');
  return user;
}

function toMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value.seconds) {
    return value.seconds * 1000 + Math.round((value.nanoseconds || 0) / 1e6);
  }
  return null;
}

function readLocalSnapshot() {
  try {
    const raw = localStorage.getItem('goVizProgress');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        progress: parsed.progress || {},
        gold: Number(parsed.gold),
        updatedAt: parsed.updatedAt || null,
      };
    }
  } catch (err) {
    console.warn('[CLOUD] Failed to read local snapshot', err);
  }
  return null;
}

function applyLocalSnapshot(snapshot) {
  if (!snapshot) return;
  const goldValue = Number(snapshot.gold);
  const payload = {
    progress: snapshot.progress || {},
    gold: Number.isFinite(goldValue) ? goldValue : 0,
    updatedAt: snapshot.updatedAt || Date.now(),
  };

  try {
    localStorage.setItem('goVizProgress', JSON.stringify(payload));
  } catch (err) {
    console.warn('[CLOUD] Failed to write local snapshot', err);
  }

  if (typeof window.normalizeProgress === 'function') {
    window.progress = window.normalizeProgress(payload.progress);
  } else if (payload.progress && typeof payload.progress === 'object') {
    window.progress = payload.progress;
  }

  if (window.gameState && Number.isFinite(goldValue)) {
    window.gameState.gold = goldValue;
    const goldEl = document.getElementById('goldValue');
    if (goldEl) goldEl.textContent = goldValue;
  }

  window.refreshHomeButtons?.();
}

function buildCloudPayload(snapshot) {
  const base =
    snapshot && typeof snapshot === 'object'
      ? snapshot
      : { progress: snapshot || {} };
  const goldValue =
    Number.isFinite(base.gold) && base.gold >= 0
      ? base.gold
      : Number(window?.gameState?.gold);
  const payload = {
    progress: base.progress || {},
    updatedAt: serverTimestamp(),
  };
  if (Number.isFinite(goldValue)) payload.gold = goldValue;
  return payload;
}

function parseBoardSize(boardKey) {
  if (!boardKey) return null;
  const size = Number(String(boardKey).split('x')[0]);
  return Number.isFinite(size) ? size : null;
}

function getMaxStoneCount(perBoard = {}) {
  const stones = Object.keys(perBoard)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n));
  if (!stones.length) return null;
  return Math.max(...stones);
}

function getBestModeProgress(modeProgress = {}) {
  let bestBoardSize = 0;
  let bestBoardKey = null;
  let bestStones = 0;
  Object.entries(modeProgress).forEach(([boardKey, perBoard]) => {
    const size = parseBoardSize(boardKey);
    if (!Number.isFinite(size)) return;
    const maxStones = getMaxStoneCount(perBoard);
    if (!Number.isFinite(maxStones)) return;
    if (size > bestBoardSize) {
      bestBoardSize = size;
      bestBoardKey = boardKey;
      bestStones = maxStones;
      return;
    }
    if (size === bestBoardSize && maxStones > bestStones) {
      bestBoardKey = boardKey;
      bestStones = maxStones;
    }
  });
  if (!bestBoardKey) {
    return { boardKey: null, stones: 0, rank: 0 };
  }
  return {
    boardKey: bestBoardKey,
    stones: bestStones,
    rank: bestBoardSize * 100 + bestStones,
  };
}

function getLocalPlayerProgress() {
  try {
    const raw = localStorage.getItem('goVizPlayerProgress');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (err) {
    console.warn('[CLOUD] Failed to read goVizPlayerProgress', err);
  }
  return { position: {}, sequence: {} };
}

function getLocalSkillSnapshot() {
  const values = [
    Number(localStorage.getItem('skill_rating')),
    Number(localStorage.getItem('skill_rating_sequence')),
  ].filter((n) => Number.isFinite(n));
  if (!values.length) return null;
  return Math.max(...values);
}

function hasBoardProgress(progress) {
  if (!progress || typeof progress !== 'object') return false;
  const buckets = [progress.position, progress.sequence].filter(Boolean);
  return buckets.some((bucket) =>
    Object.keys(bucket || {}).some((key) => /\d+x\d+/.test(key))
  );
}

function resolveProgressSnapshot(progressOverride, existingDoc) {
  if (hasBoardProgress(progressOverride)) return progressOverride;
  if (hasBoardProgress(existingDoc?.progress)) return existingDoc.progress;
  return getLocalPlayerProgress();
}

function buildDerivedProgressStats(progressSnapshot) {
  const progress = progressSnapshot || getLocalPlayerProgress();
  const position = getBestModeProgress(progress?.position || {});
  const sequence = getBestModeProgress(progress?.sequence || {});
  return {
    positionProgress: { boardKey: position.boardKey, stones: position.stones },
    sequenceProgress: { boardKey: sequence.boardKey, stones: sequence.stones },
    positionRank: position.rank,
    sequenceRank: sequence.rank,
  };
}

async function deriveLeaderboardFields({ uid, authUser, progressOverride }) {
  if (!uid) return {};
  let existing = {};
  try {
    const snap = await getDoc(getUserDocRef(uid));
    existing = snap.exists() ? snap.data() || {} : {};
  } catch (err) {
    console.warn('[CLOUD] Failed to read user doc for leaderboard stats', err);
  }

  const progressSnapshot = resolveProgressSnapshot(progressOverride, existing);
  const derived = buildDerivedProgressStats(progressSnapshot);
  const skillValue = Number.isFinite(Number(existing.skill))
    ? Number(existing.skill)
    : Number.isFinite(Number(localStorage.getItem('skill_rating')))
    ? Number(localStorage.getItem('skill_rating'))
    : 0;
  const prevStats = existing.stats || {};
  const prevStreaks = prevStats.streaks || {};
  const prevTotals = prevStats.totals || {};
  const region = REGION_OPTIONS.includes(existing.region)
    ? existing.region
    : getDefaultRegion();

  return {
    email: authUser?.email || existing.email || '',
    displayName: authUser?.displayName || existing.displayName || '',
    region,
    stats: {
      ...prevStats,
      skill: skillValue,
      winStreak: Number(prevStreaks.winStreak) || 0,
      firstTryStreak: Number(prevStreaks.firstTryStreak) || 0,
      attempts: Number(prevTotals.attempts) || 0,
      positionProgress: derived.positionProgress,
      sequenceProgress: derived.sequenceProgress,
      positionRank: Number(derived.positionRank) || 0,
      sequenceRank: Number(derived.sequenceRank) || 0,
    },
  };
}

window.goVisDB = {
  saveProgress: async (progressObj) => {
    const user = requireUser();
    const payload = buildCloudPayload(progressObj);
    try {
      const derived = await deriveLeaderboardFields({
        uid: user.uid,
        authUser: user,
        progressOverride: payload.progress,
      });
      console.log('[CLOUD] Saving progress for', user.uid, payload);
      await setDoc(
        getUserDocRef(user.uid),
        {
          ...payload,
          ...derived,
        },
        { merge: true }
      );
    } catch (err) {
      console.error('[CLOUD] Failed to save progress', err);
    }
  },
  resetProfile: async () => {
    const user = requireUser();
    const docRef = getUserDocRef(user.uid);
    const payload = {
      progress: {},
      gold: 0,
      skill: 0,
      stats: { totals: {}, streaks: {} },
      updatedAt: serverTimestamp(),
    };
    console.log('[CLOUD] Resetting profile for', user.uid);
    await setDoc(docRef, payload, { merge: false });
  },
  loadProgress: async () => {
    const user = requireUser();
    const snap = await getDoc(getUserDocRef(user.uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      progress: data?.progress || {},
      gold: Number(data?.gold),
      updatedAt: data?.updatedAt || null,
    };
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
    const firstTry = completed && rewardPhase.rewardRuleTriggered !== 'retry';
    const isRetry = rewardPhase.rewardRuleTriggered === 'retry';

    const miscUpdates = {};
    const gold = Number(window?.gameState?.gold);
    if (Number.isFinite(gold)) miscUpdates.gold = gold;
    const skill = Number(
      skillRating.ratingResult?.rating ?? skillRating.rating
    );
    if (Number.isFinite(skill)) miscUpdates.skill = skill;

    const progressStats = buildDerivedProgressStats();
    const localSkillSnapshot = getLocalSkillSnapshot();

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
        const skillValue = Number.isFinite(miscUpdates.skill)
          ? miscUpdates.skill
          : Number.isFinite(localSkillSnapshot)
          ? localSkillSnapshot
          : Number(prevStats.skill) || 0;
        const positionRank = Number(progressStats.positionRank) || 0;
        const sequenceRank = Number(progressStats.sequenceRank) || 0;
        const statsPayload = {
          totals,
          streaks: nextStreaks,
          skill: skillValue,
          winStreak: nextStreaks.winStreak,
          firstTryStreak: nextStreaks.firstTryStreak,
          attempts: totals.attempts,
          positionProgress: progressStats.positionProgress,
          sequenceProgress: progressStats.sequenceProgress,
          positionRank,
          sequenceRank,
        };

        transaction.set(
          docRef,
          {
            ...miscUpdates,
            stats: statsPayload,
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

const CLOUD_SAVE_DEBOUNCE_MS = 800;
let cloudSaveTimer = null;

async function saveSnapshotToCloud(snapshot) {
  if (!auth.currentUser || !window.goVisDB?.saveProgress) return;
  const payload = snapshot || readLocalSnapshot();
  if (!payload) return;
  try {
    await window.goVisDB.saveProgress(payload);
    console.log('[CLOUD] Auto-saved progress to cloud');
  } catch (err) {
    console.error('[CLOUD] Auto-save failed', err);
  }
}

function queueCloudSave(snapshot) {
  if (!auth.currentUser) return;
  if (cloudSaveTimer) clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => {
    cloudSaveTimer = null;
    saveSnapshotToCloud(snapshot);
  }, CLOUD_SAVE_DEBOUNCE_MS);
}

const STATS_SYNC_DEBOUNCE_MS = 1200;
let statsSyncTimer = null;

async function syncDerivedStatsToCloud() {
  if (!auth.currentUser) return;
  try {
    const derived = await deriveLeaderboardFields({
      uid: auth.currentUser.uid,
      authUser: auth.currentUser,
      progressOverride: getLocalPlayerProgress(),
    });
    await setDoc(
      getUserDocRef(auth.currentUser.uid),
      {
        ...derived,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.error('[CLOUD] Failed to sync derived stats', err);
  }
}

function queueStatsSync() {
  if (!auth.currentUser) return;
  if (statsSyncTimer) clearTimeout(statsSyncTimer);
  statsSyncTimer = setTimeout(() => {
    statsSyncTimer = null;
    syncDerivedStatsToCloud();
  }, STATS_SYNC_DEBOUNCE_MS);
}

async function syncCloudAndLocal(user) {
  if (!user) return;
  let cloud = null;
  try {
    cloud = await window.goVisDB.loadProgress();
  } catch (err) {
    console.error('[CLOUD] Failed to load cloud progress', err);
  }
  const local = readLocalSnapshot();
  const { mergedProfile, decisions } = mergeProfiles(local || {}, cloud || {});
  console.log('[CLOUD] merge decisions', decisions);
  applyLocalSnapshot(mergedProfile);
  queueCloudSave(mergedProfile);
}

async function ensureUserProfile(user) {
  if (!user) return;
  try {
    const derived = await deriveLeaderboardFields({
      uid: user.uid,
      authUser: user,
    });
    await setDoc(
      getUserDocRef(user.uid),
      {
        ...derived,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('[CLOUD] Failed to ensure user profile', err);
  }
}

function attachCloudSaveHook(attempt = 0) {
  if (attachCloudSaveHook.attached) return;
  if (typeof window.persistProgress !== 'function') {
    if (attempt > 20) return;
    setTimeout(() => attachCloudSaveHook(attempt + 1), 200);
    return;
  }

  attachCloudSaveHook.attached = true;
  const originalPersist = window.persistProgress;
  window.persistProgress = (...args) => {
    const result = originalPersist.apply(window, args);
    queueCloudSave();
    queueStatsSync();
    return result;
  };
}

function initCloudSync() {
  onAuthStateChanged(auth, async (user) => {
    console.log('[CLOUD] Auth state changed', user?.uid);
    if (!user) return;
    attachCloudSaveHook();
    await ensureUserProfile(user);
    await syncCloudAndLocal(user);
    queueStatsSync();
  });
}

initCloudSync();
attachCloudSaveHook();
