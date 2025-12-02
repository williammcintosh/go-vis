import {
  getBoardSizeForLevel,
  saveDifficultyState,
  loadDifficultyState,
  MIN_STONES,
  renderSkillRating,
  logSkillRatingDebug,
  writeSkillDebug,
  createDifficultyOutcomeRecorder,
} from './difficulty.js';
import {
  createTimerUI,
  freezeBarState,
  freezeBarStateNextFrame,
  showTimerToast,
  initDoubleTapListeners,
  startTimerInterval,
  setupTimer,
  initTimerFlow,
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
  playSequence,
  createIntersectionHelpers,
} from './board.js';
import {
  addScore,
  deductPoints,
  flashScoreWarning,
  updateBonusAvailability,
  isFeedbackVisible,
  calculateSpeedBonus,
} from './score.js';
window.updateBonusAvailability = updateBonusAvailability;
import { createTutorialController } from './tutorial.js';
import { checkAnswers, createCheckAnswersHandler } from './answers.js';
import {
  initBonusFlow,
} from './bonus.js';
import {
  incrementPlayerProgress,
  preparePuzzleData,
} from './puzzle.js';
import { setupGameState } from './gameStateSetup.js';
import {
  clearMarkers,
  resetBoardUI,
  resetLevelUI,
  disableInteraction,
  enableInteraction,
  showMainScreen,
  showHomeScreen,
  prepareNextChallenge,
  resetGameStateUI,
} from './uiHelpers.js';

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
const SPEED_BOOST_MULTIPLIER = 40;
const TUTORIAL_KEY = 'goVizTutorialDone';
const TUTORIAL_SKIP_OFFSET = 36;
window.TUTORIAL_KEY = TUTORIAL_KEY;
window.TUTORIAL_SKIP_OFFSET = TUTORIAL_SKIP_OFFSET;
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
const MAX_SPEED_BONUS_THRESHOLD = 7000; // ms threshold for max speed bonus
const SKIP_BUTTON_IDS = ['skipBtn', 'skipButton', 'skipChallengeBtn'];
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
renderSkillRating(skillRatingEl, difficultyState.rating, difficultyState?.rating);

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
const SEQUENCE_BONUS = 250;
const SCORE_STEP_DELAY = 2; // base ms between score increments
const SCORE_AWARD_PAUSE = 90;
window.POSITION_BONUS = POSITION_BONUS;
window.COLOR_BONUS = COLOR_BONUS;
window.SEQUENCE_BONUS = SEQUENCE_BONUS;
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


let playerProgress = loadPlayerProgress();
let challengeAttempts = loadChallengeAttempts();
window.incrementPlayerProgress = (mode, boardKey, total) =>
  incrementPlayerProgress(playerProgress, mode, boardKey, total, savePlayerProgress);

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
const scoreElement = document.getElementById('scoreValue');

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
  if (scoreElement) {
    scoreElement.textContent = gameState.score;
  }
} else {
  window.progress = normalizeProgress();
  gameState.score = 0; // ensure score starts at 0 for new games
}
refreshHomeButtons();
updateBonusAvailability();

const resetStateParams = {
  localStorage,
  PLAYER_PROGRESS_KEY,
  CHALLENGE_ATTEMPTS_KEY,
  saveDifficultyState,
  renderSkillRating: (rating) =>
    renderSkillRating(skillRatingEl, rating, rating),
  normalizeProgress,
  setProgress: (progress) => {
    window.progress = progress;
  },
  gameState,
  emptyPlayerProgress,
  emptyChallengeAttempts,
  resetTutorialProgress,
  showScreen,
  difficulty,
  intro,
  refreshHomeButtons,
  scoreElement,
};

// Continue existing game, straight to maingame
continueBtn.addEventListener('click', () =>
  showMainScreen({ mainGame, show: difficulty, hide: intro, showScreen })
);

// Restart confirmation
startBtn.addEventListener('click', () => {
  const hasSave = localStorage.getItem('goVizProgress');
  if (hasSave) {
    confirmModal.classList.add('active');
  } else {
    const resetResult = resetGameStateUI(resetStateParams);
    difficultyState = resetResult.difficultyState;
    playerProgress = resetResult.playerProgress;
    challengeAttempts = resetResult.challengeAttempts;
  }
});

confirmYes.addEventListener('click', () => {
  confirmModal.classList.remove('active');
  const resetResult = resetGameStateUI(resetStateParams);
  difficultyState = resetResult.difficultyState;
  playerProgress = resetResult.playerProgress;
  challengeAttempts = resetResult.challengeAttempts;
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

// ---------- Button Listeners ----------
const nextBtn = document.getElementById('nextBtn');
const homeBtn2 = document.getElementById('homeBtn2');
const levelOkBtn = document.getElementById('levelOkBtn');

homeBtn2.addEventListener('click', () => {
  showHomeScreen({
    feedback: document.getElementById('feedback'),
    updateBonusAvailability,
    activeGame: window.activeGame,
    mainGame,
    intro,
    difficulty,
    showScreen,
    setSpeedMultiplier: (value) => {
      speedMultiplier = value;
    },
  });
});

nextBtn.onclick = async () => {
  await prepareNextChallenge({
    feedback: document.getElementById('feedback'),
    updateBonusAvailability,
    activeGame: window.activeGame,
    setSpeedMultiplier: (value) => {
      speedMultiplier = value;
    },
    board: document.getElementById('board'),
    documentRoot: document,
    startGame,
  });
};

levelOkBtn.onclick = () => {
  resetLevelUI(nextBtn, levelOkBtn);
};

// ---------- Main Game ----------
async function startGame(mode) {
  const { config, boardDimension } = setupGameState({
    mode,
    progress: window.progress,
    gameState,
    difficultyState,
    MODE_INTERVAL_SPEED,
    MIN_STONES,
    getBoardSizeForLevel,
    updateModeIndicator,
    renderSkillRating: (rating) =>
      renderSkillRating(skillRatingEl, rating, difficultyState?.rating),
    nextPuzzleSuggestion,
    setNextPuzzleSuggestion: (v) => {
      nextPuzzleSuggestion = v;
    },
    getTapMode,
    persistProgress,
    setSpeedMultiplier: (v) => {
      speedMultiplier = v;
    },
    setLastTap: (v) => {
      lastTap = v;
    },
    setLastStoneTap: (v) => {
      lastStoneTap = v;
    },
  });

  const board = document.getElementById('board');
  resetBoardUI(board, document);
  document.documentElement.style.setProperty('--board-size', config.size);

  const checkBtn = timerUI.checkBtn;
  const timerContainer = timerUI.container;
  const skipButton =
    SKIP_BUTTON_IDS.map((id) => document.getElementById(id)).find(Boolean) ||
    null;
  const getIntersections = () => document.querySelectorAll('.intersection');

  if (checkButtonShowTimeout) {
    clearTimeout(checkButtonShowTimeout);
    checkButtonShowTimeout = null;
  }
  timerUI.reset();

  const addTimeBonus = document.getElementById('addTimeBonus');
  const eyeGlassBonus = document.getElementById('eyeGlassBonus');
  const getCheckButtonShowTimeout = () => checkButtonShowTimeout;
  const setCheckButtonShowTimeout = (v) => {
    checkButtonShowTimeout = v;
  };
  const timerFlow = initTimerFlow({
    config,
    activeGame: window.activeGame,
    timerUI,
    addTimeBonus,
    checkBtn,
    getIntersections,
    freezeBarStateNextFrameFn: freezeBarStateNextFrame,
    clearStonesFn: clearStones,
    enableInteractionFn: enableInteraction,
    disableInteractionFn: disableInteraction,
    updateBonusAvailabilityFn: updateBonusAvailability,
    setSpeedMultiplierFn: (v) => {
      speedMultiplier = v;
    },
    getIsRefilling: () => isRefilling,
    setCanUseEyeGlass: (v) => {
      canUseEyeGlass = v;
      window.canUseEyeGlass = v;
    },
    getCheckButtonShowTimeout,
    setCheckButtonShowTimeout,
    logSkillRatingDebugFn: logSkillRatingDebug,
    checkAnswersFn: () => checkAnswers(),
  });
  timerFlow.prepareTimerStart();

  const bonusFlow = initBonusFlow({
    addTimeBonus,
    eyeGlassBonus,
    config,
    timerUI,
    startTimerInterval,
    updateBonusAvailability,
    deductPoints,
    tutorialController,
    showTimerToast,
    flashScoreWarning,
    BONUS_COST,
    getIsRefilling: () => isRefilling,
    setIsRefilling: (v) => {
      isRefilling = v;
      window.isRefilling = v;
    },
    getTimeLeft: () => timerFlow.getTimeLeft(),
    setTimeLeft: (v) => {
      timerFlow.setTimeLeft(v);
    },
    isFeedbackVisible,
    board,
    gameState,
    getActiveGame: () => window.activeGame,
    getCanUseEyeGlass: () => canUseEyeGlass,
    setCanUseEyeGlass: (v) => {
      canUseEyeGlass = v;
      window.canUseEyeGlass = v;
    },
  });

  bonusFlow.resetBonusState();

  if (addTimeHandler) {
    addTimeBonus.removeEventListener('click', addTimeHandler);
  }
  addTimeHandler = bonusFlow.addTimeHandler;
  addTimeBonus.addEventListener('click', addTimeHandler);

  if (eyeGlassHandler) {
    eyeGlassBonus.removeEventListener('click', eyeGlassHandler);
  }
  eyeGlassHandler = bonusFlow.eyeGlassHandler;
  eyeGlassBonus.addEventListener('click', eyeGlassHandler);

  const { snapshot, stones } = await preparePuzzleData({
    boardDimension,
    config,
    currentMode,
    playerProgress,
    challengeAttempts,
    savePlayerProgress,
    saveChallengeAttempts,
    activeGame: window.activeGame,
  });

  drawBoard(board, config.size, toggleStone);
  timerFlow.lockInteractions();

  if (skipButton) {
    skipButton.onclick = () => {
      timerFlow.markPlayerSkipped();
    };
  }

  setupTimer({
    getConfig: () => config,
    getTimeLeft: () => timerFlow.getTimeLeft(),
    setTimeLeft: (v) => {
      timerFlow.setTimeLeft(v);
    },
    handleTimerFinished: () => timerFlow.handleTimerFinished(),
    timerUI,
  });

  timerUI.setProgress(1, { instant: true });

  const { getIntersectionRef, updateSequenceIntersectionsRef } =
    createIntersectionHelpers(board);

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

  const tutorialContext = tutorialController.buildGameAttachment({
    board,
    timerContainer,
    addTimeBonus,
    eyeGlassBonus,
    addTimeBoost: (seconds) => timerFlow.adjustTimeBy(seconds),
    clearBoard: () => {
      clearStones();
      clearMarkers(document);
    },
    getTimeRatio: () => timerFlow.getTimeLeft() / config.time,
    mode,
  });
  tutorialController.attachToGame(tutorialContext);

  startTimerInterval();
  updateBonusAvailability();

  const recordDifficultyOutcome = createDifficultyOutcomeRecorder({
    difficultyState,
    setDifficultyState: (state) => {
      difficultyState = state;
    },
    minStones: MIN_STONES,
    config,
    boardDimension,
    skillRatingEl,
    MAX_SPEED_BONUS_THRESHOLD,
    calculateSpeedBonusFn: calculateSpeedBonus,
    logSkillRatingDebug,
    writeSkillDebug,
    setNextPuzzleSuggestion: (next) => {
      nextPuzzleSuggestion = next;
    },
    getProgress: () => window.progress,
    gameState,
    currentMode,
    activeGame: window.activeGame,
  });
  window.recordDifficultyOutcome = recordDifficultyOutcome;

  const handleCheckAnswers = createCheckAnswersHandler({
    timerUI,
    config,
    stones,
    currentMode,
    speedMultiplier,
    MAX_SPEED_BONUS_THRESHOLD,
    freezeBarState,
    addScore,
    logSkillRatingDebug,
    getTimeLeft: () => timerFlow.getTimeLeft(),
  });
  checkBtn.onclick = handleCheckAnswers;
}
