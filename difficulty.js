import { clearGoldRewardText, setGoldRewardBlocked } from './gold.js';

const RATING_KEY = 'skill_rating';
const SKILL_PROGRESS_KEY = 'skill_progress';
const DEFAULT_RATING = 0;
const DEFAULT_LEVEL = 1;
const MIN_RATING = 0;
const MAX_RATING = 2500;
const MIN_STONES = 5;
const SKILL_DEBUG_KEY = 'skill_rating_debug';

let activeRatingStack = null;
let pendingRatingLines = [];
let pendingRatingTarget = null;
let skillRewardsBlocked = false;

const LEVEL_THRESHOLDS = [
  { level: 2, rating: 504 },
  { level: 3, rating: 540 },
  { level: 4, rating: 560 },
  { level: 5, rating: 580 },
  { level: 6, rating: 600 },
  { level: 7, rating: 620 },
  { level: 8, rating: 640 },
  { level: 9, rating: 660 },
];

function clampRating(value) {
  return Math.min(MAX_RATING, Math.max(MIN_RATING, value));
}

function calculateExpectedTime(stoneCount, boardSize) {
  return 1 + stoneCount * 0.45 + boardSize * boardSize * 0.03;
}

function normalizeLatest(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value).filter(([k]) => !isNaN(Number(k)));
    if (entries.length) {
      const latest = entries.sort((a, b) => Number(a[0]) - Number(b[0])).pop();
      return latest ? latest[1] : null;
    }
    return null;
  }
  return value ?? null;
}

function loadSkillDebugState() {
  let parsed = null;
  try {
    parsed = JSON.parse(localStorage.getItem(SKILL_DEBUG_KEY) || 'null');
  } catch (_err) {
    parsed = null;
  }
  const level = Number.isFinite(parsed?.level) ? parsed.level : 1;
  return {
    allowRatingChange: parsed?.allowRatingChange ?? false,
    gameplayLevel: level,
    completed: Boolean(normalizeLatest(parsed?.completed)),
    usedSpeedBoost: Boolean(normalizeLatest(parsed?.usedSpeedBoost)),
    maxSpeedBonusAchieved: Boolean(
      normalizeLatest(parsed?.maxSpeedBonusAchieved)
    ),
    actualSeconds: Number(normalizeLatest(parsed?.actualSeconds)),
    expectedTime: parsed?.expectedTime ?? null,
    delta: parsed?.delta ?? null,
    currentRating: parsed?.currentRating ?? null,
    recordedAt: parsed?.recordedAt ?? null,
    level,
  };
}

function renderSkillRating(targetEl, rating, fallbackRating) {
  if (!targetEl) return 0;
  const incoming = Number(rating);
  const fallback = Number(fallbackRating);
  const value = Number.isFinite(incoming)
    ? incoming
    : Number.isFinite(fallback)
    ? fallback
    : 0;
  const displayValue = Number.isFinite(value) ? Math.round(value) : '--';
  targetEl.textContent = `${displayValue}`;
  return value;
}

function logSkillRatingDebug(data) {
  console.log('[SkillRating]', JSON.stringify(data, null, 2));
}

function showRatingGain(amount, targetEl = null, options = {}) {
  const { forceRender = false, initialLines = [] } = options;
  const target = targetEl || document.body;
  const skillBadge = document.getElementById('skillBadge');
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const badgeRect = skillBadge?.getBoundingClientRect();
  const relX = badgeRect
    ? badgeRect.left + badgeRect.width / 2 - 20
    : rect.left + rect.width / 2 - 20;
  const relY =
    badgeRect + 10 ? badgeRect.bottom + 10 : rect.top + rect.height * 0.8;
  const float = document.createElement('div');
  float.className = 'rating-float rating-float-stack';
  float.style.opacity = '1';
  float.style.fontSize = 'clamp(0.5rem, 0.8rem, 1.35rem)';
  float.style.left = `${relX}px`;
  float.style.top = `${relY}px`;
  float.style.right = 'auto';
  float.style.transform = 'translateX(-50%)';
  const addLine = (text) => {
    if (skillRewardsBlocked && !forceRender) {
      pendingRatingLines.push(text);
      return;
    }
    const line = document.createElement('div');
    line.textContent = text;
    float.appendChild(line);
  };

  if (skillRewardsBlocked && !forceRender) {
    pendingRatingTarget = target;
    pendingRatingLines.push(...initialLines);
    return { addLine, container: null };
  }

  document.body.appendChild(float);
  const stack = { container: float, addLine };
  clearSkillRewardText();
  activeRatingStack = stack;
  initialLines.forEach((text) => addLine(text));
  return stack;
}

function clearSkillRewardText() {
  if (activeRatingStack?.container?.remove) {
    activeRatingStack.container.remove();
  }
  activeRatingStack = null;
  pendingRatingLines = [];
  pendingRatingTarget = null;
}

function stopAndRemoveFloats(selector) {
  document.querySelectorAll(selector).forEach((el) => {
    if (typeof el.getAnimations === 'function') {
      el.getAnimations().forEach((anim) => {
        try {
          anim.finish();
        } catch (_err) {
          if (typeof anim.cancel === 'function') anim.cancel();
        }
      });
    }
    el.remove();
  });
}

function cleanupFloatingRewards() {
  clearGoldRewardText();
  clearSkillRewardText();
  stopAndRemoveFloats('.gold-float');
  stopAndRemoveFloats('.rating-float');
}

function setSkillRewardBlocked(blocked) {
  skillRewardsBlocked = blocked;
  if (blocked) {
    if (activeRatingStack?.container) {
      activeRatingStack.container.style.visibility = 'hidden';
    }
    return;
  }

  if (activeRatingStack?.container) {
    activeRatingStack.container.style.visibility = '';
  }

  if (pendingRatingLines.length) {
    const target =
      pendingRatingTarget ||
      document.getElementById('skillBadge') ||
      document.body;
    const linesToShow = [...pendingRatingLines];
    pendingRatingLines = [];
    pendingRatingTarget = null;
    showRatingGain(0, target, { forceRender: true, initialLines: linesToShow });
  }
}

function writeSkillDebug(snapshot, level) {
  const state = loadSkillDebugState();
  const targetLevel = Number(level) || state.level || 1;
  state.level = targetLevel;
  state.allowRatingChange = snapshot.allowRatingChange;
  state.gameplayLevel = snapshot.gameplayLevel;
  state.expectedTime = snapshot.expectedTime;
  state.delta = snapshot.delta;
  state.currentRating = snapshot.currentRating;
  state.stoneCount = snapshot.stoneCount;
  state.boardSize = snapshot.boardSize;
  state.completed = snapshot.completed;
  state.usedSpeedBoost = snapshot.usedSpeedBoost;
  state.maxSpeedBonusAchieved = snapshot.maxSpeedBonusAchieved;
  state.actualSeconds = snapshot.actualSeconds;
  state.recordedAt = Date.now();
  try {
    localStorage.setItem(SKILL_DEBUG_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Failed to write skill debug info', err);
  }
}

function calculateLevelDiff(stoneCount, boardSize) {
  return stoneCount * boardSize;
}

function loadDifficultyState() {
  const savedRatingRaw = localStorage.getItem(RATING_KEY);
  let savedRating = Number(savedRatingRaw);
  // Migrate legacy default rating (1000) to new baseline 0
  if (savedRatingRaw === '1000') {
    savedRating = DEFAULT_RATING;
    localStorage.setItem(RATING_KEY, String(DEFAULT_RATING));
  }
  const storedLevel = localStorage.getItem(SKILL_PROGRESS_KEY);
  let legacyLevel = null;
  if (!storedLevel) {
    const legacyKey = Object.keys(localStorage).find((key) => {
      const lower = key.toLowerCase();
      return (
        (lower.includes('skill') && lower.includes('tier')) ||
        (lower.includes('skill') && lower.includes('level')) ||
        (lower.includes('player') && lower.includes('level'))
      );
    });
    if (legacyKey) {
      legacyLevel = localStorage.getItem(legacyKey);
    }
  }
  const savedLevelRaw = storedLevel ?? legacyLevel;
  const savedLevel = Number(savedLevelRaw);
  const rating = clampRating(
    Number.isFinite(savedRating) ? savedRating : DEFAULT_RATING
  );
  const level = Math.max(
    DEFAULT_LEVEL,
    Number.isFinite(savedLevel) ? savedLevel : DEFAULT_LEVEL
  );
  return { rating, level };
}

function saveDifficultyState({ rating, level }) {
  const nextRating = clampRating(
    Number.isFinite(rating) ? rating : DEFAULT_RATING
  );
  const nextLevel = Math.max(DEFAULT_LEVEL, Number(level) || DEFAULT_LEVEL);
  localStorage.setItem(RATING_KEY, String(nextRating));
  localStorage.setItem(SKILL_PROGRESS_KEY, String(nextLevel));
  return { rating: nextRating, level: nextLevel };
}

function getBoardSizeForLevel(level) {
  if (level >= 8) return 7;
  if (level >= 5) return 6;
  return 5;
}

function computeRatingResult({
  stoneCount,
  boardSize,
  actualTime,
  timedOut = false,
  completed = false,
  playerSkipped = false,
  usedSpeedBoost = false,
  maxSpeedBonusAchieved = false,
  usedAssistBonus = false,
  currentRating = DEFAULT_RATING,
  initialRemainingRatio = 0,
  speedBonusUsed = false,
}) {
  const expectedTime = calculateExpectedTime(stoneCount, boardSize);
  const ratio = Number.isFinite(initialRemainingRatio)
    ? Math.max(0, Math.min(1, initialRemainingRatio))
    : 0;
  let delta = 0;
  let rewardRuleTriggered = 'notCompleted';
  if (playerSkipped) {
    if (usedAssistBonus) {
      delta = 1;
      rewardRuleTriggered = 'assistUsed';
    } else if (ratio > 0.75 && maxSpeedBonusAchieved) {
      delta = 4;
      rewardRuleTriggered = 'skip75plusMaxSpeed';
    } else if (ratio > 0.75) {
      delta = 3;
      rewardRuleTriggered = 'skip75plusSpeed';
    } else if (ratio > 0.5) {
      delta = 2;
      rewardRuleTriggered = 'skip50plus';
    } else {
      delta = 1;
      rewardRuleTriggered = 'skipCompleted';
    }
  } else if (completed) {
    delta = 1;
    rewardRuleTriggered = 'completed';
  }
  const nextRating = clampRating(currentRating + delta);

  return {
    currentRating,
    nextRating,
    expectedTime,
    performance: delta, // linear model; matches delta for compatibility
    delta,
    rewardRuleTriggered,
    timedOut,
    usedSpeedBoost,
    maxSpeedBonusAchieved,
    completed,
    playerSkipped,
    remainingRatio: ratio,
  };
}

function triggerLevelOverlay(level) {
  const existing = document.querySelector('.level-up-overlay');
  if (existing) existing.remove();
  const nextBtn = document.getElementById('nextBtn');
  if (nextBtn) {
    nextBtn.disabled = false;
    nextBtn.classList.remove('next-disabled-by-levelup');
  }
  setGoldRewardBlocked(false);
  setSkillRewardBlocked(false);
  // Legacy overlay intentionally disabled; unlock messaging handled elsewhere.
}

function incrementLevelIfNeeded(rating) {
  const state = loadDifficultyState();
  const currentRating = Number.isFinite(rating) ? rating : state.rating;
  const currentLevel = state.level || DEFAULT_LEVEL;
  let nextLevel = currentLevel;

  LEVEL_THRESHOLDS.forEach((entry) => {
    if (currentRating >= entry.rating) {
      nextLevel = Math.max(nextLevel, entry.level);
    }
  });

  const leveledUp = nextLevel > currentLevel;
  if (leveledUp) {
    saveDifficultyState({ rating: currentRating, level: nextLevel });
    triggerLevelOverlay(nextLevel);
  }

  return { level: nextLevel, leveledUp };
}

function normalizePuzzle(puzzle, fallbackBoardSize, fallbackStones) {
  if (!puzzle) {
    return null;
  }
  const stoneCount = Math.max(
    MIN_STONES,
    Number(puzzle.stoneCount ?? puzzle.stones) ||
      Number(fallbackStones) ||
      MIN_STONES
  );
  const boardSize =
    Number(puzzle.boardSize ?? puzzle.size) ||
    Number(fallbackBoardSize) ||
    getBoardSizeForLevel(DEFAULT_LEVEL);
  return {
    stoneCount,
    boardSize,
    levelDiff: calculateLevelDiff(stoneCount, boardSize),
  };
}

function pickNextPuzzle({
  puzzles = [],
  targetLevelDiff,
  level,
  currentStoneCount,
  currentBoardSize,
}) {
  const resolvedLevel = Number(level) || loadDifficultyState().level;
  const boardSize = getBoardSizeForLevel(resolvedLevel);
  const normalized = puzzles
    .map((p) => normalizePuzzle(p, boardSize, currentStoneCount))
    .filter(Boolean);

  const fallbackDiff =
    targetLevelDiff ||
    calculateLevelDiff(currentStoneCount || MIN_STONES, boardSize);

  if (!normalized.length) {
    const idealStones = Math.max(
      MIN_STONES,
      Math.round(fallbackDiff / boardSize) || currentStoneCount || MIN_STONES
    );
    return { stoneCount: idealStones, boardSize };
  }

  let best = normalized[0];
  let bestDiff = Math.abs(normalized[0].levelDiff - fallbackDiff);
  let minDiff = normalized[0].levelDiff;
  let maxDiff = normalized[0].levelDiff;

  for (let i = 1; i < normalized.length; i++) {
    const entry = normalized[i];
    const diff = Math.abs(entry.levelDiff - fallbackDiff);
    if (diff < bestDiff) {
      best = entry;
      bestDiff = diff;
    }
    minDiff = Math.min(minDiff, entry.levelDiff);
    maxDiff = Math.max(maxDiff, entry.levelDiff);
  }

  if (maxDiff < fallbackDiff) {
    const increasedStones = Math.max(
      best.stoneCount,
      Math.ceil(fallbackDiff / boardSize)
    );
    return { stoneCount: increasedStones, boardSize };
  }

  if (minDiff > fallbackDiff) {
    const reducedStones = Math.max(
      MIN_STONES,
      Math.floor(fallbackDiff / boardSize) || MIN_STONES
    );
    return { stoneCount: reducedStones, boardSize };
  }

  return {
    stoneCount: Math.max(MIN_STONES, best.stoneCount),
    boardSize: best.boardSize,
  };
}

function createDifficultyOutcomeRecorder({
  difficultyState,
  setDifficultyState,
  minStones = MIN_STONES,
  config,
  boardDimension,
  skillRatingEl,
  pickNextPuzzleFn = pickNextPuzzle,
  incrementLevelIfNeededFn = incrementLevelIfNeeded,
  computeRatingResultFn = computeRatingResult,
  calculateExpectedTimeFn = calculateExpectedTime,
  calculateSpeedBonusFn = () => 0,
  MAX_SPEED_BONUS_THRESHOLD,
  logSkillRatingDebug,
  writeSkillDebug,
  setNextPuzzleSuggestion,
  currentMode,
  activeGame,
}) {
  return function recordDifficultyOutcome(timedOutOverride) {
    if (!activeGame) return null;
    if (activeGame.difficultyRecorded) return null;

    const stoneCountUsed = Math.max(
      minStones,
      activeGame?.puzzleConfig?.stoneCount ?? config?.stoneCount ?? minStones
    );
    const boardSizeUsed =
      activeGame?.puzzleConfig?.boardSize ?? boardDimension ?? 0;
    const startTs = activeGame?.startedAt ?? Date.now();
    const endTs = activeGame?.timerEndTime ?? Date.now();
    const actualSeconds = Math.max(0.001, (endTs - startTs) / 1000);
    const timedOut =
      typeof timedOutOverride === 'boolean'
        ? timedOutOverride
        : Boolean(activeGame?.timedOut);
    const expectedTime = calculateExpectedTimeFn(stoneCountUsed, boardSizeUsed);
    const gameplayLevel = difficultyState.level || 1;
    const allowRatingChange = true;
    const safeActualTime = Math.max(0.001, actualSeconds);
    const playerSkipped = Boolean(activeGame?.playerSkipped);
    const completed = Boolean(activeGame?.challengeCompleted);
    const usedSpeedBoost = Boolean(activeGame?.speedBoostUsed);
    const maxSpeedBonusAchieved = Boolean(activeGame?.maxSpeedBonusAchieved);

    let ratingResult = {
      rating: difficultyState.rating,
      expectedTime,
      performance: expectedTime / safeActualTime,
      delta: 0,
      timedOut,
    };

    let levelAfter = difficultyState.level;

    ratingResult = computeRatingResultFn({
      stoneCount: stoneCountUsed,
      boardSize: boardSizeUsed,
      actualTime: safeActualTime,
      timedOut,
      completed,
      playerSkipped,
      usedSpeedBoost,
      maxSpeedBonusAchieved,
      usedAssistBonus: Boolean(activeGame?.usedAssistBonus),
      initialRemainingRatio:
        activeGame?.barRatioAtHide ?? activeGame?.initialRemainingRatio ?? 0,
      speedBonusUsed: Boolean(activeGame?.speedBonusUsed),
      currentRating: difficultyState.rating,
    });

    const attemptsForChallenge = Number(activeGame?.challengeAttempts || 0);
    const isRetry = attemptsForChallenge > 1;
    const skipRatio = Math.max(
      0,
      Math.min(
        1,
        activeGame?.barRatioAtHide ?? activeGame?.initialRemainingRatio ?? 0
      )
    );
    let newDelta = 0;
    let rewardRuleTriggered = 'notCompleted';
    if (completed) {
      if (isRetry) {
        newDelta = 1;
        rewardRuleTriggered = 'retry';
      } else if (skipRatio > 0.75) {
        if (maxSpeedBonusAchieved) {
          newDelta = 4;
          rewardRuleTriggered = 'skip75plusMaxSpeed';
        } else if (usedSpeedBoost || ratingResult.speedBonusUsed) {
          newDelta = 3;
          rewardRuleTriggered = 'skip75plusSpeed';
        } else {
          newDelta = 2;
          rewardRuleTriggered = 'skip75plus';
        }
      } else if (skipRatio > 0.5) {
        newDelta = 2;
        rewardRuleTriggered = 'skip50plus';
      } else {
        newDelta = 1;
        rewardRuleTriggered = 'completed';
      }
    }
    const currentRatingValue = Number.isFinite(
      Number(ratingResult.currentRating)
    )
      ? Number(ratingResult.currentRating)
      : Number(difficultyState.rating) || 0;
    ratingResult.delta = newDelta;
    ratingResult.nextRating = Math.max(
      0,
      Math.min(2500, currentRatingValue + newDelta)
    );
    ratingResult.rewardRuleTriggered = rewardRuleTriggered;
    ratingResult.rating = ratingResult.nextRating;
    const updatedState = saveDifficultyState({
      rating: ratingResult.nextRating,
      level: difficultyState.level,
    });
    const leveled = incrementLevelIfNeededFn(ratingResult.nextRating);
    levelAfter = leveled.level;
    const finalState = { rating: ratingResult.nextRating, level: levelAfter };
    setDifficultyState?.(finalState);

    const debugPayload = {
      timerPhase: {
        barRatioAtHide: activeGame?.barRatioAtHide ?? null,
        timeLeftAtHide: activeGame?.timeLeftAtHide ?? null,
        usedAssistBonus: Boolean(activeGame?.usedAssistBonus),
        usedSpeedBoost: Boolean(activeGame?.usedSpeedBoost),
        playerSkipped,
        computedRatio:
          activeGame?.barRatioAtHide ??
          (activeGame?.timeLeft && config?.time
            ? Math.max(0, Math.min(1, (activeGame.timeLeft || 0) / config.time))
            : null),
        freezeReason: activeGame?.freezeReason ?? null,
      },
      solvePhase: {
        startTimestampSolve: activeGame?.startTimestampSolve ?? null,
        endTimestampSolve: activeGame?.endTimestampSolve ?? null,
        solveDuration: activeGame?.solveDuration ?? null,
        maxSpeedBonus: Boolean(activeGame?.maxSpeedBonusAchieved),
        maxSpeedBonusThreshold: MAX_SPEED_BONUS_THRESHOLD,
        speedBonusUsed: Boolean(activeGame?.speedBonusUsed),
        speedBonusEstimate: calculateSpeedBonusFn(
          activeGame?.solveDuration || 0
        ),
      },
      rewardPhase: {
        rewardGiven: ratingResult.delta,
        rewardRuleTriggered: ratingResult.rewardRuleTriggered,
        branch: playerSkipped
          ? 'skip/expedite'
          : completed
          ? 'completed'
          : 'none',
      },
      meta: {
        completed,
        playerSkipped,
        totalTime: config?.time,
        timeLeftAtSolveStart: activeGame?.timeLeftAtSolveStart ?? null,
        timeLeftAtSolveEnd: activeGame?.timeLeftAtSolveEnd ?? null,
      },
    };

    const skillRatingPayload = { ...debugPayload, ratingResult };
    if (window.goVisDB?.recordRound) {
      console.log('[CLOUD][STATS] Trigger recordRound');
      window.goVisDB
        .recordRound(skillRatingPayload)
        .catch((err) =>
          console.error('[CLOUD][STATS] Failed to record round', err)
        );
    } else {
      console.warn('[CLOUD][STATS] goVisDB.recordRound not available');
    }

    logSkillRatingDebug?.(debugPayload);
    writeSkillDebug?.(
      {
        allowRatingChange,
        gameplayLevel,
        completed,
        usedSpeedBoost,
        maxSpeedBonusAchieved,
        expectedTime: ratingResult.expectedTime,
        actualSeconds: safeActualTime,
        delta: ratingResult.delta,
        currentRating: ratingResult.currentRating,
        nextRating: ratingResult.nextRating,
        remainingRatio: activeGame?.initialRemainingRatio ?? 0,
        rewardRuleTriggered: ratingResult.rewardRuleTriggered,
        playerSkipped,
      },
      levelAfter
    );

    if (ratingResult.delta > 0) {
      const steps = [];
      steps.push({ label: 'COMPLETED \u2705 +1', value: 1 });
      if (rewardRuleTriggered === 'skip50plus') {
        steps.push({ label: '50% SKIP \u2705 +1', value: 1 });
      } else if (
        rewardRuleTriggered === 'skip75plus' ||
        rewardRuleTriggered === 'skip75plusSpeed' ||
        rewardRuleTriggered === 'skip75plusMaxSpeed'
      ) {
        steps.push({ label: '75% SKIP \u2705 +2', value: 2 });
      }
      const showSpeedStep =
        !isRetry &&
        rewardRuleTriggered !== 'retry' &&
        (usedSpeedBoost ||
          ratingResult.speedBonusUsed ||
          maxSpeedBonusAchieved);
      if (showSpeedStep) {
        steps.push({ label: 'SPEED \u2705 +1', value: 1 });
      }
      const stack = showRatingGain(1, skillRatingEl);
      const stepDelay = Number(window.GOLD_AWARD_PAUSE + 200) || 260;
      let currentDisplay = currentRatingValue;
      (async () => {
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          if (stack) stack.addLine(step.label);
          currentDisplay += step.value;
          renderSkillRating(skillRatingEl, currentDisplay, currentDisplay);
          await new Promise((resolve) => setTimeout(resolve, stepDelay));
        }
      })();
    }

    renderSkillRating(skillRatingEl, finalState.rating, finalState.rating);
    const targetLevelDiff = ratingResult.rating * 0.02;
    const nextPuzzle = pickNextPuzzleFn({
      targetLevelDiff,
      level: finalState.level,
      currentStoneCount: stoneCountUsed,
      currentBoardSize: boardSizeUsed,
    });
    setNextPuzzleSuggestion?.(nextPuzzle);
    activeGame.difficultyRecorded = true;
    return {
      expectedTime,
      ratingResult,
      nextPuzzle,
      levelAfter,
      difficultyState: finalState,
    };
  };
}

export {
  calculateExpectedTime,
  calculateLevelDiff,
  incrementLevelIfNeeded,
  pickNextPuzzle,
  getBoardSizeForLevel,
  saveDifficultyState,
  loadDifficultyState,
  MIN_STONES,
  computeRatingResult,
  loadSkillDebugState,
  renderSkillRating,
  logSkillRatingDebug,
  clearSkillRewardText,
  cleanupFloatingRewards,
  showRatingGain,
  writeSkillDebug,
  createDifficultyOutcomeRecorder,
};
