let deps = {
  TAP_MODE_KEY: 'goVizTapMode',
  TAP_MODES: {
    CLASSIC: 'classic',
    TOGGLE: 'toggle',
  },
  DOUBLE_TAP_WINDOW: 300,
  getTapModeValue: () => 'classic',
  setTapModeValue: () => {},
  getLastStoneTap: () => ({ time: 0, target: null }),
  setLastStoneTap: () => {},
};

import { handleFirstMoveInteraction } from './firstMoveHint.js';

function setupInput(overrides = {}) {
  deps = { ...deps, ...overrides };
}

function loadTapMode() {
  const saved = localStorage.getItem(deps.TAP_MODE_KEY);
  return saved === deps.TAP_MODES.TOGGLE || saved === deps.TAP_MODES.CLASSIC
    ? saved
    : deps.TAP_MODES.CLASSIC;
}

function setTapMode(mode) {
  const next =
    mode === deps.TAP_MODES.TOGGLE || mode === deps.TAP_MODES.CLASSIC
      ? mode
      : deps.TAP_MODES.CLASSIC;
  deps.setTapModeValue(next);
  localStorage.setItem(deps.TAP_MODE_KEY, next);
  syncTapModeInputs();
  if (window.activeGame) {
    window.activeGame.tapMode = next;
    if (next === deps.TAP_MODES.TOGGLE && !window.activeGame.lastPlacedColor) {
      window.activeGame.lastPlacedColor = 'white';
    }
  }
}

function getTapMode() {
  return deps.getTapModeValue();
}

function syncTapModeInputs() {
  const inputs = document.querySelectorAll('input[name="tapMode"]');
  inputs.forEach((input) => {
    input.checked = input.value === deps.getTapModeValue();
  });
}

function toggleStone(e) {
  const p = e.target;
  const hadWhite = p.classList.contains('white');
  const hadBlack = p.classList.contains('black');
  const currentTapMode = window.activeGame?.tapMode ?? getTapMode();
  const hadStone = hadWhite || hadBlack;

  if (currentTapMode === deps.TAP_MODES.TOGGLE) {
    const now = Date.now();
    const lastStoneTap = deps.getLastStoneTap();
    const isDoubleTap =
      hadStone &&
      lastStoneTap.target === p &&
      now - lastStoneTap.time < deps.DOUBLE_TAP_WINDOW;
    deps.setLastStoneTap({ time: now, target: p });

    if (isDoubleTap) {
      p.classList.remove('black', 'white');
    } else if (!hadStone) {
      const lastColor = window.activeGame?.lastPlacedColor ?? 'white';
      const nextColor = lastColor === 'black' ? 'white' : 'black';
      p.classList.add(nextColor);
      if (window.activeGame) {
        window.activeGame.lastPlacedColor = nextColor;
      }
    } else {
      const nextColor = hadBlack ? 'white' : 'black';
      p.classList.remove('black', 'white');
      p.classList.add(nextColor);
      if (window.activeGame) {
        window.activeGame.lastPlacedColor = nextColor;
      }
    }
  } else {
    if (hadWhite) {
      p.classList.replace('white', 'black');
    } else if (hadBlack) {
      p.classList.remove('black');
    } else {
      p.classList.add('white');
    }
  }

  if (window.activeGame?.mode === 'sequence') {
    const newColor = p.classList.contains('white')
      ? 'white'
      : p.classList.contains('black')
      ? 'black'
      : null;
    const xCoord = Number(p.dataset.x);
    const yCoord = Number(p.dataset.y);
    window.activeGame.sequenceHistory = window.activeGame.sequenceHistory || [];
    const existing = window.activeGame.sequenceHistory.find(
      (entry) => entry.x === xCoord && entry.y === yCoord
    );
    if (existing) {
      if (newColor) {
        existing.color = newColor;
      } else {
        window.activeGame.sequenceHistory =
          window.activeGame.sequenceHistory.filter(
            (entry) => entry !== existing
          );
      }
    } else if (newColor) {
      window.activeGame.sequenceHistory.push({
        x: xCoord,
        y: yCoord,
        color: newColor,
      });
    }
  }

  handleFirstMoveInteraction({ hadWhite, hadBlack, element: p });
}

export {
  setupInput,
  loadTapMode,
  setTapMode,
  getTapMode,
  syncTapModeInputs,
  toggleStone,
};
