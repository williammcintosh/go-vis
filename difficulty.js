const RATING_KEY = 'skill_rating';
const SKILL_PROGRESS_KEY = 'skill_progress';
const DEFAULT_RATING = 0;
const DEFAULT_LEVEL = 1;
const MIN_RATING = 0;
const MAX_RATING = 2500;
const MIN_STONES = 5;

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

function updatePlayerRating(params) {
  const { rating: currentRating, level } = loadDifficultyState();
  const computed = computeRatingResult({
    ...params,
    currentRating,
  });
  const nextState = saveDifficultyState({
    rating: computed.nextRating,
    level,
  });

  return {
    ...nextState,
    expectedTime: computed.expectedTime,
    performance: computed.performance,
    delta: computed.delta,
    timedOut: computed.timedOut,
  };
}

function triggerLevelOverlay(level) {
  const existing = document.querySelector('.level-up-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'level-up-overlay';
  const msg = document.createElement('div');
  msg.className = 'level-up-overlay__text';
  msg.textContent = `Level ${level} now unlocked!`;

  const buttonsRow = document.createElement('div');
  buttonsRow.className = 'level-up-overlay__actions';

  const goBtn = document.createElement('button');
  goBtn.className = 'level-up-overlay__btn level-up-overlay__btn--ghost';
  goBtn.type = 'button';
  goBtn.textContent = 'Go Now';

  const okBtn = document.createElement('button');
  okBtn.className = 'level-up-overlay__btn';
  okBtn.type = 'button';
  okBtn.textContent = 'Okay';

  const nextBtn = document.getElementById('nextBtn');
  if (nextBtn) {
    nextBtn.disabled = true;
    nextBtn.classList.add('next-disabled-by-levelup');
  }

  okBtn.addEventListener('click', () => {
    overlay.remove();
    if (nextBtn) {
      nextBtn.disabled = false;
      nextBtn.classList.remove('next-disabled-by-levelup');
    }
  });

  goBtn.addEventListener('click', () => {
    overlay.remove();
    const homeBtn = document.getElementById('homeBtn2') || document.getElementById('homeBtn');
    if (homeBtn) homeBtn.click();
    if (nextBtn) {
      nextBtn.disabled = false;
      nextBtn.classList.remove('next-disabled-by-levelup');
    }
  });

  buttonsRow.appendChild(goBtn);
  buttonsRow.appendChild(okBtn);

  overlay.appendChild(msg);
  overlay.appendChild(buttonsRow);
  document.body.appendChild(overlay);

  const duration = 420;
  overlay.animate(
    [
      { opacity: 0, transform: 'translate(-50%, -6%) scale(0.96)' },
      { opacity: 1, transform: 'translate(-50%, 0) scale(1)' },
    ],
    { duration, easing: 'ease-out', fill: 'forwards' }
  );
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

export {
  updatePlayerRating,
  calculateExpectedTime,
  calculateLevelDiff,
  incrementLevelIfNeeded,
  pickNextPuzzle,
  getBoardSizeForLevel,
  saveDifficultyState,
  loadDifficultyState,
  MIN_STONES,
  computeRatingResult,
};
