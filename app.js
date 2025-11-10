import { launchConfetti } from './anim.js';

const intro = document.getElementById('intro');
const difficulty = document.getElementById('difficulty');
const mainGame = document.getElementById('mainGame');
const aboutModal = document.getElementById('aboutModal');
let lastFile = null;
let currentMode = 'easy';

window.progress = window.progress || {
  easy: { level: 1 },
  hard: { level: 10 }, // start hard mode farther in
};

// ---------- Dynamic Level Generation ----------
const gameState = {
  currentLevel: 1,
  currentRound: 1,
  totalRounds: 10,
  levels: [],
};

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

if (saved) {
  window.progress = saved.progress;
  gameState.currentRound = saved.round;
  continueBtn.style.display = 'inline-block';
  startBtn.textContent = 'Restart';
} else {
  continueBtn.style.display = 'none';
  startBtn.textContent = 'Start';
}

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
    showScreen(difficulty, intro);
  }
});

confirmYes.addEventListener('click', () => {
  confirmModal.classList.remove('active');
  localStorage.removeItem('goVizProgress');
  window.progress = { easy: { level: 1 }, hard: { level: 10 } };
  gameState.currentRound = 1;
  showScreen(difficulty, intro);
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

// ---------- SGF Loader ----------
async function loadRandomSGF() {
  const files = [
    '80941137-023-Hai1234-wmm_co_nz.sgf',
    '80948461-015-hyzmcg-wmm_co_nz.sgf',
    '80970815-010-謝安桓衝-wmm_co_nz.sgf',
    '80971474-031-le go at-wmm_co_nz.sgf',
  ];
  let randomIndex;
  do {
    randomIndex = Math.floor(Math.random() * files.length);
  } while (files[randomIndex] === lastFile && files.length > 1);
  const randomFile = files[randomIndex];
  lastFile = randomFile;
  const response = await fetch(`./games/${randomFile}?_=${Math.random()}`, {
    cache: 'no-store',
  });
  return await response.text();
}

function parseSGFMoves(sgfText, limit = 5) {
  const moves = [];
  const clean = sgfText.replace(/\s+/g, '');
  const moveRegex = /[;\(]*([BW])\[(..)\]/gi;
  let match;
  while ((match = moveRegex.exec(clean)) !== null && moves.length < limit) {
    const color = match[1] === 'B' ? 'black' : 'white';
    const coords = match[2].toLowerCase();
    if (coords.trim() === '' || coords === '..') continue;
    const x = coords.charCodeAt(0) - 97;
    const y = coords.charCodeAt(1) - 97;
    moves.push({ x, y, color });
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
  if (window.activeGame?.timer) {
    speedMultiplier = 1;
    clearInterval(window.activeGame.timer);
  }
  document.getElementById('board').replaceChildren();
  document.querySelectorAll('.marker').forEach((m) => m.remove());
  await startGame(window.activeGame.mode);
};

// ---------- Main Game ----------
async function startGame(mode, retry = false) {
  if (!retry) window.activeGame = { mode };

  let speedMultiplier = 1;
  let lastTap = 0;

  const level = window.progress[mode].level;
  const levelConfig = gameState.levels[level - 1] || gameState.levels[0];
  const currentLevel = window.progress[mode].level;
  gameState.currentLevel = currentLevel || 1;
  const info = document.getElementById('levelInfo');
  info.textContent = `Level ${gameState.currentLevel} – Round ${gameState.currentRound} of ${gameState.totalRounds}`;

  console.log(`=== START ${mode.toUpperCase()} | Level ${level} ===`);
  console.log(levelConfig);

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
  timerContainer.style.display = 'block';

  const sgfText =
    retry && window.activeGame?.sgfText
      ? window.activeGame.sgfText
      : await loadRandomSGF();

  window.activeGame.sgfText = sgfText;
  const stones = parseSGFMoves(sgfText, config.stoneCount);
  drawBoard(config.size);

  // Countdown
  const timerBar = document.getElementById('timerBar');
  let timeLeft = config.time;
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

  window.activeGame.timer = setInterval(() => {
    timeLeft -= 0.1 * speedMultiplier;
    timerBar.style.width = (timeLeft / config.time) * 100 + '%';
    if (timeLeft <= 0 && window.activeGame.timer) {
      // guard so it fires once
      clearInterval(window.activeGame.timer);
      window.activeGame.timer = null;
      speedMultiplier = 1; // reset here
      document.body.removeEventListener('touchend', handleDoubleTap);
      document.body.removeEventListener('dblclick', handleDoubleTap);

      clearStones();
      toggleInteraction(true);
      timerContainer.style.display = 'none';
      checkBtn.classList.add('show');
    }
  }, config.intervalSpeed);

  // ---------- Inner Helpers ----------
  // Double-tap to skip timer (active only while timer runs)
  document.body.removeEventListener('touchend', window._handleDoubleTap);
  document.body.removeEventListener('dblclick', window._handleDoubleTap);

  // store globally so we can remove it next round
  window._handleDoubleTap = handleDoubleTap;

  function handleDoubleTap() {
    const now = Date.now();
    if (now - lastTap < 300 && window.activeGame?.timer) {
      // temporarily speed things up 5x
      speedMultiplier = 20;
    }
    lastTap = now;
  }

  document.body.addEventListener('touchend', handleDoubleTap);
  document.body.addEventListener('dblclick', handleDoubleTap);

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

    // Save progress locally
    localStorage.setItem(
      'goVizProgress',
      JSON.stringify({
        progress: window.progress,
        round: gameState.currentRound,
      })
    );

    const feedback = document.getElementById('feedback');
    const msg = document.getElementById('feedbackMsg');
    const nextBtn = document.getElementById('nextBtn');
    feedback.style.display = 'block';
    requestAnimationFrame(() => feedback.classList.add('show'));

    if (levelIncreased) {
      msg.textContent = `Congrats! 🎉 Level ${window.progress[mode].level}!`;
      levelIncreased = false;
      launchConfetti();
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
