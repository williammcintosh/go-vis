import { launchConfetti } from './anim.js';
import {
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
} from './difficulty.js';
import {
  createTimerUI,
  freezeBarState,
  freezeBarStateNextFrame,
  showTimerToast,
  handleDoubleTap,
  preventPinchZoom,
  initDoubleTapListeners,
  startTimerInterval,
  runTimerTick,
  setupTimer,
} from './timer.js';
import {
  loadTapMode,
  setTapMode,
  getTapMode,
  syncTapModeInputs,
  toggleStone,
  setupInput,
} from './input.js';
import {
  drawBoard,
  clearStones,
  renderFinalStones,
  updateSequenceIntersections,
  playSequence,
  getIntersection,
} from './board.js';
import {
  addScore,
  showScoreFloat,
  animateScoreValue,
  deductPoints,
  flashScoreWarning,
  updateBonusAvailability,
  setBonusState,
  isFeedbackVisible,
  getAwardDuration,
} from './score.js';

const intro = document.getElementById('intro');
const difficulty = document.getElementById('difficulty');
const mainGame = document.getElementById('mainGame');
const settingsModal = document.getElementById('settingsModal');
let currentMode = 'position';
window.currentMode = currentMode;
let isRefilling = false;
window.isRefilling = isRefilling;
let canUseEyeGlass = false;
window.canUseEyeGlass = canUseEyeGlass;
const DOUBLE_TAP_WINDOW = 300;
const SPEED_BOOST_MULTIPLIER = 20;
const TUTORIAL_KEY = 'goVizTutorialDone';
const TUTORIAL_SKIP_OFFSET = 36;
const TAP_MODE_KEY = 'goVizTapMode';
const TAP_MODES = {
  CLASSIC: 'classic',
  TOGGLE: 'toggle',
};
let speedMultiplier = 1;
let lastTap = 0;
let lastStoneTap = { time: 0, target: null };
let addTimeHandler = null;
let eyeGlassHandler = null;
let checkButtonShowTimeout = null;
const tutorialController = createTutorialController();
let tapMode = loadTapMode();

const DEFAULT_PROGRESS = {
  position: { level: 1, round: 1, started: false },
  sequence: { level: 1, round: 1, started: false },
};
const MODE_INTERVAL_SPEED = {
  position: 40,
  sequence: 45,
};
const MODE_TAGLINES = {
  position: 'Beginner',
  sequence: 'Advanced',
};
const MODE_ICONS = {
  position: 'images/position_small.png',
  sequence: 'images/sequence_small.png',
};

const timerUI = createTimerUI();
setupInput({
  TAP_MODE_KEY,
  TAP_MODES,
  DOUBLE_TAP_WINDOW,
  getTapModeValue: () => tapMode,
  setTapModeValue: (v) => {
    tapMode = v;
  },
  getLastStoneTap: () => lastStoneTap,
  setLastStoneTap: (v) => {
    lastStoneTap = v;
  },
});
setupTimer({
  getActiveGame: () => window.activeGame,
  getSpeedMultiplier: () => speedMultiplier,
  setSpeedMultiplier: (v) => {
    speedMultiplier = v;
  },
  getLastTap: () => lastTap,
  setLastTap: (v) => {
    lastTap = v;
  },
  getIsRefilling: () => isRefilling,
  tutorialController,
  doubleTapWindow: DOUBLE_TAP_WINDOW,
  speedBoostMultiplier: SPEED_BOOST_MULTIPLIER,
  getConfig: () => ({ time: 0, intervalSpeed: 1000 }),
  getTimeLeft: () => 0,
  setTimeLeft: () => {},
  timerUI,
  handleTimerFinished: () => {},
});
let difficultyState = saveDifficultyState(loadDifficultyState());
let nextPuzzleSuggestion = null;
const SKILL_DEBUG_KEY = 'skill_rating_debug';
const MAX_SPEED_BONUS_THRESHOLD = 7000; // ms threshold for max speed bonus
const SKIP_BUTTON_IDS = ['skipBtn', 'skipButton', 'skipChallengeBtn'];
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
    maxSpeedBonusAchieved: Boolean(normalizeLatest(parsed?.maxSpeedBonusAchieved)),
    actualSeconds: Number(normalizeLatest(parsed?.actualSeconds)),
    expectedTime: parsed?.expectedTime ?? null,
    delta: parsed?.delta ?? null,
    currentRating: parsed?.currentRating ?? null,
    recordedAt: parsed?.recordedAt ?? null,
    level,
  };
}
const skillRatingEl = (() => {
  const existing = document.getElementById('skillRatingText');
  if (existing) return existing;
  const levelInfo = document.getElementById('levelInfo');
  if (!levelInfo) return null;
  const span = document.createElement('span');
  span.id = 'skillRatingText';
  span.textContent = 'Skill Rating: --';
  levelInfo.appendChild(document.createElement('br'));
  levelInfo.appendChild(span);
  return span;
})();
renderSkillRating(difficultyState.rating);

function renderSkillRating(rating) {
  if (!skillRatingEl) return;
  const incoming = Number(rating);
  const fallback = Number(difficultyState?.rating);
  const value = Number.isFinite(incoming)
    ? incoming
    : Number.isFinite(fallback)
    ? fallback
    : 0;
  skillRatingEl.textContent = `Skill Rating: ${Math.round(value)}`;
}

function logSkillRatingDebug(data) {
  console.log('[SkillRating]', JSON.stringify(data, null, 2));
}

function showRatingGain(amount) {
  const target = skillRatingEl || document.body;
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const baseY = rect.top + rect.height * 0.8;
  const float = document.createElement('div');
  float.className = 'score-float rating-float';
  float.textContent = amount > 0 ? `+${amount}` : `${amount}`;
  float.style.transform = `translate(${rect.left + rect.width / 2}px, ${baseY}px)`;
  document.body.appendChild(float);
  float
    .animate(
      [
        { opacity: 0, transform: `${float.style.transform} scale(0.95)` },
        { opacity: 1, transform: `${float.style.transform} scale(1.08)` },
        { opacity: 0, transform: `${float.style.transform} translateY(-10px)` },
      ],
      {
        duration: amount > 1 ? 950 : 750,
        easing: 'ease-out',
        fill: 'forwards',
      }
    )
    .finished.finally(() => float.remove());
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

function normalizeProgress(progress = {}) {
  return {
    position: {
      level:
        progress.position?.level ??
        progress.easy?.level ??
        DEFAULT_PROGRESS.position.level,
      round:
        progress.position?.round ??
        progress.easy?.round ??
        DEFAULT_PROGRESS.position.round,
      started:
        progress.position?.started ??
        progress.easy?.started ??
        DEFAULT_PROGRESS.position.started,
    },
    sequence: {
      level:
        progress.sequence?.level ??
        progress.hard?.level ??
        DEFAULT_PROGRESS.sequence.level,
      round:
        progress.sequence?.round ??
        progress.hard?.round ??
        DEFAULT_PROGRESS.sequence.round,
      started:
        progress.sequence?.started ??
        progress.hard?.started ??
        DEFAULT_PROGRESS.sequence.started,
    },
  };
}

window.progress = normalizeProgress(window.progress);
const ANIM_DELAY = 600;
const DEDUCT_TARGET_ID = 'scoreValue';
const BONUS_COST = 500;
window.ANIM_DELAY = ANIM_DELAY;
window.BONUS_COST = BONUS_COST;
const POSITION_BONUS = 200;
const COLOR_BONUS = 200;
const SPEED_BONUS_MAX = 300;
const SEQUENCE_BONUS = 250;
const REACTION_TIME_BASE = 4000;
const REACTION_TIME_SLOW = 10000;
const SCORE_STEP_DELAY = 2; // base ms between score increments
const SCORE_AWARD_PAUSE = 90;
window.POSITION_BONUS = POSITION_BONUS;
window.COLOR_BONUS = COLOR_BONUS;
window.SEQUENCE_BONUS = SEQUENCE_BONUS;
window.REACTION_TIME_SLOW = REACTION_TIME_SLOW;
window.SCORE_STEP_DELAY = SCORE_STEP_DELAY;
window.SCORE_AWARD_PAUSE = SCORE_AWARD_PAUSE;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
window.delay = delay;

// ---------- Dynamic Level Generation ----------
const gameState = {
  currentLevel: 1,
  currentRound: 1,
  totalRounds: 10,
  levels: [],
};
window.gameState = gameState;
gameState.score = gameState.score || 0;

const base = { stones: 5, board: 4, time: 40 };

for (let i = 1; i <= 50; i++) {
  const boardSize = base.board + Math.floor((i - 1) / 5);
  const stones = base.stones + (i - 1);
  const time = Math.max(20, base.time - (i - 1) * 3);
  gameState.levels.push({
    level: i,
    stones,
    boardSize,
    time,
    rounds: 10,
  });
}

function persistProgress() {
  localStorage.setItem(
    'goVizProgress',
    JSON.stringify({
      progress: window.progress,
      round: gameState.currentRound,
      score: gameState.score,
    })
  );
}
window.persistProgress = persistProgress;

const PLAYER_PROGRESS_KEY = 'goVizPlayerProgress';
const CHALLENGE_ATTEMPTS_KEY = 'goVizChallengeAttempts';

function emptyPlayerProgress() {
  return { position: {}, sequence: {} };
}

function emptyChallengeAttempts() {
  return { position: {}, sequence: {} };
}

function loadPlayerProgress() {
  try {
    const stored = localStorage.getItem(PLAYER_PROGRESS_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    if (parsed && typeof parsed === 'object') {
      return {
        position: parsed.position || {},
        sequence: parsed.sequence || {},
      };
    }
  } catch (err) {
    console.warn('Failed to load player progress', err);
  }
  return emptyPlayerProgress();
}

function savePlayerProgress(progress) {
  try {
    localStorage.setItem(PLAYER_PROGRESS_KEY, JSON.stringify(progress));
  } catch (err) {
    console.warn('Failed to save player progress', err);
  }
}

function loadChallengeAttempts() {
  try {
    const stored = localStorage.getItem(CHALLENGE_ATTEMPTS_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    if (parsed && typeof parsed === 'object') {
      return {
        position: parsed.position || {},
        sequence: parsed.sequence || {},
      };
    }
  } catch (err) {
    console.warn('Failed to load challenge attempts', err);
  }
  return emptyChallengeAttempts();
}

function saveChallengeAttempts(attempts) {
  try {
    localStorage.setItem(CHALLENGE_ATTEMPTS_KEY, JSON.stringify(attempts));
  } catch (err) {
    console.warn('Failed to save challenge attempts', err);
  }
}

function getPlayerProgressIndex(mode, boardKey, total) {
  const bucket = playerProgress?.[mode] || {};
  const current = Number(bucket[boardKey]);
  const parsed = Number.isFinite(current) ? current : 0;
  return total > 0 ? ((parsed % total) + total) % total : 0;
}

function incrementPlayerProgress(mode, boardKey, total) {
  if (total <= 0) return;
  const bucket = playerProgress[mode] || {};
  const currentIndex = getPlayerProgressIndex(mode, boardKey, total);
  const nextIndex = (currentIndex + 1) % total;
  bucket[boardKey] = nextIndex;
  playerProgress[mode] = bucket;
  savePlayerProgress(playerProgress);
}

let playerProgress = loadPlayerProgress();
let challengeAttempts = loadChallengeAttempts();

function getChallengeAttemptKey(gameId, index) {
  if (Number.isFinite(Number(gameId))) return `id:${gameId}`;
  if (Number.isFinite(Number(index))) return `idx:${index}`;
  return 'unknown';
}

function recordChallengeAttempt(mode, boardKey, { gameId, index }) {
  const safeMode = mode === 'sequence' ? 'sequence' : 'position';
  const bucket = challengeAttempts[safeMode] || {};
  const perBoard = bucket[boardKey] || {};
  const key = getChallengeAttemptKey(gameId, index);
  const current = Number(perBoard[key]);
  const next = Number.isFinite(current) ? current + 1 : 1;
  perBoard[key] = next;
  bucket[boardKey] = perBoard;
  challengeAttempts[safeMode] = bucket;
  saveChallengeAttempts(challengeAttempts);
  return next;
}

function updateModeStatuses() {
  Object.keys(MODE_TAGLINES).forEach((mode) => {
    const el = document.getElementById(`mode-status-${mode}`);
    if (!el) return;
    const progress = window.progress[mode];
    if (progress?.started) {
      el.textContent = `Level ${progress.level} • Round ${progress.round}`;
    } else {
      el.textContent = MODE_TAGLINES[mode];
    }
  });
}

function calculateSpeedBonus(reactionTime = REACTION_TIME_SLOW) {
  const normalized =
    1 -
    Math.min(
      1,
      Math.max(
        0,
        (reactionTime - REACTION_TIME_BASE) /
          (REACTION_TIME_SLOW - REACTION_TIME_BASE)
      )
    );
  return Math.round(normalized * SPEED_BONUS_MAX);
}
window.calculateSpeedBonus = calculateSpeedBonus;

function updateModeIndicator(mode) {
  const icon = document.getElementById('modeIndicatorIcon');
  const text = document.getElementById('modeIndicatorText');
  if (!icon || !text) return;
  const label = mode === 'sequence' ? 'Sequence Mode' : 'Position Mode';
  icon.src = MODE_ICONS[mode] ?? MODE_ICONS.position;
  text.textContent = label;
}

// ---------- Save State ----------
// Load saved progress if it exists
const saved = JSON.parse(localStorage.getItem('goVizProgress') || 'null');
const continueBtn = document.getElementById('continueBtn');
const startBtn = document.getElementById('startBtn');
const confirmModal = document.getElementById('confirmModal');
const confirmYes = document.getElementById('confirmYes');
const confirmNo = document.getElementById('confirmNo');
const settingsBtn = document.getElementById('settingsBtn');
const settingsHomeBtn = document.getElementById('settingsHomeBtn');
const tapModeInputs = document.querySelectorAll('input[name="tapMode"]');

const tutorialHasRun = localStorage.getItem(TUTORIAL_KEY) === '1';
tutorialController.configure({ shouldRun: !saved && !tutorialHasRun });

function resetTutorialProgress() {
  tutorialController.reset();
}

function refreshHomeButtons() {
  const hasSave = Boolean(localStorage.getItem('goVizProgress'));
  continueBtn.style.display = hasSave ? 'inline-block' : 'none';
  startBtn.textContent = hasSave ? 'Restart' : 'Start';
}
window.refreshHomeButtons = refreshHomeButtons;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDoubleTapListeners);
} else {
  initDoubleTapListeners();
}

if (saved) {
  window.progress = normalizeProgress(saved.progress);
  gameState.currentRound = saved.round || 1;
  gameState.score = saved.score || 0; // restore saved score or default to 0

  // update the score display on screen
  document.getElementById('scoreValue').textContent = gameState.score;
} else {
  window.progress = normalizeProgress();
  gameState.score = 0; // ensure score starts at 0 for new games
}
refreshHomeButtons();
updateBonusAvailability();

// Continue existing game, straight to maingame
continueBtn.addEventListener('click', () => {
  mainGame.style.display = 'none';
  showScreen(difficulty, intro);
});

// Restart confirmation
startBtn.addEventListener('click', () => {
  const hasSave = localStorage.getItem('goVizProgress');
  if (hasSave) {
    confirmModal.classList.add('active');
  } else {
    localStorage.removeItem('goVizProgress');
    localStorage.removeItem('skill_rating');
    localStorage.removeItem('skill_progress');
    localStorage.removeItem(PLAYER_PROGRESS_KEY);
    localStorage.removeItem(CHALLENGE_ATTEMPTS_KEY);
    difficultyState = saveDifficultyState({ rating: 0, level: 1 });
    renderSkillRating(difficultyState.rating);
    window.progress = normalizeProgress();
    gameState.currentRound = 1;
    playerProgress = emptyPlayerProgress();
    challengeAttempts = emptyChallengeAttempts();

    // ADD THIS
    gameState.score = 0;
    document.getElementById('scoreValue').textContent = '0';
    resetTutorialProgress();

    showScreen(difficulty, intro);
    refreshHomeButtons();
  }
});

confirmYes.addEventListener('click', () => {
  confirmModal.classList.remove('active');
  localStorage.removeItem('goVizProgress');
  localStorage.removeItem('skill_rating');
  localStorage.removeItem('skill_progress');
  localStorage.removeItem(PLAYER_PROGRESS_KEY);
  localStorage.removeItem(CHALLENGE_ATTEMPTS_KEY);
  difficultyState = saveDifficultyState({ rating: 0, level: 1 });
  renderSkillRating(difficultyState.rating);
  window.progress = normalizeProgress();
  gameState.currentRound = 1;
  playerProgress = emptyPlayerProgress();
  challengeAttempts = emptyChallengeAttempts();

  // ADD THIS
  gameState.score = 0;
  document.getElementById('scoreValue').textContent = '0';
  resetTutorialProgress();

  showScreen(difficulty, intro);
  refreshHomeButtons();
});

confirmNo.addEventListener('click', () => {
  confirmModal.classList.remove('active');
});

// ---------- Utility ----------
function showScreen(show, hide) {
  if (show === difficulty) {
    updateModeStatuses();
  }
  hide.classList.remove('active');
  show.classList.add('active');
}

intro.classList.add('active');

document.getElementById('homeBtn').onclick = () => {
  showScreen(intro, difficulty);
};

// ---------- Difficulty Selection ----------
document.querySelectorAll('.diffBtn').forEach((b) => {
  b.onclick = () => {
    currentMode = b.dataset.mode;
    window.currentMode = currentMode;
    difficulty.classList.remove('active');
    mainGame.style.display = 'block';
    startGame(currentMode);
  };
});

// ---------- Settings ----------
settingsBtn?.addEventListener('click', () => {
  syncTapModeInputs();
  showScreen(settingsModal, intro);
});

settingsHomeBtn?.addEventListener('click', () => {
  showScreen(intro, settingsModal);
});

tapModeInputs.forEach((input) => {
  input.addEventListener('change', () => setTapMode(input.value));
});
syncTapModeInputs();

// ---------- Game Selection Helpers ----------
const lastGameByBoard = {};

function determineBoardKey(library, targetSize) {
  if (!library) return null;
  const availableSizes = Object.keys(library)
    .map((key) => {
      const dim = Number(key.split('x')[0]);
      return Number.isNaN(dim) ? null : dim;
    })
    .filter((size) => size !== null)
    .sort((a, b) => a - b);
  if (!availableSizes.length) return null;
  if (availableSizes.includes(targetSize)) {
    return `${targetSize}x${targetSize}`;
  }
  const fallback = availableSizes.filter((size) => size <= targetSize).pop();
  const sizeToUse = fallback ?? availableSizes[0];
  return `${sizeToUse}x${sizeToUse}`;
}

async function selectGameForLevel(targetSize, stoneCount, mode) {
  const library = await window.GoMiniBoardLogic.loadMiniBoards();
  const boardKey = determineBoardKey(library, targetSize);
  if (!boardKey || !Array.isArray(library[boardKey])) {
    throw new Error(`No games available for ${targetSize}x${targetSize}`);
  }
  const games = library[boardKey];
  const targetCount = Number.isFinite(Number(stoneCount))
    ? Number(stoneCount)
    : null;
  const matchingGames =
    targetCount === null
      ? games
      : games.filter((game) => Number(game.num_moves) === targetCount);
  const pool = matchingGames.length ? matchingGames : games;
  if (!pool.length) {
    throw new Error(
      `No games available for ${boardKey} with ${targetCount ?? 'any'} stones`
    );
  }
  const safeMode = mode === 'sequence' ? 'sequence' : 'position';
  const index = getPlayerProgressIndex(safeMode, boardKey, pool.length);
  const selected = pool[index];
  lastGameByBoard[boardKey] = selected?.game_id;
  return {
    boardKey,
    game: selected,
    challengeMeta: {
      index,
      poolSize: pool.length,
      stoneCount: targetCount,
      mode: safeMode,
    },
  };
}

// ---------- Button Listeners ----------
const nextBtn = document.getElementById('nextBtn');
const homeBtn2 = document.getElementById('homeBtn2');
const levelOkBtn = document.getElementById('levelOkBtn');

homeBtn2.addEventListener('click', () => {
  const feedback = document.getElementById('feedback');
  feedback.style.display = 'none';
  feedback.classList.remove('show');
  updateBonusAvailability();
  if (window.activeGame?.timer) {
    speedMultiplier = 1;
    clearInterval(window.activeGame.timer);
  }
  mainGame.style.display = 'none';
  showScreen(intro, difficulty);
});

nextBtn.onclick = async () => {
  const feedback = document.getElementById('feedback');
  feedback.classList.remove('show');
  feedback.style.display = 'none';
  updateBonusAvailability();
  if (window.activeGame?.timer) {
    speedMultiplier = 1;
    clearInterval(window.activeGame.timer);
  }
  document.getElementById('board').replaceChildren();
  document.querySelectorAll('.marker').forEach((m) => m.remove());
  await startGame(window.activeGame.mode);
};

levelOkBtn.onclick = () => {
  if (nextBtn.disabled) nextBtn.disabled = false;
  nextBtn.click();
  levelOkBtn.style.display = 'none';
};

// ---------- Main Game ----------
async function startGame(mode) {
  if (!window.activeGame) window.activeGame = { mode };
  else window.activeGame.mode = mode;

  window.activeGame.tapMode = getTapMode();
  window.activeGame.lastPlacedColor = 'white';
  if (!window.progress[mode].started) {
    window.progress[mode].started = true;
    persistProgress();
  }
  window.activeGame.sequenceHistory = [];
  window.activeGame.nextHintIndex = 0;

  speedMultiplier = 1;
  lastTap = 0;
  lastStoneTap = { time: 0, target: null };

  const level = window.progress[mode].level;
  const levelConfig = gameState.levels[level - 1] || gameState.levels[0];
  const currentLevel = window.progress[mode].level;
  gameState.currentLevel = currentLevel || 1;
  gameState.currentRound = window.progress[mode].round || 1;

  const plannedPuzzle = nextPuzzleSuggestion;
  nextPuzzleSuggestion = null;
  const playerLevel = difficultyState.level || 1;
  renderSkillRating(difficultyState.rating);
  const resolvedBoardSize =
    plannedPuzzle?.boardSize ?? getBoardSizeForLevel(playerLevel);

  document.getElementById(
    'levelText'
  ).textContent = `Level ${gameState.currentLevel}`;
  document.getElementById(
    'roundText'
  ).textContent = `Round ${gameState.currentRound}/${gameState.totalRounds}`;

  updateModeIndicator(mode);
  const config = {
    intervalSpeed: MODE_INTERVAL_SPEED[mode] ?? 40,
    stoneCount: Math.max(
      MIN_STONES,
      plannedPuzzle?.stoneCount ?? levelConfig.stones
    ),
    size: Math.max(2, (resolvedBoardSize || levelConfig.boardSize) - 1),
    time: levelConfig.time,
  };

  const boardDimension = config.size + 1;
  window.activeGame.puzzleConfig = {
    stoneCount: config.stoneCount,
    boardSize: boardDimension,
  };
  window.activeGame.startingLevel = gameState.currentLevel || 1;
  window.activeGame.startingRound = gameState.currentRound || 1;
  window.activeGame.startedAt = Date.now();
  window.activeGame.timedOut = false;
  window.activeGame.timerEndTime = null;
  window.activeGame.difficultyRecorded = false;
  window.activeGame.speedBoostUsed = false;
  window.activeGame.speedBonusUsed = false;
  window.activeGame.maxSpeedBonusAchieved = false;
  window.activeGame.usedAssistBonus = false;
  window.activeGame.initialRemainingRatio = null;
  window.activeGame.startTimestampSolve = null;
  window.activeGame.timeLeftAtSolveStart = null;
  window.activeGame.timeLeftAtSolveEnd = null;
  window.activeGame.timeLeftAtHide = null;
  window.activeGame.barRatioAtHide = null;
  window.activeGame.playerSkipped = false;
  window.activeGame.freezeReason = null;
  window.activeGame.totalTime = config.time;
  window.activeGame.challengeCompleted = false;

  let difficultyRecorded = false;
  const recordDifficultyOutcome = (timedOutOverride) => {
    if (difficultyRecorded) return null;
    const stoneCountUsed = Math.max(
      MIN_STONES,
      window.activeGame?.puzzleConfig?.stoneCount ?? config.stoneCount
    );
    const boardSizeUsed =
      window.activeGame?.puzzleConfig?.boardSize ?? boardDimension;
    const startTs = window.activeGame?.startedAt ?? Date.now();
    const endTs = window.activeGame?.timerEndTime ?? Date.now();
    const actualSeconds = Math.max(0.001, (endTs - startTs) / 1000);
    const timedOut =
      typeof timedOutOverride === 'boolean'
        ? timedOutOverride
        : Boolean(window.activeGame?.timedOut);
    const expectedTime = calculateExpectedTime(stoneCountUsed, boardSizeUsed);
    const gameplayLevel =
      window.activeGame?.startingLevel ||
      window.progress?.[currentMode]?.level ||
      gameState.currentLevel ||
      1;
    const allowRatingChange = true; // rating updates every challenge
    const safeActualTime = Math.max(0.001, actualSeconds);
    const playerSkipped = Boolean(window.activeGame?.playerSkipped);
    const completed = Boolean(window.activeGame?.challengeCompleted);
    const usedSpeedBoost = Boolean(window.activeGame?.speedBoostUsed);
    const maxSpeedBonusAchieved = Boolean(
      window.activeGame?.maxSpeedBonusAchieved
    );
    let ratingResult = {
      rating: difficultyState.rating,
      expectedTime,
      performance: expectedTime / safeActualTime,
      delta: 0,
      timedOut,
    };

    let levelAfter = difficultyState.level;

    const preview = computeRatingResult({
      stoneCount: stoneCountUsed,
      boardSize: boardSizeUsed,
      actualTime: safeActualTime,
      timedOut,
      usedSpeedBoost,
      maxSpeedBonusAchieved,
      currentRating: difficultyState.rating,
    });

    ratingResult = computeRatingResult({
      stoneCount: stoneCountUsed,
      boardSize: boardSizeUsed,
      actualTime: safeActualTime,
      timedOut,
      completed,
      playerSkipped,
      usedSpeedBoost,
      maxSpeedBonusAchieved,
      usedAssistBonus: Boolean(window.activeGame?.usedAssistBonus),
      initialRemainingRatio:
        window.activeGame?.barRatioAtHide ??
        window.activeGame?.initialRemainingRatio ??
        0,
      speedBonusUsed: Boolean(window.activeGame?.speedBonusUsed),
      currentRating: difficultyState.rating,
    });
    const attemptsForChallenge = Number(
      window.activeGame?.challengeAttempts || 0
    );
    const isRetry = attemptsForChallenge > 1;
    const skipRatio = Math.max(
      0,
      Math.min(
        1,
        window.activeGame?.barRatioAtHide ??
          window.activeGame?.initialRemainingRatio ??
          0
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
    const currentRatingValue =
      Number.isFinite(Number(ratingResult.currentRating))
        ? Number(ratingResult.currentRating)
        : Number(difficultyState.rating) || 0;
    ratingResult.delta = newDelta;
    ratingResult.nextRating = Math.max(0, Math.min(2500, currentRatingValue + newDelta));
    ratingResult.rewardRuleTriggered = rewardRuleTriggered;
    ratingResult.rating = ratingResult.nextRating;
    difficultyState = saveDifficultyState({
      rating: ratingResult.nextRating,
      level: difficultyState.level,
    });
    const leveled = incrementLevelIfNeeded(ratingResult.nextRating);
    levelAfter = leveled.level;
    difficultyState = { rating: ratingResult.nextRating, level: levelAfter };

    const debugPayload = {
      timerPhase: {
        barRatioAtHide: window.activeGame?.barRatioAtHide ?? null,
        timeLeftAtHide: window.activeGame?.timeLeftAtHide ?? null,
        usedAssistBonus: Boolean(window.activeGame?.usedAssistBonus),
        usedSpeedBoost: Boolean(window.activeGame?.speedBoostUsed),
        playerSkipped,
        computedRatio:
          window.activeGame?.barRatioAtHide ??
          (window.activeGame?.timeLeft && config?.time
            ? Math.max(
                0,
                Math.min(1, (window.activeGame.timeLeft || 0) / config.time)
              )
            : null),
        freezeReason: window.activeGame?.freezeReason ?? null,
      },
      solvePhase: {
        startTimestampSolve: window.activeGame?.startTimestampSolve ?? null,
        endTimestampSolve: window.activeGame?.endTimestampSolve ?? null,
        solveDuration: window.activeGame?.solveDuration ?? null,
        maxSpeedBonus: Boolean(window.activeGame?.maxSpeedBonusAchieved),
        maxSpeedBonusThreshold: MAX_SPEED_BONUS_THRESHOLD,
        speedBonusUsed: Boolean(window.activeGame?.speedBonusUsed),
        speedBonusEstimate: calculateSpeedBonus(
          window.activeGame?.solveDuration || 0
        ),
      },
      rewardPhase: {
        rewardGiven: ratingResult.delta,
        rewardRuleTriggered: ratingResult.rewardRuleTriggered,
        branch: playerSkipped ? 'skip/expedite' : completed ? 'completed' : 'none',
      },
      meta: {
        completed,
        playerSkipped,
        totalTime: config.time,
        timeLeftAtSolveStart: window.activeGame?.timeLeftAtSolveStart ?? null,
        timeLeftAtSolveEnd: window.activeGame?.timeLeftAtSolveEnd ?? null,
      },
    };

    logSkillRatingDebug(debugPayload);
    writeSkillDebug(
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
        remainingRatio: window.activeGame?.initialRemainingRatio ?? 0,
        rewardRuleTriggered: ratingResult.rewardRuleTriggered,
        playerSkipped,
      },
      levelAfter
    );

    if (ratingResult.delta > 0) {
      showRatingGain(ratingResult.delta);
    }

    renderSkillRating(difficultyState.rating);
    const targetLevelDiff = ratingResult.rating * 0.02;
    nextPuzzleSuggestion = pickNextPuzzle({
      targetLevelDiff,
      level: difficultyState.level,
      currentStoneCount: stoneCountUsed,
      currentBoardSize: boardSizeUsed,
    });
    difficultyRecorded = true;
    if (window.activeGame) {
      window.activeGame.difficultyRecorded = true;
    }
    return {
      expectedTime,
      ratingResult,
      nextPuzzle: nextPuzzleSuggestion,
      levelAfter,
    };
  };

  const board = document.getElementById('board');
  board.replaceChildren();
  document.querySelectorAll('.marker').forEach((m) => m.remove());
  document.documentElement.style.setProperty('--board-size', config.size);

  const checkBtn = timerUI.checkBtn;
  const timerContainer = timerUI.container;
  const skipButton =
    SKIP_BUTTON_IDS.map((id) => document.getElementById(id)).find(Boolean) ||
    null;

  if (checkButtonShowTimeout) {
    clearTimeout(checkButtonShowTimeout);
    checkButtonShowTimeout = null;
  }
  timerUI.reset();

  const addTimeBonus = document.getElementById('addTimeBonus');
  const eyeGlassBonus = document.getElementById('eyeGlassBonus');

  // At start: timer is active, so eyeGlass disabled
  canUseEyeGlass = false;
  window.canUseEyeGlass = canUseEyeGlass;
  updateBonusAvailability();

  if (addTimeHandler) {
    addTimeBonus.removeEventListener('click', addTimeHandler);
  }

  addTimeHandler = () => {
    const cannotAfford = gameState.score < BONUS_COST;
    if (
      addTimeBonus.classList.contains('disabled') ||
      isFeedbackVisible() ||
      cannotAfford ||
      isRefilling
    ) {
      if (cannotAfford) {
        flashScoreWarning();
      }
      return;
    }
    window.activeGame.usedAssistBonus = true;
    isRefilling = true;
    window.isRefilling = isRefilling;
    addTimeBonus.classList.add('disabled');
    updateBonusAvailability();
    deductPoints(BONUS_COST, addTimeBonus);
    tutorialController.onAddTimeUsed();
    showTimerToast('Time bonus!');

    const duration = 800;
    const holdTime = 600;
    const startRatio = timeLeft / config.time;
    const startTime = performance.now();

    if (window.activeGame?.timer) {
      clearInterval(window.activeGame.timer);
      window.activeGame.timer = null;
    }

    const animateUp = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const currentRatio = startRatio + (1 - startRatio) * progress;
      timerUI.setProgress(currentRatio);

      if (progress < 1) {
        requestAnimationFrame(animateUp);
      } else {
        setTimeout(() => {
          timeLeft = config.time;
          timerUI.setProgress(1);
          startTimerInterval();
          setTimeout(() => {
            isRefilling = false;
            window.isRefilling = isRefilling;
            addTimeBonus.classList.remove('disabled'); // re-enable
            updateBonusAvailability();
          }, 0);
        }, holdTime);
      }
    };

    requestAnimationFrame(animateUp);
  };

  addTimeBonus.addEventListener('click', addTimeHandler);

  const HINT_ANIMATION_BASE = 1200;
  const HINT_STAGGER = 420;
  const HINT_STONE_KEYFRAMES = [
    { opacity: 0 },
    { opacity: 1, offset: 0.2 },
    { opacity: 1, offset: 0.85 },
    { opacity: 0 },
  ];

  const revealSequenceHints = (hintMoves) => {
    const animations = [];
    const hasSecond = hintMoves.length > 1;

    hintMoves.forEach((move, index) => {
      const inter = board.querySelector(
        `.intersection[data-x="${move.x}"][data-y="${move.y}"]`
      );
      if (!inter) return;

      const hint = document.createElement('div');
      const colorClass = move.color === 'B' ? 'black' : 'white';
      hint.classList.add('hint-stone', colorClass);
      inter.appendChild(hint);

      const duration =
        index === 0 && hasSecond
          ? HINT_ANIMATION_BASE + HINT_STAGGER
          : HINT_ANIMATION_BASE;
      const delay = index === 0 ? 0 : HINT_STAGGER;

      const animation = hint.animate(HINT_STONE_KEYFRAMES, {
        duration,
        delay,
        easing: 'ease-in-out',
        fill: 'forwards',
      });
      const finish = animation.finished
        .catch(() => {})
        .finally(() => {
          hint.remove();
        });
      animations.push(finish);
    });

    return animations.length
      ? Promise.allSettled(animations)
      : Promise.resolve([]);
  };

  if (eyeGlassHandler) {
    eyeGlassBonus.removeEventListener('click', eyeGlassHandler);
  }

  eyeGlassHandler = () => {
    const cannotAfford = gameState.score < BONUS_COST;
    if (cannotAfford) {
      flashScoreWarning();
      return;
    }
    if (!canUseEyeGlass || isRefilling) {
      return;
    }
    if (isFeedbackVisible()) {
      return;
    }
    window.activeGame.usedAssistBonus = true;
    deductPoints(BONUS_COST, eyeGlassBonus);
    eyeGlassBonus.classList.add('disabled'); // stop spam

    const moves = window.activeGame?.gameSnapshot?.moves ?? [];
    const history = window.activeGame?.sequenceHistory ?? [];
    const solvedPrefix = (() => {
      let idx = 0;
      while (idx < moves.length && idx < history.length) {
        const expected = moves[idx];
        const actual = history[idx];
        const expectedColor = expected.color === 'B' ? 'black' : 'white';
        if (
          actual.x !== expected.x ||
          actual.y !== expected.y ||
          actual.color !== expectedColor
        ) {
          break;
        }
        idx++;
      }
      return idx;
    })();
    const upcomingMoves = moves.slice(solvedPrefix, solvedPrefix + 2);

    if (upcomingMoves.length === 0) {
      updateBonusAvailability();
      return;
    }

    revealSequenceHints(upcomingMoves);
  };

  eyeGlassBonus.addEventListener('click', eyeGlassHandler);

  let snapshot = null;
  let selectedGame = window.activeGame?.selectedGame;
  let boardKey = window.activeGame?.boardKey;

  if (!snapshot) {
    const selection = await selectGameForLevel(
      boardDimension,
      config.stoneCount,
      currentMode
    );
    boardKey = selection.boardKey;
    selectedGame = selection.game;
    const stoneTarget = Number.isFinite(Number(selectedGame?.num_moves))
      ? Number(selectedGame.num_moves)
      : config.stoneCount;
    window.activeGame.puzzleConfig = {
      stoneCount: stoneTarget,
      boardSize: boardDimension,
    };
    window.activeGame.challengeIndex = selection.challengeMeta?.index ?? 0;
    window.activeGame.challengePoolSize =
      selection.challengeMeta?.poolSize ?? 0;
    window.activeGame.challengeStoneCount =
      selection.challengeMeta?.stoneCount ?? stoneTarget;
    window.activeGame.challengeMode =
      selection.challengeMeta?.mode ?? currentMode;
    snapshot = await window.GoMiniBoardLogic.getGameSnapshot({
      size: boardKey,
      gameId: selectedGame.game_id,
      stoneTarget,
    });
    window.activeGame.selectedGame = selectedGame;
    window.activeGame.boardKey = boardKey;
    window.activeGame.gameSnapshot = snapshot;
  }
  if (!selectedGame && window.activeGame?.selectedGame) {
    selectedGame = window.activeGame.selectedGame;
  }
  if (!boardKey && window.activeGame?.boardKey) {
    boardKey = window.activeGame.boardKey;
  }
  window.activeGame.challengeAttempts = recordChallengeAttempt(
    window.activeGame.challengeMode || currentMode,
    window.activeGame.boardKey || boardKey,
    {
      gameId: window.activeGame?.selectedGame?.game_id ?? selectedGame?.game_id,
      index: window.activeGame.challengeIndex ?? 0,
    }
  );

  const stones = Object.entries(snapshot.stoneMap).map(
    ([coords, stoneColor]) => {
      const [x, y] = coords.split(',').map(Number);
      return {
        x,
        y,
        color: stoneColor === 'B' ? 'black' : 'white',
      };
    }
  );

  drawBoard(board, config.size, toggleStone);

  // Countdown
  let timeLeft = config.time;
  if (window.activeGame) {
    window.activeGame.timeLeft = timeLeft;
  }
  const markPlayerSkipped = () => {
    if (!window.activeGame) return;
    window.activeGame.playerSkipped = true;
    freezeBarStateNextFrame('postHideFrame', timeLeft, config.time);
    if (window.activeGame.timeLeftAtSolveEnd == null) {
      window.activeGame.timeLeftAtSolveEnd = timeLeft;
    }
    window.activeGame.challengeCompleted = false;
    logSkillRatingDebug({
      timerPhase: {
        barRatioAtHide: window.activeGame.barRatioAtHide,
        timeLeftAtHide: window.activeGame.timeLeftAtHide,
        usedAssistBonus: Boolean(window.activeGame.usedAssistBonus),
        usedSpeedBoost: Boolean(window.activeGame.speedBoostUsed),
        playerSkipped: true,
      },
      solvePhase: {},
      rewardPhase: {},
      meta: { completed: false, totalTime: config.time, action: 'skipButton' },
    });
    checkAnswers();
  };
  if (skipButton) {
    skipButton.onclick = () => {
      markPlayerSkipped();
    };
  }
   const adjustTimeBy = (delta) => {
    timeLeft = Math.min(config.time, Math.max(0, timeLeft + delta));
    timerUI.setProgress(timeLeft / config.time);
  };
  toggleInteraction(false);
  if (window.activeGame?.timer) {
    speedMultiplier = 1;
    clearInterval(window.activeGame.timer);
  }

  const handleTimerFinished = () => {
    if (window.activeGame?.timer) {
      clearInterval(window.activeGame.timer);
      window.activeGame.timer = null;
    }
    speedMultiplier = 1;
    window.activeGame.timerEndTime = Date.now();
    window.activeGame.timedOut = true;
    if (window.activeGame && window.activeGame.initialRemainingRatio === null) {
      freezeBarStateNextFrame('postHideFrame', timeLeft, config.time);
    }
    clearStones();
    toggleInteraction(true);
    addTimeBonus.classList.add('disabled');
    updateBonusAvailability();
    timerUI.setProgress(0);
    if (window.activeGame) {
      window.activeGame.timeLeft = 0;
    }
    if (checkButtonShowTimeout) {
      clearTimeout(checkButtonShowTimeout);
    }
    checkButtonShowTimeout = setTimeout(() => {
      timerUI.showCheck();
      if (!isRefilling) {
        canUseEyeGlass = true;
        window.canUseEyeGlass = canUseEyeGlass;
        updateBonusAvailability();
      }
      checkButtonShowTimeout = null;
    }, 100);
  };

  setupTimer({
    getConfig: () => config,
    getTimeLeft: () => timeLeft,
    setTimeLeft: (v) => {
      timeLeft = v;
    },
    handleTimerFinished,
    timerUI,
  });

  timerUI.setProgress(1);

  const getIntersectionRef = (x, y) => getIntersection(board, x, y);
  const updateSequenceIntersectionsRef = (prevMap, nextMap) =>
    updateSequenceIntersections(prevMap, nextMap, getIntersectionRef);

  if (currentMode === 'sequence') {
    await playSequence(
      snapshot.moves,
      boardDimension,
      getIntersectionRef,
      updateSequenceIntersectionsRef
    );
  }
  renderFinalStones(
    currentMode,
    stones,
    getIntersectionRef,
    clearStones
  );

  tutorialController.attachToGame({
    board,
    timerContainer,
    addTimeBonus,
    eyeGlassBonus,
    addTimeBoost: (seconds) => adjustTimeBy(seconds),
    clearBoard: () => {
      clearStones();
      document.querySelectorAll('.marker').forEach((m) => m.remove());
    },
    getTimeRatio: () => timeLeft / config.time,
    mode,
  });

  startTimerInterval();
  updateBonusAvailability();

  // ---------- Inner Helpers ----------

  function toggleInteraction(enable) {
    document.querySelectorAll('.intersection').forEach((i) => {
      i.style.pointerEvents = enable ? 'auto' : 'none';
    });
    checkBtn.disabled = !enable;
    checkBtn.style.opacity = enable ? '1' : '0.5';
  }

  function checkAnswers() {
    if (window.activeGame?.timer) {
      clearInterval(window.activeGame.timer);
      window.activeGame.timer = null;
    }
    if (window.activeGame) {
      // Treat manual check as not timed out unless explicitly marked elsewhere
      window.activeGame.timedOut = false;
    }
    if (!window.activeGame.timerEndTime) {
      window.activeGame.timerEndTime = Date.now();
    }
    if (window.activeGame && window.activeGame.initialRemainingRatio === null) {
      freezeBarState('checkAnswers', timeLeft, config.time);
    }
    // Record players reaction time
    const endTs = window.activeGame.timerEndTime || Date.now();
    const startTs = window.activeGame.startedAt || endTs;
    window.activeGame.reactionTime = endTs - startTs;

    document.querySelectorAll('.marker').forEach((m) => m.remove());
    let allCorrect = true;
    let sequenceOrderIssues = 0;

    let missedCount = 0;
    const orderMistakes = new Set();
    for (let y = 0; y <= config.size; y++) {
      for (let x = 0; x <= config.size; x++) {
        const inter = document.querySelector(
          `.intersection[data-x="${x}"][data-y="${y}"]`
        );
        const expected = stones.find((s) => s.x === x && s.y === y);
        const playerWhite = inter.classList.contains('white');
        const playerBlack = inter.classList.contains('black');
        const shouldCheck = expected || playerWhite || playerBlack;
        if (!shouldCheck) continue;

        let correct = false;
        if (expected) {
          correct =
            (expected.color === 'white' && playerWhite) ||
            (expected.color === 'black' && playerBlack);
        } else if (!playerWhite && !playerBlack) correct = true;

        const marker = document.createElement('div');
        marker.classList.add('marker');
        marker.textContent = correct ? '✅' : '❌';
        const coordKey = `${x},${y}`;
        const isOrderMistake = window.activeGame?.orderMistakes?.has(coordKey);
        if (!correct || isOrderMistake) {
          allCorrect = false;
          missedCount++;
          if (isOrderMistake) missedCount--; // already counted elsewhere
        }
        if (isOrderMistake) {
          marker.textContent = '❌';
          marker.classList.add('marker--order');
        }
        inter.appendChild(marker);
      }
    }

    if (currentMode === 'sequence') {
      const history = window.activeGame?.sequenceHistory ?? [];
      const expectedMoves = window.activeGame?.gameSnapshot?.moves ?? [];
      const expectedCount = expectedMoves.length;
      const alignCount = Math.min(history.length, expectedCount);
      for (let i = 0; i < alignCount; i++) {
        const expected = expectedMoves[i];
        const actual = history[i];
        const expectedColor = expected.color === 'B' ? 'black' : 'white';
        if (
          actual.x !== expected.x ||
          actual.y !== expected.y ||
          actual.color !== expectedColor
        ) {
          sequenceOrderIssues++;
          orderMistakes.add(`${actual.x},${actual.y}`);
          orderMistakes.add(`${expected.x},${expected.y}`);
          break;
        }
      }
      if (history.length < expectedCount) {
        const next = expectedMoves[history.length];
        if (next) {
          orderMistakes.add(`${next.x},${next.y}`);
        }
        sequenceOrderIssues++;
      } else if (history.length > expectedCount) {
        const extra = history[expectedCount];
        if (extra) {
          orderMistakes.add(`${extra.x},${extra.y}`);
        }
        sequenceOrderIssues++;
      }
      if (sequenceOrderIssues > 0) {
        allCorrect = false;
      }
      const formatExpected = (move) => {
        if (!move) return '??';
        const color = move.color === 'black' || move.color === 'B' ? 'B' : 'W';
        return `${color}[${move.x},${move.y}]`;
      };
      const formatActual = (move) => {
        if (!move) return '??';
        const color =
          move.color === 'black'
            ? 'B'
            : move.color === 'white'
            ? 'W'
            : move.color;
        return `${color}[${move.x},${move.y}]`;
      };
      window.activeGame.orderMistakes = orderMistakes;
    } else {
      window.activeGame.orderMistakes = new Set();
    }
    toggleInteraction(false);

    let levelIncreased = false;

    if (allCorrect) {
      gameState.currentRound++;
      if (gameState.currentRound > gameState.totalRounds) {
        window.progress[mode].level++;
        gameState.currentRound = 1;
        levelIncreased = true;
      }
    }

    window.progress[mode].round = gameState.currentRound;

  const feedback = document.getElementById('feedback');
  const msg = document.getElementById('feedbackMsg');
  const nextBtn = document.getElementById('nextBtn');
  const okBtn = document.getElementById('levelOkBtn');
    feedback.style.display = 'block';
    requestAnimationFrame(() => {
      feedback.classList.add('show');
      updateBonusAvailability();
    });

    const finalBoardCorrect = missedCount === 0;
    const playerSkipped = Boolean(window.activeGame?.playerSkipped);
    const barRatioAtHide =
      window.activeGame?.barRatioAtHide ??
      window.activeGame?.initialRemainingRatio ??
      (timeLeft / config.time);
    const initialRemainingRatio = barRatioAtHide || 0;
    let remainingRatio = initialRemainingRatio;
    if (window.activeGame?.timedOut) remainingRatio = 0;

    if (window.activeGame) {
      window.activeGame.playerSkipped = playerSkipped;
      const succeeded = allCorrect;
      window.activeGame.challengeCompleted = succeeded;
      if (window.activeGame.timeLeftAtSolveEnd == null) {
        window.activeGame.timeLeftAtSolveEnd = timeLeft;
      }
      if (window.activeGame.startTimestampSolve == null) {
        window.activeGame.startTimestampSolve = Date.now();
      }
      const endTs = Date.now();
      window.activeGame.endTimestampSolve = endTs;
      window.activeGame.solveDuration =
        window.activeGame?.startTimestampSolve != null
          ? endTs - window.activeGame.startTimestampSolve
          : 0;
      window.activeGame.maxSpeedBonusAchieved =
        window.activeGame.solveDuration <= MAX_SPEED_BONUS_THRESHOLD;
      window.activeGame.speedBoostUsed = Boolean(
        window.activeGame.speedBoostUsed || speedMultiplier > 1
      );
      window.activeGame.speedBonusUsed = Boolean(
        window.activeGame.speedBonusUsed || speedMultiplier > 1
      );
    }

    if (window.activeGame?.challengeCompleted) {
      const boardKey = window.activeGame.boardKey;
      const stoneCount =
        window.activeGame.challengeStoneCount ??
        window.activeGame?.puzzleConfig?.stoneCount ??
        config.stoneCount;
      const total = window.activeGame.challengePoolSize ?? 0;
      const modeKey =
        window.activeGame.challengeMode === 'sequence'
          ? 'sequence'
          : 'position';
      if (boardKey) {
        incrementPlayerProgress(modeKey, boardKey, total);
      }
    }

    if (nextBtn) {
      const succeeded = allCorrect;
      nextBtn.textContent = succeeded ? 'Next Challenge' : 'Retry';
    }

    recordDifficultyOutcome(Boolean(window.activeGame?.timedOut));

    if (levelIncreased) {
      msg.textContent = `Level ${window.progress[mode].level} now unlocked!`;
      nextBtn.disabled = true;
      if (okBtn) {
        okBtn.style.display = 'inline-block';
      }
      levelIncreased = false;
      launchConfetti();
      setTimeout(() => {
        addScore({
          reactionTime: window.activeGame?.reactionTime || 10000,
          finalBoardCorrect,
          sequenceOrderIssues,
        });
      }, ANIM_DELAY);
    } else if (allCorrect) {
      if (okBtn) {
        okBtn.style.display = 'none';
      }
      const praise = [
        'Incredible!',
        'Well done!',
        'Nice work!',
        'You crushed it!',
        'Excellent!',
        'Beautiful recall!',
        'Smart move!',
        'You nailed it!',
        'Brilliant!',
        'On fire!',
      ];
      msg.textContent = praise[Math.floor(Math.random() * praise.length)];
      // Disable "Next Challenge" during animation
      const nextBtn = document.getElementById('nextBtn');
      const levelOverlayActive = () =>
        Boolean(document.querySelector('.level-up-overlay'));

      // Add score with delay for animation sync
      nextBtn.disabled = true;
      setTimeout(() => {
        addScore({
          reactionTime: window.activeGame?.reactionTime || 10000,
          finalBoardCorrect,
          sequenceOrderIssues,
        }).finally(() => {
          if (!levelOverlayActive()) {
            nextBtn.disabled = false;
          }
        });
      }, ANIM_DELAY);
    } else {
      if (
        currentMode === 'sequence' &&
        finalBoardCorrect &&
        sequenceOrderIssues > 0
      ) {
        msg.textContent = 'Sequence order was off!';
      } else {
        msg.textContent =
          missedCount === 1 ? 'Missed just one stone!' : 'Missed some stones!';
      }
    }

    feedback.classList.add('show-msg');
    setTimeout(() => feedback.classList.add('show-btn'), 1500);
    msg.style.opacity = 1;
    nextBtn.style.display = 'inline-block';
  }

  checkBtn.onclick = checkAnswers;
}

function createTutorialController() {
  const overlay = document.getElementById('tutorialOverlay');
  const highlight = document.getElementById('tutorialHighlight');
  const tooltip = document.getElementById('tutorialTooltip');
  const tooltipText = document.getElementById('tutorialText');
  const tooltipBtn = document.getElementById('tutorialOkBtn');
  const skipPanel = document.getElementById('tutorialSkip');
  const skipBtn = document.getElementById('tutorialSkipBtn');

  let shouldRun = false;
  let active = false;
  let completed = false;
  let holdTimer = false;
  let ignoreDoubleTap = false;
  let waitingForAddTime = false;
  let addTimeResolver = null;
  let tooltipResolver = null;
  let hideTooltipTimeout = null;
  let context = null;
  let activeStep = null;

  tooltipBtn?.addEventListener('click', () => {
    if (!tooltipResolver) return;
    const resolve = tooltipResolver;
    tooltipResolver = null;
    hideTooltip();
    hideHighlight();
    resolve();
  });

  skipBtn?.addEventListener('click', () => finish(true));

  window.addEventListener('resize', () => {
    if (!skipPanel?.classList.contains('tutorial-hidden')) {
      positionSkipPanel();
    }
    refreshActiveStepLayout();
  });

  function configure({ shouldRun: value }) {
    shouldRun = value;
  }

  function attachToGame(gameContext) {
    if (!shouldRun || active || completed) return;
    context = gameContext;
    startSequence();
  }

  function startSequence() {
    if (active || !context) return;
    active = true;
    ignoreDoubleTap = true;
    showSkip(true);
    overlay?.classList.remove('tutorial-hidden');
    runSequence();
  }

  async function runSequence() {
    try {
      await delay(1400);
      if (!active) return;
      setHold(true);
      if (!active) return;
      const introText =
        context.mode === 'sequence'
          ? '[1/5] Memorize the locations and colors of these stones in order.'
          : '[1/5] Memorize the locations and colors of these five stones.';
      await showStep(context.board, introText, {
        placement: 'center',
        maxWidth: 360,
      });
      if (!active) return;
      await showStep(
        context.timerContainer,
        '[2/5] Memorize those stones before the timer runs out.',
        { placement: 'top' }
      );
      if (!active) return;
      setDim(false);
      setHold(false);
      await delay(1200);
      if (!active) return;
      setHold(true);
      grantStarterBoost();
      await showStep(
        context.addTimeBonus,
        '[3/5] You can purchase more time by pressing this button while the timer is running.',
        { placement: 'top', centerGame: true, maxWidth: 360 }
      );
      if (!active) return;
      setDim(false);
      pulseAddTime(true);
      setHold(false);
      await waitForAddTimeOrLow();
      if (!active) return;
      pulseAddTime(false);
      setHold(true);
      await showStep(
        context.timerContainer,
        '[4/5] Alternatively, you can double-tap anywhere to speed up the timer bar.',
        { placement: 'top' }
      );
      if (!active) return;
      ignoreDoubleTap = false;
      setDim(false);
      setHold(false);
      await delay(800);
      if (!active) return;
      await waitForTimerToEnd();
      if (!active) return;
      setHold(true);
      context.clearBoard?.();
      await showStep(
        context.eyeGlassBonus,
        '[5/5] Need a hint? Tap the eyeglass to preview the next two stones in the sequence.',
        { placement: 'top', centerGame: true, maxWidth: 360 }
      );
      if (!active) return;
      finish(false);
    } catch (err) {
      finish(true);
    }
  }

  function setHold(value) {
    holdTimer = !!value;
  }

  function setDim(value) {
    if (!overlay) return;
    overlay.classList.remove('tutorial-hidden');
    if (value) overlay.classList.add('active');
    else overlay.classList.remove('active');
  }

  function hideAll() {
    overlay?.classList.add('tutorial-hidden');
    overlay?.classList.remove('active');
    hideTooltip();
    hideHighlight();
    showSkip(false);
    activeStep = null;
  }

  function hideTooltip() {
    if (!tooltip) return;
    tooltip.classList.remove('active');
    if (hideTooltipTimeout) clearTimeout(hideTooltipTimeout);
    hideTooltipTimeout = setTimeout(() => {
      tooltip.classList.add('tutorial-hidden');
      hideTooltipTimeout = null;
    }, 150);
    activeStep = null;
  }

  function hideHighlight() {
    if (!highlight) return;
    highlight.classList.remove('active');
    highlight.classList.add('tutorial-hidden');
    if (activeStep) activeStep.target = null;
  }

  function showSkip(show) {
    if (!skipPanel) return;
    if (show) {
      skipPanel.classList.remove('tutorial-hidden');
      requestAnimationFrame(() => {
        positionSkipPanel();
        skipPanel.classList.add('active');
      });
    } else {
      skipPanel.classList.remove('active');
      setTimeout(() => skipPanel.classList.add('tutorial-hidden'), 150);
    }
  }

  function positionSkipPanel() {
    if (!skipPanel) return;
    const bonus = document.getElementById('bonusContainer');
    const frame = document.querySelector('.game-wrapper');
    const anchorRect =
      bonus?.getBoundingClientRect() || frame?.getBoundingClientRect();
    const panelRect = skipPanel.getBoundingClientRect();
    let top = window.innerHeight - panelRect.height - TUTORIAL_SKIP_OFFSET;
    if (anchorRect) {
      top = Math.min(
        window.innerHeight - panelRect.height - 20,
        anchorRect.bottom + TUTORIAL_SKIP_OFFSET
      );
    }
    skipPanel.style.top = `${Math.max(10, top)}px`;
    skipPanel.style.bottom = 'auto';
  }

  function pulseAddTime(enable) {
    if (!context?.addTimeBonus) return;
    if (enable) context.addTimeBonus.classList.add('tutorial-pulse');
    else context.addTimeBonus.classList.remove('tutorial-pulse');
  }

  function grantStarterBoost() {
    if (gameState.score < 600) {
      gameState.score = 600;
      document.getElementById('scoreValue').textContent = gameState.score;
      updateBonusAvailability();
    }
    context?.addTimeBoost?.(5);
  }

  function waitForAddTimeOrLow() {
    return new Promise((resolve) => {
      waitingForAddTime = true;
      addTimeResolver = resolve;
      setTimeout(() => resolveAddTime('timeout'), 8000);
    });
  }

  function waitForTimerToEnd() {
    return new Promise((resolve) => {
      if (!context?.getTimeRatio) {
        resolve();
        return;
      }
      const check = () => {
        const ratio = context.getTimeRatio();
        if (ratio <= 0 || !window.activeGame || !window.activeGame.timer) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });
  }

  function setHighlightTarget(target, padding = 12, silent = false) {
    if (!highlight || !target) return;
    const rect = target.getBoundingClientRect();
    const width = rect.width + padding * 2;
    const height = rect.height + padding * 2;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    highlight.style.width = width + 'px';
    highlight.style.height = height + 'px';
    highlight.style.left = `${centerX}px`;
    highlight.style.top = `${centerY}px`;
    highlight.classList.remove('tutorial-hidden');
    if (silent) {
      highlight.classList.add('active');
    } else {
      highlight.classList.remove('active');
      requestAnimationFrame(() => highlight.classList.add('active'));
    }
  }

  function showStep(target, text, opts = {}) {
    const placement = opts.placement || 'bottom';
    setDim(true);
    if (target) {
      setHighlightTarget(target, opts.padding || 12);
    } else {
      hideHighlight();
    }
    if (tooltip) {
      if (hideTooltipTimeout) {
        clearTimeout(hideTooltipTimeout);
        hideTooltipTimeout = null;
      }
      tooltipText.textContent = text;
      tooltip.classList.remove('tutorial-hidden');
      positionTooltip(
        target ? target.getBoundingClientRect() : null,
        placement,
        opts
      );
      requestAnimationFrame(() => tooltip.classList.add('active'));
    }
    activeStep = {
      target,
      padding: opts.padding || 12,
      placement,
      options: opts,
    };
    return new Promise((resolve) => {
      tooltipResolver = resolve;
    });
  }

  function positionTooltip(rect, placement, opts = {}) {
    if (!tooltip) return;
    const margin = 16;
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    if (opts.maxWidth) {
      tooltip.style.maxWidth =
        typeof opts.maxWidth === 'number'
          ? `${opts.maxWidth}px`
          : opts.maxWidth;
    } else {
      tooltip.style.maxWidth = '';
    }
    const tooltipRect = tooltip.getBoundingClientRect();
    const tooltipW = tooltipRect.width || 240;
    const tooltipH = tooltipRect.height || 140;

    let resolvedPlacement = placement;
    if (rect) {
      if (resolvedPlacement === 'top' && rect.top - tooltipH - margin < 0) {
        resolvedPlacement = 'bottom';
      } else if (
        resolvedPlacement === 'bottom' &&
        rect.bottom + tooltipH + margin > viewH
      ) {
        resolvedPlacement = 'top';
      } else if (
        resolvedPlacement === 'left' &&
        rect.left - tooltipW - margin < 0
      ) {
        resolvedPlacement = 'right';
      } else if (
        resolvedPlacement === 'right' &&
        rect.right + tooltipW + margin > viewW
      ) {
        resolvedPlacement = 'left';
      }
    }

    let left = viewW / 2;
    let top = viewH / 2;
    let transform = 'translate(-50%, -50%)';
    if (rect) {
      if (opts.centerGame) {
        const wrapper = document.querySelector('.game-wrapper');
        if (wrapper) {
          const wrapRect = wrapper.getBoundingClientRect();
          left = wrapRect.left + wrapRect.width / 2;
        }
      } else {
        left = rect.left + rect.width / 2;
      }
      if (resolvedPlacement === 'top') {
        top = rect.top - margin;
        transform = 'translate(-50%, -100%)';
      } else if (resolvedPlacement === 'bottom') {
        top = rect.bottom + margin;
        transform = 'translate(-50%, 0)';
      } else if (resolvedPlacement === 'right') {
        top = rect.top + rect.height / 2;
        left = rect.right + margin;
        transform = 'translate(0, -50%)';
      } else if (resolvedPlacement === 'left') {
        top = rect.top + rect.height / 2;
        left = rect.left - margin;
        transform = 'translate(-100%, -50%)';
      } else if (resolvedPlacement === 'center') {
        top = rect.top + rect.height / 2;
        left = rect.left + rect.width / 2;
        transform = 'translate(-50%, -50%)';
      }
    } else if (opts.centerGame) {
      const wrapper = document.querySelector('.game-wrapper');
      if (wrapper) {
        const wrapRect = wrapper.getBoundingClientRect();
        left = wrapRect.left + wrapRect.width / 2;
        top = wrapRect.bottom - wrapRect.height * 0.2;
      }
    }

    left = Math.min(viewW - margin, Math.max(margin, left));
    top = Math.min(viewH - margin, Math.max(margin, top));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.transform = transform;
  }

  function finish(skipped) {
    if (!active && completed) return;
    active = false;
    completed = true;
    shouldRun = false;
    holdTimer = false;
    ignoreDoubleTap = false;
    pulseAddTime(false);
    resolveAddTime('skip');
    if (tooltipResolver) {
      const resolve = tooltipResolver;
      tooltipResolver = null;
      resolve();
    }
    hideAll();
    localStorage.setItem(TUTORIAL_KEY, '1');
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function resolveAddTime(reason) {
    if (!waitingForAddTime) return;
    waitingForAddTime = false;
    const resolver = addTimeResolver;
    addTimeResolver = null;
    if (resolver) resolver(reason);
  }

  function refreshActiveStepLayout() {
    if (!activeStep) return;
    const { target, padding, placement, options } = activeStep;
    if (target && document.body.contains(target)) {
      setHighlightTarget(target, padding, true);
      positionTooltip(target.getBoundingClientRect(), placement, options);
    } else {
      hideHighlight();
      positionTooltip(null, placement, options || {});
    }
  }

  return {
    configure,
    attachToGame,
    shouldHoldTimer: () => active && holdTimer,
    shouldIgnoreDoubleTap: () => active && ignoreDoubleTap,
    onAddTimeUsed: () => {
      resolveAddTime('clicked');
    },
    onTimerTick: (ratio) => {
      if (waitingForAddTime && ratio <= 0.25) {
        resolveAddTime('low');
      }
    },
    reset: () => {
      shouldRun = true;
      completed = false;
      active = false;
      holdTimer = false;
      ignoreDoubleTap = false;
      waitingForAddTime = false;
      addTimeResolver = null;
      tooltipResolver = null;
      hideTooltipTimeout && clearTimeout(hideTooltipTimeout);
      hideTooltipTimeout = null;
      activeStep = null;
      hideAll();
      localStorage.removeItem(TUTORIAL_KEY);
    },
  };
}
