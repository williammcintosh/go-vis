const intro = document.getElementById('intro');
const difficulty = document.getElementById('difficulty');
const mainGame = document.getElementById('mainGame');
const aboutModal = document.getElementById('aboutModal');
let lastFile = null;
let currentMode = 'easy';

window.progress = window.progress || {
  easy: { level: 1 },
  hard: { level: 1 },
};

// utility
function showScreen(show, hide) {
  hide.classList.remove('active');
  show.classList.add('active');
}

intro.classList.add('active'); // start with intro visible

document.getElementById('trainBtn').onclick = () => {
  showScreen(difficulty, intro);
};

document.getElementById('homeBtn').onclick = () => {
  showScreen(intro, difficulty);
};

document.querySelectorAll('.diffBtn').forEach((b) => {
  b.onclick = () => {
    currentMode = b.dataset.mode; // remember the chosen mode
    difficulty.classList.remove('active');
    mainGame.style.display = 'block';
    startGame(b.dataset.mode);
  };
});

async function loadRandomSGF() {
  // just add new filenames here as you add SGFs
  const files = [
    '80941137-023-Hai1234-wmm_co_nz.sgf',
    '80948461-015-hyzmcg-wmm_co_nz.sgf',
    '80970815-010-謝安桓衝-wmm_co_nz.sgf',
    '80971474-031-le go at-wmm_co_nz.sgf',
  ];

  // pick a random index that isn't the same as last time
  let randomIndex;
  do {
    randomIndex = Math.floor(Math.random() * files.length);
  } while (files[randomIndex] === lastFile && files.length > 1);

  const randomFile = files[randomIndex];
  lastFile = randomFile;

  // force a cache-busting fetch
  const response = await fetch(`./games/${randomFile}?_=${Math.random()}`, {
    cache: 'no-store',
  });

  const sgfText = await response.text();

  //   console.log('Selected SGF file:', randomFile); // <- you’ll see different ones now
  return sgfText;
}

function parseSGFMoves(sgfText, limit = 5) {
  const moves = [];

  // Flatten line breaks, tabs, spaces
  const clean = sgfText.replace(/\s+/g, '');

  // Match both ;B[aa] and (;W[bb] variants
  const moveRegex = /[;\(]*([BW])\[(..)\]/gi;
  let match;

  while ((match = moveRegex.exec(clean)) !== null && moves.length < limit) {
    const color = match[1] === 'B' ? 'black' : 'white';
    const coords = match[2].toLowerCase();

    // skip empty moves like "[]"
    if (coords.trim() === '' || coords === '..') continue;

    const x = coords.charCodeAt(0) - 97; // 'a' → 0
    const y = coords.charCodeAt(1) - 97;

    moves.push({ x, y, color });
  }
  //   console.log('Parsed moves count:', moves.length);
  //   console.log('Parsed moves:', moves);
  return moves;
}

// ================ LISTENERS ======================== //

const nextBtn = document.getElementById('nextBtn');

const retryBtn = document.getElementById('retryBtn');
retryBtn.addEventListener('click', async () => {
  const feedback = document.getElementById('feedback');
  feedback.style.display = 'none';
  feedback.classList.remove('show');
  setTimeout(() => (feedback.style.display = 'none'), 300);

  // Clear any leftover timers or markers
  if (window.activeGame?.timer) {
    clearInterval(window.activeGame.timer);
    window.activeGame.timer = null;
  }
  document.getElementById('board').replaceChildren();
  document.querySelectorAll('.marker').forEach((m) => m.remove());

  // Restart the same mode and sgf file
  window.activeGame.sgfText = window.activeGame.sgfText; // keep the same one
  startGame(window.activeGame.mode, true);
});

const homeBtn2 = document.getElementById('homeBtn2');
homeBtn2.addEventListener('click', () => {
  const feedback = document.getElementById('feedback');
  feedback.style.display = 'none';
  feedback.classList.remove('show');

  // Stop any active timer
  if (window.activeGame?.timer) {
    clearInterval(window.activeGame.timer);
    window.activeGame.timer = null;
  }

  // Hide the game and show the intro screen
  mainGame.style.display = 'none';
  showScreen(intro, difficulty);
});

nextBtn.onclick = async () => {
  const feedback = document.getElementById('feedback');
  feedback.classList.remove('show');
  feedback.style.display = 'none';

  // kill timer
  if (window.activeGame?.timer) {
    clearInterval(window.activeGame.timer);
    window.activeGame.timer = null;
  }

  // clear board
  const board = document.getElementById('board');
  board.replaceChildren();
  document.querySelectorAll('.marker').forEach((m) => m.remove());

  // start next challenge
  await startGame(window.activeGame.mode);
};

// nextBtn.onclick = null;

retryBtn.onclick = () => startGame(window.activeGame.mode, true);
retryBtn.onclick = null;

async function startGame(mode, retry = false) {
  console.trace('startGame CALLED');

  window.activeGame = { mode };
  const level = window.progress[mode].level;

  console.log(`=== START GAME (${mode.toUpperCase()}) ===`);
  console.log(`Current level: ${level}`);

  // scale with level
  let stoneCount = mode === 'hard' ? 10 : 5;
  let size = 4; // 4x4 squares = 5x5 intersections

  // every 3 levels, bump stone count
  if (level > 3) stoneCount += Math.floor((level - 1) / 3) * 2;

  // every 5 levels, bump board size
  if (level >= 1 && level <= 5) size = 4;
  else if (level >= 6 && level <= 10) size = 5;
  else if (level >= 11 && level <= 15) size = 6;
  else size = 7; // optional, if you want it to keep growing later

  console.log(`Configured board size: ${size}x${size}`);
  console.log(`Stone count: ${stoneCount}`);

  const config = {
    intervalSpeed: mode === 'hard' ? 50 : 40,
    stoneCount,
    size,
  };

  // update CSS variable
  document.documentElement.style.setProperty('--board-size', size);

  // Kill any old game state
  if (window.activeGame?.timer) {
    clearInterval(window.activeGame.timer);
    window.activeGame.timer = null;
  }

  const board = document.getElementById('board');
  board.replaceChildren(); // completely wipes old intersections, lines, stones
  await new Promise((resolve) => requestAnimationFrame(resolve)); // force DOM repaint

  document.querySelectorAll('.marker').forEach((m) => m.remove());

  document.documentElement.style.setProperty('--board-size', size);

  const checkBtn = document.getElementById('checkBtn');
  const timerContainer = document.getElementById('timerContainer');

  checkBtn.classList.remove('show');
  timerContainer.style.display = 'block';

  let stones = [];
  let interactionEnabled = false;

  //   board.innerHTML = ''; // clear any previous board before loading new one

  const sgfText =
    retry && window.activeGame?.sgfText
      ? window.activeGame.sgfText
      : await loadRandomSGF();
  window.activeGame.sgfText = sgfText;
  stones = parseSGFMoves(sgfText, config.stoneCount);

  function drawBoard() {
    for (let i = 0; i <= size; i++) {
      const vLine = document.createElement('div');
      vLine.classList.add('line', 'v');
      vLine.style.left = `${(i / size) * 100}%`;
      board.appendChild(vLine);

      const hLine = document.createElement('div');
      hLine.classList.add('line', 'h');
      hLine.style.top = `${(i / size) * 100}%`;
      board.appendChild(hLine);
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
    interactionEnabled = enable;
    document.querySelectorAll('.intersection').forEach((i) => {
      i.style.pointerEvents = enable ? 'auto' : 'none';
    });
    checkBtn.disabled = !enable;
    checkBtn.style.opacity = enable ? '1' : '0.5';
    checkBtn.style.cursor = enable ? 'pointer' : 'not-allowed';
  }

  function showStones() {
    // console.log('Active stones:', JSON.stringify(stones));

    const timerBar = document.getElementById('timerBar');
    let timeLeft = 10;
    toggleInteraction(false);

    // Clear any old timers first
    if (window.activeGame?.timer) {
      clearInterval(window.activeGame.timer);
    }

    // Show the stones
    stones.forEach((s) => {
      const inter = document.querySelector(
        `.intersection[data-x="${s.x}"][data-y="${s.y}"]`
      );
      if (inter) inter.classList.add(s.color);
    });

    // Start countdown
    window.activeGame.timer = setInterval(() => {
      timeLeft -= 0.1;
      timerBar.style.width = (timeLeft / 10) * 100 + '%';
      if (timeLeft <= 0) {
        clearInterval(window.activeGame.timer);
        window.activeGame.timer = null;
        clearStones();
        toggleInteraction(true);

        timerContainer.style.display = 'none';
        checkBtn.classList.add('show');
      }
    }, config.intervalSpeed);
  }

  function clearStones() {
    document
      .querySelectorAll('.intersection')
      .forEach((i) => i.classList.remove('black', 'white'));
  }

  function toggleStone(e) {
    if (!interactionEnabled) return;
    const point = e.target;
    if (point.classList.contains('white')) {
      point.classList.remove('white');
      point.classList.add('black');
    } else if (point.classList.contains('black')) {
      point.classList.remove('black');
    } else {
      point.classList.add('white');
    }
  }

  function checkAnswers() {
    document.querySelectorAll('.marker').forEach((m) => m.remove());
    let allCorrect = true;

    for (let y = 0; y <= size; y++) {
      for (let x = 0; x <= size; x++) {
        const inter = document.querySelector(
          `.intersection[data-x="${x}"][data-y="${y}"]`
        );
        const expected = stones.find((s) => s.x === x && s.y === y);
        const playerWhite = inter.classList.contains('white');
        const playerBlack = inter.classList.contains('black');
        const marker = document.createElement('div');
        marker.classList.add('marker');

        let correct = false;
        if (expected) {
          if (
            (expected.color === 'white' && playerWhite) ||
            (expected.color === 'black' && playerBlack)
          ) {
            correct = true;
          }
        } else if (!playerWhite && !playerBlack) {
          correct = true;
        }

        const oldMarker = inter.querySelector('.marker');
        if (oldMarker) oldMarker.remove();

        marker.textContent = correct ? '✅' : '❌';
        if (!correct) allCorrect = false;
        inter.appendChild(marker);
      }
    }

    // disable further clicking
    toggleInteraction(false);

    // show feedback
    const feedback = document.getElementById('feedback');
    const msg = document.getElementById('feedbackMsg');
    const nextBtn = document.getElementById('nextBtn');
    feedback.style.display = 'block';
    requestAnimationFrame(() => feedback.classList.add('show'));
    msg.textContent = allCorrect ? 'Well done!' : 'Missed a few!';

    if (allCorrect) {
      window.progress[window.activeGame.mode].level++;
    } else {
      // optional: lightly punish failure
      window.progress[window.activeGame.mode].level = Math.max(
        1,
        window.progress[window.activeGame.mode].level - 1
      );
    }

    console.log(
      `New ${window.activeGame.mode} level: ${
        window.progress[window.activeGame.mode].level
      }`
    );

    // fade in message and later button without layout bounce
    feedback.classList.add('show-msg');
    setTimeout(() => feedback.classList.add('show-btn'), 1500);

    msg.style.opacity = 1;
    nextBtn.style.display = 'inline-block';
  }

  checkBtn.onclick = null;
  checkBtn.onclick = checkAnswers;

  drawBoard();
  setTimeout(showStones, 50);

  if (checkBtn.disabled) return; // already processed
  checkBtn.disabled = true;
}
