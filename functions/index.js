const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const REGION_OPTIONS = ['NZ', 'AU', 'US', 'EU', 'OTHER'];

function parseBoardSize(boardKey) {
  if (!boardKey) return null;
  const size = Number(String(boardKey).split('x')[0]);
  return Number.isFinite(size) ? size : null;
}

function getBestModeProgress(modeProgress = {}) {
  let bestBoardSize = 0;
  let bestBoardKey = null;
  let bestStones = 0;
  let bestCompletedCount = 0;
  Object.entries(modeProgress).forEach(([boardKey, perBoard]) => {
    const size = parseBoardSize(boardKey);
    if (!Number.isFinite(size)) return;
    const stones = Object.keys(perBoard || {})
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n));
    if (!stones.length) return;
    const maxStones = Math.max(...stones);
    const completedCount = Number(perBoard?.[String(maxStones)]) || 0;
    if (size > bestBoardSize) {
      bestBoardSize = size;
      bestBoardKey = boardKey;
      bestStones = maxStones;
      bestCompletedCount = completedCount;
      return;
    }
    if (size === bestBoardSize && maxStones > bestStones) {
      bestBoardKey = boardKey;
      bestStones = maxStones;
      bestCompletedCount = completedCount;
    }
  });
  if (!bestBoardKey) {
    return { boardKey: null, stones: 0, completedCount: 0 };
  }
  return {
    boardKey: bestBoardKey,
    stones: bestStones,
    completedCount: bestCompletedCount,
  };
}

function sumCompletedCounts(modeProgress = {}) {
  let total = 0;
  Object.values(modeProgress || {}).forEach((perBoard) => {
    if (!perBoard || typeof perBoard !== 'object') return;
    Object.values(perBoard).forEach((value) => {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) total += parsed;
    });
  });
  return total;
}

exports.getLeaderboard = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Must be signed in to view leaderboard.'
    );
  }

  const region =
    REGION_OPTIONS.includes(data?.region) ? data.region : null;
  const limit = Number.isFinite(Number(data?.limit))
    ? Math.min(Math.max(Number(data.limit), 1), 200)
    : 50;

  let query = admin.firestore().collection('users');
  if (region) {
    query = query.where('region', '==', region);
  }
  const snap = await query.get();
  const rows = snap.docs.map((docSnap) => {
    const data = docSnap.data() || {};
    const stats = data.stats || {};
    const progress = data.progress || {};
    const positionBest =
      stats.positionBest || getBestModeProgress(progress.position || {});
    const sequenceBest =
      stats.sequenceBest || getBestModeProgress(progress.sequence || {});
    const positionCompletedTotal = Number.isFinite(
      Number(stats.positionCompletedTotal)
    )
      ? Number(stats.positionCompletedTotal)
      : sumCompletedCounts(progress.position || {});
    const sequenceCompletedTotal = Number.isFinite(
      Number(stats.sequenceCompletedTotal)
    )
      ? Number(stats.sequenceCompletedTotal)
      : sumCompletedCounts(progress.sequence || {});
    const skill = Number.isFinite(Number(data.skill))
      ? Number(data.skill)
      : Number(stats.skill) || 0;
    const winStreak = Number.isFinite(Number(stats.winStreak))
      ? Number(stats.winStreak)
      : Number(stats.streaks?.winStreak) || 0;
    const displayName =
      data.displayName ||
      `Player ${String(docSnap.id).slice(0, 6)}`;
    const regionValue =
      REGION_OPTIONS.includes(data.region) ? data.region : 'OTHER';

    return {
      id: docSnap.id,
      displayName,
      region: regionValue,
      stats: {
        skill,
        winStreak,
        positionBest,
        sequenceBest,
        positionCompletedTotal,
        sequenceCompletedTotal,
      },
    };
  });

  rows.sort((a, b) => {
    const aSkill = Number(a.stats?.skill) || 0;
    const bSkill = Number(b.stats?.skill) || 0;
    if (bSkill !== aSkill) return bSkill - aSkill;
    const aTotal =
      (Number(a.stats?.positionCompletedTotal) || 0) +
      (Number(a.stats?.sequenceCompletedTotal) || 0);
    const bTotal =
      (Number(b.stats?.positionCompletedTotal) || 0) +
      (Number(b.stats?.sequenceCompletedTotal) || 0);
    if (bTotal !== aTotal) return bTotal - aTotal;
    const aWin = Number(a.stats?.winStreak) || 0;
    const bWin = Number(b.stats?.winStreak) || 0;
    return bWin - aWin;
  });

  return rows.slice(0, limit);
});

exports.cleanupLeaderboardFields = functions.https.onCall(
  async (data, context) => {
    if (!context.auth?.token?.admin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin access required.'
      );
    }
    const batchSize = 200;
    const collection = admin.firestore().collection('users');
    const snap = await collection.get();
    let batch = admin.firestore().batch();
    let count = 0;
    let processed = 0;
    for (const docSnap of snap.docs) {
      batch.update(docSnap.ref, {
        email: admin.firestore.FieldValue.delete(),
        'stats.positionRank': admin.firestore.FieldValue.delete(),
        'stats.sequenceRank': admin.firestore.FieldValue.delete(),
      });
      count += 1;
      processed += 1;
      if (count >= batchSize) {
        await batch.commit();
        batch = admin.firestore().batch();
        count = 0;
      }
    }
    if (count > 0) {
      await batch.commit();
    }
    return { processed };
  }
);
