const FIRST_MOVE_HINT_KEY = 'hasSeenFirstMoveHint';
const LEARNED_BLACK_KEY = 'goVizLearnedBlackTap';
const HINT_MESSAGE_STAGE1 = 'Tap the glowing point';
const HINT_MESSAGE_STAGE2 = 'Nice. Tap it again to make it black';
const TARGET_HINT_GAME_ID = 2827;
let state = null;
let shouldRecoachNextRound = false;

function parseFirstMoveCoord(firstMove, boardSize) {
  if (!firstMove || typeof firstMove !== 'string') return null;
  const match = firstMove.match(/^[BW]\[([a-z]{2})\]/i);
  if (!match) return null;
  const raw = match[1].toLowerCase();
  if (raw.length !== 2) return null;
  const x = raw.charCodeAt(0) - 97;
  const y = raw.charCodeAt(1) - 97;
  if (x < 0 || y < 0) return null;
  if (Number.isFinite(boardSize)) {
    if (x >= boardSize || y >= boardSize) return null;
  }
  return { x, y };
}

function clearExistingHint() {
  if (!state) return;
  if (state.targetEl) {
    state.targetEl.classList.remove('first-move-hint-target');
    const ring = state.targetEl.querySelector('.first-move-hint-ring');
    ring?.remove();
  }
  if (state.textEl) {
    state.textEl.remove();
  }
  if (state.captionTimer) {
    clearTimeout(state.captionTimer);
  }
  if (state.fadeTimer) {
    clearTimeout(state.fadeTimer);
  }
  state = null;
}

function ensureTextEl(boardEl) {
  let textEl = document.getElementById('firstMoveHintText');
  if (!textEl) {
    textEl = document.createElement('div');
    textEl.id = 'firstMoveHintText';
    textEl.className = 'first-move-hint__text';
    textEl.textContent = '';
    boardEl.insertAdjacentElement('afterend', textEl);
  }
  return textEl;
}

function showHint() {
  if (!state?.targetEl) return;
  const ring =
    state.targetEl.querySelector('.first-move-hint-ring') ||
    (() => {
      const el = document.createElement('div');
      el.className = 'first-move-hint-ring';
      state.targetEl.appendChild(el);
      return el;
    })();
  state.targetEl.classList.add('first-move-hint-target');
  if (state.textEl && state.textEl.textContent) {
    state.textEl.classList.add('is-visible');
  }
  state.shown = true;
}

function hideHint({ markSeen = true } = {}) {
  if (!state) return;
  if (state.targetEl) {
    state.targetEl.classList.remove('first-move-hint-target');
    state.targetEl.querySelector('.first-move-hint-ring')?.remove();
  }
  if (state.textEl) {
    state.textEl.classList.remove('is-visible');
  }
  if (markSeen) {
    try {
      localStorage.setItem(FIRST_MOVE_HINT_KEY, 'true');
    } catch (_err) {
      /* ignore storage errors */
    }
  }
  if (state) {
    state.hasSeen = true;
  }
  state = null;
}

function initFirstMoveHint({
  boardEl,
  getIntersectionRef,
  boardSize,
  selectedGame,
  autoShow = true,
}) {
  clearExistingHint();
  if (!selectedGame || Number(selectedGame.game_id) !== TARGET_HINT_GAME_ID) {
    state = null;
    return null;
  }
  const firstMove = parseFirstMoveCoord(
    selectedGame?.sgf_moves?.[0],
    boardSize
  );
  if (!firstMove) return null;
  const target = getIntersectionRef(firstMove.x, firstMove.y);
  if (!target) return null;

  const hasSeen = localStorage.getItem(FIRST_MOVE_HINT_KEY) === 'true';
  const learnedBlack = localStorage.getItem(LEARNED_BLACK_KEY) === 'true';
  const textEl = ensureTextEl(boardEl);
  state = {
    hasSeen,
    targetEl: target,
    textEl,
    targetCoord: firstMove,
    stage: 0,
    shown: false,
    captionsAllowed: true,
    captionTimer: null,
    fadeTimer: null,
  };

  if (autoShow && (!hasSeen || shouldRecoachNextRound)) {
    showHint();
  }

  shouldRecoachNextRound = false;
  return state;
}

function showFirstMoveHintNow() {
  if (!state || state.shown) return;
  state.shown = true;
  console.log('[ring] showFirstMoveHintNow fired');
  showHint();
}

function handleFirstMoveInteraction({ hadWhite, hadBlack, element }) {
  if (!state || !element) return;
  if (state.stage !== 1 && state.stage !== 2) return;
  const x = Number(element.dataset.x);
  const y = Number(element.dataset.y);
  if (state.targetCoord && (state.targetCoord.x !== x || state.targetCoord.y !== y)) {
    return;
  }
  const afterWhite = element.classList.contains('white');
  const afterBlack = element.classList.contains('black');
  const placedWhite = !hadWhite && !hadBlack && afterWhite;
  const flippedWhiteToBlack = hadWhite && afterBlack;
  if (state.stage === 1 && placedWhite) {
    state.stage = 2;
    console.log('[coach] state -> 2, reason: placed white');
    if (state.captionsAllowed) {
      setCaption(HINT_MESSAGE_STAGE2);
    } else {
      clearCaption();
    }
    return;
  }
  if (state.stage === 2 && flippedWhiteToBlack) {
    state.stage = 3;
    console.log('[coach] state -> 3, reason: flipped to black');
    if (state.fadeTimer) clearTimeout(state.fadeTimer);
    state.fadeTimer = setTimeout(() => clearCaption(), 1500);
    hideHint({ markSeen: true });
    try {
      localStorage.setItem(LEARNED_BLACK_KEY, 'true');
    } catch (_err) {
      /* ignore */
    }
  }
}

function setCaption(text) {
  if (!state || !state.textEl) return;
  state.textEl.textContent = text;
  state.textEl.classList.add('is-visible');
}

function clearCaption() {
  if (!state || !state.textEl) return;
  state.textEl.classList.remove('is-visible');
}

function startCoachAfterTimerZero() {
  if (!state || state.stage !== 0) return;
  state.stage = 1;
  console.log('[coach] state -> 1, reason: timer zero');
  showHint();
  if (state.captionTimer) clearTimeout(state.captionTimer);
  if (state.captionsAllowed) {
    setCaption(HINT_MESSAGE_STAGE1);
  }
}

function onAttemptResult({ passed, targetWasCorrect }) {
  if (passed) {
    shouldRecoachNextRound = false;
    return;
  }
  if (targetWasCorrect === false) {
    shouldRecoachNextRound = true;
  }
}

function getTargetInfo() {
  if (!state || !state.targetCoord) return null;
  return { ...state.targetCoord };
}

export {
  initFirstMoveHint,
  handleFirstMoveInteraction,
  showFirstMoveHintNow,
  startCoachAfterTimerZero,
  onAttemptResult,
  getTargetInfo,
  hideHint as hideFirstMoveHint,
};
