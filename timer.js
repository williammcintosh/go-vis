let deps = {
  getActiveGame: () => window.activeGame,
  getSpeedMultiplier: () => 1,
  setSpeedMultiplier: () => {},
  getLastTap: () => 0,
  setLastTap: () => {},
  getIsRefilling: () => false,
  tutorialController: null,
  doubleTapWindow: 300,
  speedBoostMultiplier: 20,
  getConfig: () => ({ time: 0, intervalSpeed: 1000 }),
  getTimeLeft: () => 0,
  setTimeLeft: () => {},
  timerUI: null,
  handleTimerFinished: () => {},
};

const SKIP_STORAGE_KEY = 'goVizEverSkippedTimer';
let everSkippedTimer = false;
try {
  everSkippedTimer = localStorage.getItem(SKIP_STORAGE_KEY) === 'true';
} catch (_err) {
  everSkippedTimer = false;
}

function setupTimer(overrides = {}) {
  deps = { ...deps, ...overrides };
}

function initTimerFlow({
  config,
  activeGame,
  timerUI,
  addTimeBonus,
  checkBtn,
  getIntersections,
  freezeBarStateNextFrameFn,
  clearStonesFn,
  enableInteractionFn,
  disableInteractionFn,
  updateBonusAvailabilityFn,
  setSpeedMultiplierFn,
  getIsRefilling,
  setCanUseEyeGlass,
  getCheckButtonShowTimeout,
  setCheckButtonShowTimeout,
  logSkillRatingDebugFn,
  checkAnswersFn,
  onTimerFinished,
  onTimerZero,
}) {
  let timeLeft = config.time;
  let timerZeroEmitted = false;

  const setTimeLeft = (v) => {
    timeLeft = v;
    if (activeGame) {
      activeGame.timeLeft = v;
    }
  };

  const getTimeLeft = () => timeLeft;

  const prepareTimerStart = () => {
    disableInteractionFn(getIntersections(), checkBtn);
    if (activeGame?.timer) {
      setSpeedMultiplierFn(1);
      clearInterval(activeGame.timer);
    }
    setTimeLeft(config.time);
    timerUI?.setProgress?.(1, { instant: true });
    timerUI?.setTipVisible?.(false);
  };

  const markPlayerSkipped = () => {
    if (!activeGame) return;
    everSkippedTimer = true;
    try {
      localStorage.setItem(SKIP_STORAGE_KEY, 'true');
    } catch (_err) {
      /* ignore */
    }
    timerUI?.setTipVisible?.(false);
    activeGame.playerSkipped = true;
    freezeBarStateNextFrameFn('postHideFrame', timeLeft, config.time);
    if (activeGame.timeLeftAtSolveEnd == null) {
      activeGame.timeLeftAtSolveEnd = timeLeft;
    }
    activeGame.challengeCompleted = false;
    logSkillRatingDebugFn?.({
      timerPhase: {
        barRatioAtHide: activeGame.barRatioAtHide,
        timeLeftAtHide: activeGame.timeLeftAtHide,
        usedAssistBonus: Boolean(activeGame.usedAssistBonus),
        usedSpeedBoost: Boolean(activeGame.speedBoostUsed),
        playerSkipped: true,
      },
      solvePhase: {},
      rewardPhase: {},
      meta: { completed: false, totalTime: config.time, action: 'skipButton' },
    });
    checkAnswersFn?.();
  };

  const adjustTimeBy = (delta) => {
    const next = Math.min(config.time, Math.max(0, timeLeft + delta));
    setTimeLeft(next);
    timerUI?.setProgress?.(next / config.time);
  };

  const handleTimerFinished = () => {
    if (activeGame?.timer) {
      clearInterval(activeGame.timer);
      activeGame.timer = null;
    }
    setSpeedMultiplierFn(1);
    if (activeGame) {
      activeGame.timerEndTime = Date.now();
      activeGame.timedOut = true;
    }
    if (activeGame && activeGame.initialRemainingRatio === null) {
      freezeBarStateNextFrameFn('postHideFrame', timeLeft, config.time);
    }
    clearStonesFn?.();
    enableInteractionFn(getIntersections(), checkBtn);
    addTimeBonus?.classList.add('disabled');
    updateBonusAvailabilityFn?.();
    timerUI?.setProgress?.(0);
    setTimeLeft(0);
    if (!timerZeroEmitted) {
      timerZeroEmitted = true;
      console.log('[timer] timeLeft reached zero');
      console.log('[timer] ZERO emit', { timeLeft, total: config.time });
      onTimerZero?.();
    }
    const existing = getCheckButtonShowTimeout?.();
    if (existing) {
      clearTimeout(existing);
    }
    const timeout = setTimeout(() => {
      timerUI?.showCheck?.();
      if (!getIsRefilling?.()) {
        setCanUseEyeGlass?.(true);
        updateBonusAvailabilityFn?.();
      }
      setCheckButtonShowTimeout?.(null);
      onTimerFinished?.();
    }, 100);
    setCheckButtonShowTimeout?.(timeout);
  };

  setTimeLeft(config.time);

  return {
    prepareTimerStart,
    lockInteractions: () => disableInteractionFn(getIntersections(), checkBtn),
    markPlayerSkipped,
    adjustTimeBy,
    handleTimerFinished,
    getTimeLeft,
    setTimeLeft,
  };
}

function createTimerUI() {
  const container = document.getElementById('timerContainer');
  const bar = document.getElementById('timerBar');
  const checkBtn = document.getElementById('checkBtn');
  const tip = document.createElement('div');
  tip.className = 'timer-tip';
  tip.textContent = 'Tip: Double tap to skip!';
  if (container) container.appendChild(tip);

  const setProgress = (ratio, { instant = false } = {}) => {
    const clamped = Math.max(0, Math.min(1, ratio));
    if (bar) {
      if (instant) {
        bar.classList.add('no-transition');
      }
      bar.style.setProperty('--timer-progress', clamped);
      if (instant) {
        requestAnimationFrame(() => {
          bar.classList.remove('no-transition');
        });
      }
    }
  };

  const showTimer = () => {
    if (!container) return;
    container.classList.add('is-timing');
    container.classList.remove('is-check');
  };

  const showCheck = () => {
    if (!container) return;
    container.classList.add('is-check');
    container.classList.remove('is-timing');
  };

  const reset = () => {
    setProgress(1, { instant: true });
    showTimer();
    setTipVisible(false);
  };

  const setTipVisible = (show) => {
    tip.classList.toggle('is-visible', Boolean(show));
  };

  return {
    container,
    bar,
    checkBtn,
    setProgress,
    showTimer,
    showCheck,
    reset,
    setTipVisible,
  };
}

function freezeBarState(reason, timeLeft, totalTime) {
  const activeGame = deps.getActiveGame();
  if (!activeGame || activeGame.initialRemainingRatio !== null) {
    return;
  }
  if (reason === 'timerCrossZero') return;
  const safeTotal =
    Number(totalTime) ||
    Number(activeGame?.totalTime) ||
    Number(activeGame?.puzzleConfig?.time) ||
    1;
  const ratioRaw = safeTotal ? timeLeft / safeTotal : 0;
  const ratio = Math.max(0, Math.min(1, ratioRaw));
  console.log('[RATIO CALC]', {
    timeLeft,
    totalTime: safeTotal,
    computedRatio: ratio,
    reason,
  });
  const now = Date.now();
  activeGame.initialRemainingRatio = ratio;
  activeGame.barRatioAtHide = ratio;
  activeGame.timeLeftAtHide = timeLeft;
  activeGame.startTimestampSolve = now;
  activeGame.timeLeftAtSolveStart = timeLeft;
  activeGame.freezeReason = reason;
  activeGame.speedBonusUsed = Boolean(deps.getSpeedMultiplier() > 1);
}

function freezeBarStateNextFrame(reason, timeLeftRef, totalTime) {
  const activeGame = deps.getActiveGame();
  if (!activeGame || activeGame.initialRemainingRatio !== null) {
    return;
  }
  requestAnimationFrame(() => {
    const latestGame = deps.getActiveGame();
    if (!latestGame || latestGame.initialRemainingRatio !== null) {
      return;
    }
    const currentTimeLeft =
      latestGame.timeLeft ?? timeLeftRef ?? latestGame?.puzzleConfig?.time ?? 0;
    const total =
      Number(totalTime) ||
      Number(latestGame?.totalTime) ||
      Number(latestGame?.puzzleConfig?.time) ||
      1;
    freezeBarState(reason, currentTimeLeft, total);
  });
}

function showTimerToast(text) {
  const host = deps.timerUI?.container || document.body;
  if (!host) return;
  const toast = document.createElement('div');
  toast.className = 'timer-toast';
  toast.textContent = text;
  host.appendChild(toast);
  toast
    .animate(
      [
        { opacity: 0, transform: 'translate(-50%, 6px)' },
        { opacity: 1, transform: 'translate(-50%, 0)' },
        { opacity: 0, transform: 'translate(-50%, -6px)' },
      ],
      { duration: 1200, easing: 'ease-out', fill: 'forwards' }
    )
    .finished.finally(() => toast.remove());
}

function handleDoubleTap(event) {
  const activeGame = deps.getActiveGame();
  if (
    !activeGame?.timer ||
    deps.getIsRefilling() ||
    deps.tutorialController?.shouldIgnoreDoubleTap?.()
  ) {
    return;
  }

  if (event.type === 'dblclick') {
    deps.setSpeedMultiplier(deps.speedBoostMultiplier);
    if (activeGame) activeGame.speedBoostUsed = true;
    freezeBarStateNextFrame(
      'postDoubleTapFrame',
      activeGame?.timeLeft ?? activeGame?.puzzleConfig?.time ?? 0,
      activeGame?.totalTime || activeGame?.puzzleConfig?.time || 1
    );
    return;
  }

  const now = Date.now();
  const lastTap = deps.getLastTap();
  const isDoubleTap = now - lastTap < deps.doubleTapWindow;
  if (isDoubleTap) {
    if (event.cancelable) {
      event.preventDefault();
    }
    deps.setSpeedMultiplier(deps.speedBoostMultiplier);
    if (activeGame) activeGame.speedBoostUsed = true;
    freezeBarStateNextFrame(
      'postDoubleTapFrame',
      activeGame?.timeLeft ?? activeGame?.puzzleConfig?.time ?? 0,
      activeGame?.totalTime || activeGame?.puzzleConfig?.time || 1
    );
  }
  deps.setLastTap(now);
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

function runTimerTick() {
  if (deps.tutorialController?.shouldHoldTimer?.()) {
    return;
  }
  let timeLeft = deps.getTimeLeft();
  timeLeft = Math.max(0, timeLeft - 0.1 * deps.getSpeedMultiplier());
  const config = deps.getConfig();
  const timerUI = deps.timerUI;
  const activeGame = deps.getActiveGame();
  const ratio = config.time ? timeLeft / config.time : 0;
  timerUI?.setProgress?.(ratio);
  if (!everSkippedTimer && ratio > 0 && ratio <= 0.2) {
    timerUI?.setTipVisible?.(true);
  } else {
    timerUI?.setTipVisible?.(false);
  }
  if (activeGame) {
    const clamped = Math.max(0, Math.min(1, ratio));
    activeGame.lastTimerRatio = clamped;
    activeGame.timeLeft = timeLeft;
  }
  deps.tutorialController?.onTimerTick?.(ratio);
  deps.setTimeLeft(timeLeft);
  if (timeLeft <= 0 && activeGame?.timer && !deps.getIsRefilling()) {
    deps.handleTimerFinished();
  }
}

function startTimerInterval() {
  const activeGame = deps.getActiveGame();
  if (activeGame?.timer) {
    clearInterval(activeGame.timer);
  }
  deps.timerUI?.showTimer?.();
  const config = deps.getConfig();
  activeGame.timer = setInterval(runTimerTick, config.intervalSpeed);
}

export {
  createTimerUI,
  freezeBarState,
  freezeBarStateNextFrame,
  showTimerToast,
  initDoubleTapListeners,
  startTimerInterval,
  setupTimer,
  initTimerFlow,
};
