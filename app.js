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
  addGold,
  deductGold,
  flashGoldWarning,
  updateBonusAvailability,
  isFeedbackVisible,
  calculateSpeedBonus,
} from './gold.js';
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
import { createLevelSelectController } from './levelSelect.js';
import {
  clearMarkers,
  resetBoardUI,
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
  position: { started: false },
  sequence: { started: false },
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
let levelSelectController = null;
const MAX_SPEED_BONUS_THRESHOLD = 7000; // ms threshold for max speed bonus
const SKIP_BUTTON_IDS = ['skipBtn', 'skipButton', 'skipChallengeBtn'];
const goldBadge = document.getElementById('goldBadge');
const skillBadge = document.getElementById('skillBadge');
const skillRatingEl = (() => {
  const existing = document.getElementById('skillRatingText');
  if (existing) return existing;
  const levelInfo = document.getElementById('levelInfo');
  if (!levelInfo) return null;
  const span = document.createElement('span');
  span.id = 'skillRatingText';
  span.textContent = '--';
  levelInfo.appendChild(document.createElement('br'));
  levelInfo.appendChild(span);
  return span;
})();
const showGoldBadge = () => {
  if (goldBadge) {
    goldBadge.classList.add('is-visible');
  }
};
const showSkillBadge = () => {
  if (skillBadge) {
    skillBadge.classList.add('is-visible');
  }
};
const renderSkillRatingAll = (rating, fallback) => {
  const value = renderSkillRating(skillRatingEl, rating, fallback);
  if (skillRatingEl) {
    const displayValue = Number.isFinite(value) ? Math.round(value) : '--';
    skillRatingEl.textContent = `${displayValue}`;
  }
  return value;
};
renderSkillRatingAll(difficultyState.rating, difficultyState?.rating);

function normalizeProgress(progress = {}) {
  return {
    position: {
      started: Boolean(progress.position?.started ?? progress.easy?.started),
    },
    sequence: {
      started: Boolean(progress.sequence?.started ?? progress.hard?.started),
    },
  };
}

window.progress = normalizeProgress(window.progress);
const ANIM_DELAY = 600;
const DEDUCT_TARGET_ID = 'goldValue';
const BONUS_COST = 500;
window.ANIM_DELAY = ANIM_DELAY;
window.BONUS_COST = BONUS_COST;
const POSITION_BONUS = 200;
const COLOR_BONUS = 200;
const SEQUENCE_BONUS = 250;
const GOLD_STEP_DELAY = 2; // base ms between gold increments
const GOLD_AWARD_PAUSE = 90;
window.POSITION_BONUS = POSITION_BONUS;
window.COLOR_BONUS = COLOR_BONUS;
window.SEQUENCE_BONUS = SEQUENCE_BONUS;
window.GOLD_STEP_DELAY = GOLD_STEP_DELAY;
window.GOLD_AWARD_PAUSE = GOLD_AWARD_PAUSE;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
window.delay = delay;

// ---------- Game State ----------
const gameState = { gold: 0 };
window.gameState = gameState;

function persistProgress() {
  localStorage.setItem(
    'goVizProgress',
    JSON.stringify({
      progress: window.progress,
      gold: gameState.gold,
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
      el.textContent = 'In progress';
    } else {
      el.textContent = MODE_TAGLINES[mode];
    }
  });
}

function updateModeIndicator(mode) {
  const icon = document.getElementById('modeIndicatorIcon');
  const text = document.getElementById('modeIndicatorText');
  if (!icon && !text) return;
  const label = mode === 'sequence' ? 'Sequence Mode' : 'Position Mode';
  if (icon) icon.src = MODE_ICONS[mode] ?? MODE_ICONS.position;
  if (text) text.textContent = label;
}

// ---------- Save State ----------
// Load saved progress if it exists
let saved = null;
try {
  saved = JSON.parse(localStorage.getItem('goVizProgress') || 'null');
} catch (_err) {
  saved = null;
}
const continueBtn = document.getElementById('continueBtn');
const startBtn = document.getElementById('startBtn');
const confirmModal = document.getElementById('confirmModal');
const confirmYes = document.getElementById('confirmYes');
const confirmNo = document.getElementById('confirmNo');
const settingsBtn = document.getElementById('settingsBtn');
const settingsHomeBtn = document.getElementById('settingsHomeBtn');
const tapModeInputs = document.querySelectorAll('input[name="tapMode"]');
const goldElement = document.getElementById('goldValue');

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

if (saved && typeof saved === 'object') {
  window.progress = normalizeProgress(saved.progress);
  const savedGold = Number(saved.gold);
  const legacyGold = Number(saved.score);
  const resolvedGold = Number.isFinite(savedGold)
    ? savedGold
    : Number.isFinite(legacyGold)
    ? legacyGold
    : 0;
  gameState.gold = resolvedGold;

  // update the gold display on screen
  if (goldElement) {
    goldElement.textContent = gameState.gold;
  }
} else {
  window.progress = normalizeProgress();
  gameState.gold = 0; // ensure gold starts at 0 for new games
}
refreshHomeButtons();
updateBonusAvailability();

const resetStateParams = {
  localStorage,
  PLAYER_PROGRESS_KEY,
  CHALLENGE_ATTEMPTS_KEY,
  saveDifficultyState,
  renderSkillRating: (rating) => renderSkillRatingAll(rating, rating),
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
  goldElement,
};

// Continue existing game, straight to maingame
continueBtn.addEventListener('click', () => {
  levelSelectController?.hide();
  showMainScreen({ mainGame, show: difficulty, hide: intro, showScreen });
});

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
    levelSelectController?.resetSelection();
    nextPuzzleSuggestion = null;
  }
});

confirmYes.addEventListener('click', () => {
  confirmModal.classList.remove('active');
  const resetResult = resetGameStateUI(resetStateParams);
  difficultyState = resetResult.difficultyState;
  playerProgress = resetResult.playerProgress;
  challengeAttempts = resetResult.challengeAttempts;
  levelSelectController?.resetSelection();
  nextPuzzleSuggestion = null;
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

levelSelectController = createLevelSelectController({
  introEl: intro,
  difficultyEl: difficulty,
  mainGameEl: mainGame,
  showScreen,
  setMode: (mode) => {
    currentMode = mode;
    window.currentMode = mode;
  },
  setNextPuzzleSuggestion: (selection) => {
    nextPuzzleSuggestion = selection;
  },
  startGame: (mode) => startGame(mode),
  getSkillRating: () => difficultyState?.rating ?? 0,
  getPlayerProgress: () => playerProgress,
});

intro.classList.add('active');

document.getElementById('homeBtn').onclick = () => {
  levelSelectController?.hide();
  showScreen(intro, difficulty);
};

// ---------- Difficulty Selection ----------
document.querySelectorAll('.diffBtn').forEach((b) => {
  b.onclick = () => {
    showGoldBadge();
    showSkillBadge();
    levelSelectController?.open(b.dataset.mode);
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
  levelSelectController?.hide();
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

// ---------- Main Game ----------
async function startGame(mode) {
  showGoldBadge();
  showSkillBadge();
  const manualSelection = levelSelectController?.getSelection?.();
  if (manualSelection) {
    nextPuzzleSuggestion = {
      boardSize: manualSelection.boardSize,
      stoneCount: manualSelection.stoneCount,
    };
  }

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
      renderSkillRatingAll(rating, difficultyState?.rating),
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
    deductPoints: deductGold,
    tutorialController,
    showTimerToast,
    flashGoldWarning,
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

  levelSelectController?.updateHeader({
    activeGame: window.activeGame,
    mode,
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
      const selected = levelSelectController?.getSelection?.();
      if (selected) {
        nextPuzzleSuggestion = {
          boardSize: selected.boardSize,
          stoneCount: selected.stoneCount,
        };
        return;
      }
      nextPuzzleSuggestion = next;
    },
    currentMode,
    activeGame: window.activeGame,
  });
  window.recordDifficultyOutcome = (timedOut) => {
    const ratingBefore = difficultyState?.rating ?? 0;
    const result = recordDifficultyOutcome(timedOut);
    const ratingAfter =
      result?.difficultyState?.rating ?? difficultyState?.rating ?? ratingBefore;
    if (result?.difficultyState) {
      difficultyState = result.difficultyState;
    }
    renderSkillRatingAll(ratingAfter, ratingAfter);
    levelSelectController?.handleRatingChange?.({
      ratingBefore,
      ratingAfter,
      activeGame: window.activeGame,
    });
    return result;
  };

  const handleCheckAnswers = createCheckAnswersHandler({
    timerUI,
    config,
    stones,
    currentMode,
    speedMultiplier,
    MAX_SPEED_BONUS_THRESHOLD,
    freezeBarState,
    addGold,
    logSkillRatingDebug,
    getTimeLeft: () => timerFlow.getTimeLeft(),
  });
  checkBtn.onclick = handleCheckAnswers;
}
