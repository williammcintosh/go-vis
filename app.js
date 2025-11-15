import { launchConfetti } from './anim.js';

const intro = document.getElementById('intro');
const difficulty = document.getElementById('difficulty');
const mainGame = document.getElementById('mainGame');
const aboutModal = document.getElementById('aboutModal');
let currentMode = 'easy';
let isRefilling = false;
let canUseEyeGlass = false;
const DOUBLE_TAP_WINDOW = 300;
const SPEED_BOOST_MULTIPLIER = 20;
const TUTORIAL_KEY = 'goVizTutorialDone';
const TUTORIAL_SKIP_OFFSET = 36;
let speedMultiplier = 1;
let lastTap = 0;
let addTimeHandler = null;
let eyeGlassHandler = null;
const tutorialController = createTutorialController();

window.progress = window.progress || {
  easy: { level: 1 },
  hard: { level: 10 }, // start hard mode farther in
};
const ANIM_DELAY = 600;
const DEDUCT_TARGET_ID = 'scoreValue';
const BONUS_COST = 500;

// ---------- Dynamic Level Generation ----------
const gameState = {
  currentLevel: 1,
  currentRound: 1,
  totalRounds: 10,
  levels: [],
};
gameState.score = gameState.score || 0;

const base = { stones: 5, board: 4, time: 20 };

for (let i = 1; i <= 50; i++) {
  const boardSize = base.board + Math.floor((i - 1) / 5);
  const stones = base.stones + (i - 1);
  const time = Math.max(5, base.time - (i - 1));
  gameState.levels.push({
    level: i,
    stones,
    boardSize,
    time,
    rounds: 10,
  });
}

// ---------- Save State ----------
// Load saved progress if it exists
const saved = JSON.parse(localStorage.getItem('goVizProgress') || 'null');
const continueBtn = document.getElementById('continueBtn');
const startBtn = document.getElementById('startBtn');
const confirmModal = document.getElementById('confirmModal');
const confirmYes = document.getElementById('confirmYes');
const confirmNo = document.getElementById('confirmNo');

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

function handleDoubleTap(event) {
  if (
    !window.activeGame?.timer ||
    isRefilling ||
    tutorialController.shouldIgnoreDoubleTap()
  ) {
    return;
  }

  if (event.type === 'dblclick') {
    speedMultiplier = SPEED_BOOST_MULTIPLIER;
    return;
  }

  const now = Date.now();
  const isDoubleTap = now - lastTap < DOUBLE_TAP_WINDOW;
  if (isDoubleTap) {
    if (event.cancelable) {
      event.preventDefault();
    }
    speedMultiplier = SPEED_BOOST_MULTIPLIER;
  }
  lastTap = now;
}

function preventPinchZoom(event) {
  if (event.touches && event.touches.length > 1 && event.cancelable) {
    event.preventDefault();
  }
}

function initDoubleTapListeners() {
  document.body.addEventListener('touchend', handleDoubleTap, {
    passive: false,
  });
  document.body.addEventListener('dblclick', handleDoubleTap);
  document.body.addEventListener('touchstart', preventPinchZoom, {
    passive: false,
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDoubleTapListeners);
} else {
  initDoubleTapListeners();
}

if (saved) {
  window.progress = saved.progress;
  gameState.currentRound = saved.round || 1;
  gameState.score = saved.score || 0; // restore saved score or default to 0

  // update the score display on screen
  document.getElementById('scoreValue').textContent = gameState.score;
} else {
  gameState.score = 0; // ensure score starts at 0 for new games
}
refreshHomeButtons();
updateBonusAvailability();

// Continue existing game, straight to maingame
continueBtn.addEventListener('click', () => {
  intro.classList.remove('active');
  mainGame.style.display = 'block';
  startGame('easy');
});

// Restart confirmation
startBtn.addEventListener('click', () => {
  const hasSave = localStorage.getItem('goVizProgress');
  if (hasSave) {
    confirmModal.classList.add('active');
  } else {
    localStorage.removeItem('goVizProgress');
    window.progress = { easy: { level: 1 }, hard: { level: 10 } };
    gameState.currentRound = 1;

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
  window.progress = { easy: { level: 1 }, hard: { level: 10 } };
  gameState.currentRound = 1;

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
    difficulty.classList.remove('active');
    mainGame.style.display = 'block';
    startGame(currentMode);
  };
});

// ---------- About Page Selection ----------
document.getElementById('aboutBtn').addEventListener('click', () => {
  showScreen(aboutModal, intro);
});

document.getElementById('aboutHomeBtn').addEventListener('click', () => {
  showScreen(intro, aboutModal);
});

// ---------- Game Library ----------
const GAME_LIBRARY_PATH = './games/OGS_mini_boards.json';
let cachedGameLibrary = null;
let gameLibraryPromise = null;
const lastGameByBoard = {};

async function loadGameLibrary() {
  if (cachedGameLibrary) return cachedGameLibrary;
  if (!gameLibraryPromise) {
    gameLibraryPromise = fetch(`${GAME_LIBRARY_PATH}?_=${Math.random()}`, {
      cache: 'no-store',
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load games (${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        cachedGameLibrary = data;
        return data;
      });
  }
  return gameLibraryPromise;
}

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

async function selectGameForLevel(targetSize, stoneCount) {
  const library = await loadGameLibrary();
  const boardKey = determineBoardKey(library, targetSize);
  if (!boardKey || !Array.isArray(library[boardKey])) {
    throw new Error(`No games available for ${targetSize}x${targetSize}`);
  }
  const games = library[boardKey];
  const candidates = games.filter((game) => game.num_moves >= stoneCount);
  const pool = candidates.length ? candidates : games;
  if (!pool.length) {
    throw new Error(`No games found for ${boardKey}`);
  }
  let selected = pool[0];
  if (pool.length > 1) {
    let attempts = 0;
    do {
      selected = pool[Math.floor(Math.random() * pool.length)];
      attempts++;
    } while (
      pool.length > 1 &&
      selected &&
      selected.game_id === lastGameByBoard[boardKey] &&
      attempts < 10
    );
  }
  lastGameByBoard[boardKey] = selected?.game_id;
  return { boardKey, game: selected };
}

function parseSGFMoves(moveSource, limit = 5) {
  const moves = [];
  const parseCoords = (coordsRaw) => {
    if (!coordsRaw) return null;
    const coords = coordsRaw.toLowerCase();
    if (coords.length < 2 || coords === '..') return null;
    const x = coords.charCodeAt(0) - 97;
    const y = coords.charCodeAt(1) - 97;
    if (Number.isNaN(x) || Number.isNaN(y)) return null;
    return { x, y };
  };
  const addMove = (colorChar, coordsRaw) => {
    if (moves.length >= limit) return;
    const coords = parseCoords(coordsRaw);
    if (!coords) return;
    const color = colorChar === 'B' ? 'black' : 'white';
    moves.push({ x: coords.x, y: coords.y, color });
  };

  if (Array.isArray(moveSource)) {
    for (const move of moveSource) {
      if (moves.length >= limit) break;
      const match = /([BW])\[([a-zA-Z]{0,2})\]/.exec(move);
      if (!match) continue;
      addMove(match[1], match[2]);
    }
    return moves;
  }

  const clean = (moveSource || '').replace(/\s+/g, '');
  const moveRegex = /[;\(]*([BW])\[(..)\]/gi;
  let match;
  while ((match = moveRegex.exec(clean)) !== null && moves.length < limit) {
    addMove(match[1], match[2]);
  }
  return moves;
}

// ---------- Button Listeners ----------
const nextBtn = document.getElementById('nextBtn');
const retryBtn = document.getElementById('retryBtn');
const homeBtn2 = document.getElementById('homeBtn2');

retryBtn.addEventListener('click', async () => {
  const feedback = document.getElementById('feedback');
  feedback.style.display = 'none';
  feedback.classList.remove('show');
  updateBonusAvailability();
  if (window.activeGame?.timer) {
    speedMultiplier = 1;
    clearInterval(window.activeGame.timer);
  }
  document.getElementById('board').replaceChildren();
  document.querySelectorAll('.marker').forEach((m) => m.remove());
  startGame(window.activeGame.mode, true);
});

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
  document.getElementById('timerContainer').classList.remove('hidden');
  document.getElementById('board').replaceChildren();
  document.querySelectorAll('.marker').forEach((m) => m.remove());
  await startGame(window.activeGame.mode);
};

function addScore(retryCount = 0) {
  const scoreEl = document.getElementById('scoreDisplay');
  const scoreValueEl = document.getElementById('scoreValue');
  const feedbackMsgEl = document.getElementById('feedbackMsg');
  const mainGame = document.getElementById('mainGame');
  const reactionTime = window.activeGame?.reactionTime || 10000;

  // set up scoring curve
  const base = 4000; // fast reaction
  const slow = 10000; // slow reaction
  const minPoints = 100;
  const maxPoints = 1000;

  let factor =
    1 - Math.min(1, Math.max(0, (reactionTime - base) / (slow - base)));
  const points = Math.floor(minPoints + factor * (maxPoints - minPoints));

  gameState.score += points;

  const startRect =
    feedbackMsgEl?.getBoundingClientRect() ||
    scoreValueEl.getBoundingClientRect();
  const endRect = scoreValueEl.getBoundingClientRect();

  const start = {
    x: startRect.left + startRect.width / 2,
    y: startRect.top + startRect.height / 2,
  };

  const end = {
    x: endRect.left + endRect.width / 2,
    y: endRect.top + endRect.height / 2,
  };

  const float = document.createElement('div');
  float.className = 'score-float score-float--reward';
  float.textContent = `+${points}`;
  float.style.transform = `translate(${start.x}px, ${start.y}px) scale(0.9)`;
  document.body.appendChild(float);

  const animationDuration = 1000;
  const animation = float.animate(
    [
      {
        transform: `translate(${start.x}px, ${start.y}px) scale(0.85)`,
        opacity: 0,
      },
      {
        transform: `translate(${start.x}px, ${start.y - 25}px) scale(1.1)`,
        opacity: 1,
        offset: 0.25,
      },
      {
        transform: `translate(${end.x}px, ${end.y}px) scale(0.9)`,
        opacity: 0,
      },
    ],
    {
      duration: animationDuration,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'forwards',
    }
  );

  let settled = false;
  const finalizeAddition = () => {
    if (settled) return;
    settled = true;
    float.remove();
    scoreValueEl.textContent = gameState.score;
    scoreEl.style.animation = 'scorePulse 0.5s ease';
    setTimeout(() => (scoreEl.style.animation = ''), ANIM_DELAY);
    updateBonusAvailability();

    localStorage.setItem(
      'goVizProgress',
      JSON.stringify({
        progress: window.progress,
        round: gameState.currentRound,
        score: gameState.score,
      })
    );
    refreshHomeButtons();
  };

  animation.addEventListener('finish', finalizeAddition);
  setTimeout(finalizeAddition, animationDuration + 100);
}

// =========== Dynamic Movement ============= //
function deductPoints(cost, sourceElement) {
  const scoreDisplay = document.getElementById('scoreDisplay');
  const scoreValue = document.getElementById('scoreValue');
  const startRect = sourceElement.getBoundingClientRect();
  const endRect = scoreValue.getBoundingClientRect();

  const start = {
    x: startRect.left + startRect.width / 2,
    y: startRect.top + startRect.height / 2,
  };

  const end = {
    x: endRect.left + endRect.width / 2,
    y: endRect.top + endRect.height / 2,
  };

  const float = document.createElement('div');
  float.className = 'score-float score-float--deduct';
  float.textContent = `-${cost}`;
  float.style.transform = `translate(${start.x}px, ${start.y}px) scale(1)`;
  document.body.appendChild(float);

  const animationDuration = 900;
  const animation = float.animate(
    [
      {
        transform: `translate(${start.x}px, ${start.y}px) scale(0.9)`,
        opacity: 0,
      },
      {
        transform: `translate(${start.x}px, ${start.y - 20}px) scale(1.05)`,
        opacity: 1,
        offset: 0.2,
      },
      {
        transform: `translate(${end.x}px, ${end.y}px) scale(0.6)`,
        opacity: 0,
      },
    ],
    {
      duration: animationDuration,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'forwards',
    }
  );

  gameState.score -= cost;

  let settled = false;
  const finalizeDeduction = () => {
    if (settled) return;
    settled = true;
    float.remove();
    scoreValue.textContent = gameState.score;
    scoreDisplay.style.animation = 'scoreDeduct 0.5s ease';
    setTimeout(() => (scoreDisplay.style.animation = ''), ANIM_DELAY);
    updateBonusAvailability();

    localStorage.setItem(
      'goVizProgress',
      JSON.stringify({
        progress: window.progress,
        round: gameState.currentRound,
        score: gameState.score,
      })
    );
    refreshHomeButtons();
  };

  animation.addEventListener('finish', finalizeDeduction);
  setTimeout(finalizeDeduction, animationDuration + 100);
}

function flashScoreWarning() {
  const scoreValueEl = document.getElementById('scoreValue');
  if (!scoreValueEl) return;
  scoreValueEl.classList.remove('score-alert');
  void scoreValueEl.offsetWidth;
  scoreValueEl.classList.add('score-alert');
}

function isFeedbackVisible() {
  const feedback = document.getElementById('feedback');
  return Boolean(feedback?.classList.contains('show'));
}

function setBonusState(button, enabled) {
  if (!button) return;
  button.classList.toggle('disabled', !enabled);
  button.setAttribute('aria-disabled', String(!enabled));
}

function updateBonusAvailability() {
  const addTime = document.getElementById('addTimeBonus');
  const eyeGlass = document.getElementById('eyeGlassBonus');

  if (!addTime || !eyeGlass) return;

  const canAffordBonus = gameState.score >= BONUS_COST;
  const timerIsRunning = Boolean(window.activeGame?.timer);
  const feedbackActive = isFeedbackVisible();

  setBonusState(
    addTime,
    !feedbackActive && canAffordBonus && !isRefilling && timerIsRunning
  );
  setBonusState(
    eyeGlass,
    !feedbackActive && canAffordBonus && canUseEyeGlass && !isRefilling
  );
}

// ---------- Main Game ----------
async function startGame(mode, retry = false) {
  if (!retry) window.activeGame = { mode };

  // Keeps track of whether or not there was a retry
  window.activeGame.isRetry = retry;

  speedMultiplier = 1;
  lastTap = 0;

  const level = window.progress[mode].level;
  const levelConfig = gameState.levels[level - 1] || gameState.levels[0];
  const currentLevel = window.progress[mode].level;
  gameState.currentLevel = currentLevel || 1;

  document.getElementById(
    'levelText'
  ).textContent = `Level ${gameState.currentLevel}`;
  document.getElementById(
    'roundText'
  ).textContent = `Round ${gameState.currentRound}/${gameState.totalRounds}`;

  const config = {
    intervalSpeed: mode === 'hard' ? 50 : 40,
    stoneCount: levelConfig.stones,
    size: levelConfig.boardSize,
    time: levelConfig.time,
  };

  const board = document.getElementById('board');
  board.replaceChildren();
  document.querySelectorAll('.marker').forEach((m) => m.remove());
  document.documentElement.style.setProperty('--board-size', config.size);

  const checkBtn = document.getElementById('checkBtn');
  const timerContainer = document.getElementById('timerContainer');

  checkBtn.classList.remove('show');
  timerContainer.classList.remove('hidden');
  timerContainer.style.visibility = 'visible';

  const addTimeBonus = document.getElementById('addTimeBonus');
  const eyeGlassBonus = document.getElementById('eyeGlassBonus');

  // At start: timer is active, so eyeGlass disabled
  canUseEyeGlass = false;
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
    isRefilling = true;
    addTimeBonus.classList.add('disabled');
    updateBonusAvailability();
    deductPoints(BONUS_COST, addTimeBonus);
    tutorialController.onAddTimeUsed();

    const timerBar = document.getElementById('timerBar');
    const duration = 800;
    const holdTime = 600;
    const startWidth = parseFloat(timerBar.style.width) || 0;
    const startTime = performance.now();

    const savedTimer = window.activeGame.timer;
    clearInterval(window.activeGame.timer);
    window.activeGame.timer = null;

    const animateUp = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const currentWidth = startWidth + (100 - startWidth) * progress;
      timerBar.style.width = currentWidth + '%';

      if (progress < 1) {
        requestAnimationFrame(animateUp);
      } else {
        setTimeout(() => {
          timeLeft = config.time;
          window.activeGame.timer = savedTimer;
          window.activeGame.timer = setInterval(() => {
            timeLeft -= 0.1 * speedMultiplier;
            timerBar.style.width = (timeLeft / config.time) * 100 + '%';
            if (timeLeft <= 0 && window.activeGame.timer) {
              clearInterval(window.activeGame.timer);
              window.activeGame.timer = null;
              speedMultiplier = 1;
              window.activeGame.timerEndTime = Date.now();
              clearStones();
              toggleInteraction(true);
              addTimeBonus.classList.add('disabled');
              timerBar.style.width = '0%';
              timerBar.addEventListener(
                'transitionend',
                () => {
                  isRefilling = false;
                  updateBonusAvailability();
                },
                { once: true }
              );
              setTimeout(() => {
                timerContainer.classList.add('hidden');
                checkBtn.classList.add('show');
                canUseEyeGlass = true;
                updateBonusAvailability();
              }, 100);
            }
          }, config.intervalSpeed);

          isRefilling = false;
          addTimeBonus.classList.remove('disabled'); // re-enable
          updateBonusAvailability();
        }, holdTime);
      }
    };

    requestAnimationFrame(animateUp);
  };

  addTimeBonus.addEventListener('click', addTimeHandler);

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
    deductPoints(BONUS_COST, eyeGlassBonus);
    eyeGlassBonus.classList.add('disabled'); // stop spam

    // pick an unclicked correct stone
    const unclicked = stones.filter((s) => {
      const inter = document.querySelector(
        `.intersection[data-x="${s.x}"][data-y="${s.y}"]`
      );

      // figure out what the player currently has
      const playerHasWhite = inter.classList.contains('white');
      const playerHasBlack = inter.classList.contains('black');

      // return if player has no stone or the wrong color
      return (
        (!playerHasWhite && !playerHasBlack) ||
        (s.color === 'white' && !playerHasWhite) ||
        (s.color === 'black' && !playerHasBlack)
      );
    });

    if (unclicked.length === 0) {
      updateBonusAvailability();
      return;
    }

    const randomStone = unclicked[Math.floor(Math.random() * unclicked.length)];
    const inter = document.querySelector(
      `.intersection[data-x="${randomStone.x}"][data-y="${randomStone.y}"]`
    );

    // add a visual hint overlay
    const hint = document.createElement('div');
    hint.classList.add('hint-stone', randomStone.color);
    inter.appendChild(hint);

    // fade in/out animation
    hint.animate(
      [
        { opacity: 0 },
        { opacity: 1, offset: 0.2 },
        { opacity: 1, offset: 0.8 },
        { opacity: 0 },
      ],
      { duration: 1200, easing: 'ease-in-out' }
    );
  };

  eyeGlassBonus.addEventListener('click', eyeGlassHandler);

  const boardDimension = config.size + 1;
  let selectedGameInfo = null;
  if (retry && window.activeGame?.selectedGame) {
    selectedGameInfo = {
      boardKey: window.activeGame.boardKey,
      game: window.activeGame.selectedGame,
    };
  }
  if (!selectedGameInfo) {
    selectedGameInfo = await selectGameForLevel(
      boardDimension,
      config.stoneCount
    );
  }
  const { boardKey, game: selectedGame } = selectedGameInfo;
  window.activeGame.selectedGame = selectedGame;
  window.activeGame.boardKey = boardKey;
  const stones = parseSGFMoves(selectedGame.sgf_moves, config.stoneCount);
  drawBoard(config.size);

  // Countdown
  const timerBar = document.getElementById('timerBar');
  let timeLeft = config.time;
  const adjustTimeBy = (delta) => {
    timeLeft = Math.min(config.time, Math.max(0, timeLeft + delta));
    timerBar.style.width = (timeLeft / config.time) * 100 + '%';
  };
  toggleInteraction(false);
  if (window.activeGame?.timer) {
    speedMultiplier = 1;
    clearInterval(window.activeGame.timer);
  }

  stones.forEach((s) => {
    const inter = document.querySelector(
      `.intersection[data-x="${s.x}"][data-y="${s.y}"]`
    );
    if (inter) inter.classList.add(s.color);
  });

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
  });

  window.activeGame.timer = setInterval(() => {
    if (tutorialController.shouldHoldTimer()) {
      return;
    }
    timeLeft -= 0.1 * speedMultiplier;
    timerBar.style.width = (timeLeft / config.time) * 100 + '%';
    tutorialController.onTimerTick(timeLeft / config.time);
    if (timeLeft <= 0 && window.activeGame.timer && !isRefilling) {
      // guard so it fires once
      clearInterval(window.activeGame.timer);
      window.activeGame.timer = null;
      speedMultiplier = 1; // reset here

      window.activeGame.timerEndTime = Date.now();

      clearStones();
      toggleInteraction(true);

      // disable AddTime / enable EyeGlass
      addTimeBonus.classList.add('disabled');
      updateBonusAvailability();

      timerBar.style.width = '0%';
      setTimeout(() => {
        timerContainer.classList.add('hidden');
        checkBtn.classList.add('show');
        if (!isRefilling) {
          canUseEyeGlass = true;
          updateBonusAvailability();
        }
      }, 100);
    }
  }, config.intervalSpeed);
  updateBonusAvailability();

  // ---------- Inner Helpers ----------

  function drawBoard(size) {
    for (let i = 0; i <= size; i++) {
      const v = document.createElement('div');
      v.classList.add('line', 'v');
      v.style.left = `${(i / size) * 100}%`;
      board.appendChild(v);
      const h = document.createElement('div');
      h.classList.add('line', 'h');
      h.style.top = `${(i / size) * 100}%`;
      board.appendChild(h);
    }
    for (let y = 0; y <= size; y++) {
      for (let x = 0; x <= size; x++) {
        const inter = document.createElement('div');
        inter.classList.add('intersection');
        inter.dataset.x = x;
        inter.dataset.y = y;
        inter.style.left = `${(x / size) * 100}%`;
        inter.style.top = `${(y / size) * 100}%`;
        inter.addEventListener('click', toggleStone);
        board.appendChild(inter);
      }
    }
  }

  function toggleInteraction(enable) {
    document.querySelectorAll('.intersection').forEach((i) => {
      i.style.pointerEvents = enable ? 'auto' : 'none';
    });
    checkBtn.disabled = !enable;
    checkBtn.style.opacity = enable ? '1' : '0.5';
  }

  function clearStones() {
    document
      .querySelectorAll('.intersection')
      .forEach((i) => i.classList.remove('black', 'white'));
  }

  function toggleStone(e) {
    const p = e.target;
    if (p.classList.contains('white')) p.classList.replace('white', 'black');
    else if (p.classList.contains('black')) p.classList.remove('black');
    else p.classList.add('white');
  }

  function checkAnswers() {
    // Record players reaction time
    window.activeGame.reactionTime =
      Date.now() - (window.activeGame.timerEndTime || Date.now());

    document.querySelectorAll('.marker').forEach((m) => m.remove());
    let allCorrect = true;

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
        if (!correct) allCorrect = false;
        inter.appendChild(marker);
      }
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

    const feedback = document.getElementById('feedback');
    const msg = document.getElementById('feedbackMsg');
    const nextBtn = document.getElementById('nextBtn');
    feedback.style.display = 'block';
    requestAnimationFrame(() => {
      feedback.classList.add('show');
      updateBonusAvailability();
    });

    if (levelIncreased) {
      msg.textContent = `Congrats! 🎉 Level ${window.progress[mode].level}!`;
      levelIncreased = false;
      launchConfetti();
      nextBtn.disabled = true;
      setTimeout(() => {
        addScore();
        nextBtn.disabled = false;
      }, ANIM_DELAY);
    } else if (allCorrect) {
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

      // Add score with delay for animation sync
      if (allCorrect) {
        nextBtn.disabled = true;

        if (!window.activeGame.isRetry) {
          setTimeout(() => {
            addScore();
            nextBtn.disabled = false;
          }, ANIM_DELAY);
        } else {
          // still wait a bit so the animation feels natural
          setTimeout(() => {
            nextBtn.disabled = false;
          }, ANIM_DELAY);
        }
      }
    } else {
      msg.textContent = 'Missed a few!';
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
      setHold(true);
      await showStep(
        context.board,
        '[1/5] Memorize the locations and colors of these five stones.',
        { placement: 'center', maxWidth: 360 }
      );
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
        '[5/5] If you need a hint, tap the eyeglass to reveal a random stone.',
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
