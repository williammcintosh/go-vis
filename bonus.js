function initAddTimeBonus({
  addTimeBonus,
  config,
  timerUI,
  startTimerInterval,
  updateBonusAvailability,
  deductGold,
  tutorialController,
  showTimerToast,
  flashGoldWarning,
  BONUS_COST,
  getIsRefilling,
  setIsRefilling,
  getTimeLeft,
  setTimeLeft,
  isFeedbackVisible,
  getGameState,
  getActiveGame,
}) {
  return function addTimeHandler() {
    const gameState = getGameState?.();
    const activeGame = getActiveGame?.();
    const cannotAfford = (gameState?.gold ?? 0) < BONUS_COST;
    if (
      addTimeBonus.classList.contains('disabled') ||
      isFeedbackVisible() ||
      cannotAfford ||
      getIsRefilling()
    ) {
      if (cannotAfford) {
        flashGoldWarning();
      }
      return;
    }
    if (activeGame) {
      activeGame.usedAssistBonus = true;
    }
    setIsRefilling(true);
    addTimeBonus.classList.add('disabled');
    updateBonusAvailability();
    deductGold(BONUS_COST, addTimeBonus);
    tutorialController.onAddTimeUsed();
    showTimerToast('Time bonus!');

    const duration = 800;
    const holdTime = 600;
    const startRatio = getTimeLeft() / config.time;
    const startTime = performance.now();

    if (activeGame?.timer) {
      clearInterval(activeGame.timer);
      activeGame.timer = null;
    }

    const animateUp = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const currentRatio = startRatio + (1 - startRatio) * progress;
      timerUI.setProgress(currentRatio);

      if (progress < 1) {
        requestAnimationFrame(animateUp);
      } else {
        setTimeout(() => {
          setTimeLeft(config.time);
          timerUI.setProgress(1, { instant: true });
          startTimerInterval();
          setTimeout(() => {
            setIsRefilling(false);
            addTimeBonus.classList.remove('disabled');
            updateBonusAvailability();
          }, 0);
        }, holdTime);
      }
    };

    requestAnimationFrame(animateUp);
  };
}

function revealSequenceHints(board, hintMoves) {
  const HINT_ANIMATION_BASE = 1200;
  const HINT_STAGGER = 420;
  const HINT_STONE_KEYFRAMES = [
    { opacity: 0 },
    { opacity: 1, offset: 0.2 },
    { opacity: 1, offset: 0.85 },
    { opacity: 0 },
  ];

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
}

function initEyeGlassBonus({
  eyeGlassBonus,
  board,
  gameState,
  BONUS_COST,
  flashGoldWarning,
  getCanUseEyeGlass,
  setCanUseEyeGlass,
  getIsRefilling,
  isFeedbackVisible,
  deductGold,
  updateBonusAvailability,
  getActiveGame,
}) {
  return function eyeGlassHandler() {
    const activeGame = getActiveGame?.();
    const cannotAfford = (gameState?.gold ?? 0) < BONUS_COST;
    if (cannotAfford) {
      flashGoldWarning();
      return;
    }
    if (!getCanUseEyeGlass() || getIsRefilling()) {
      return;
    }
    if (isFeedbackVisible()) {
      return;
    }
    if (activeGame) {
      activeGame.usedAssistBonus = true;
    }
    deductGold(BONUS_COST, eyeGlassBonus);
    eyeGlassBonus.classList.add('disabled');

    const moves = activeGame?.gameSnapshot?.moves ?? [];
    const history = activeGame?.sequenceHistory ?? [];
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

    revealSequenceHints(board, upcomingMoves).finally(() => {});
  };
}

function initBonusFlow({
  addTimeBonus,
  eyeGlassBonus,
  config,
  timerUI,
  startTimerInterval,
  updateBonusAvailability,
  deductGold,
  tutorialController,
  showTimerToast,
  flashGoldWarning,
  BONUS_COST,
  getIsRefilling,
  setIsRefilling,
  getTimeLeft,
  setTimeLeft,
  isFeedbackVisible,
  board,
  gameState,
  getActiveGame,
  getCanUseEyeGlass,
  setCanUseEyeGlass,
}) {
  const addTimeHandler = initAddTimeBonus({
    addTimeBonus,
    config,
    timerUI,
    startTimerInterval,
    updateBonusAvailability,
    deductGold,
    tutorialController,
    showTimerToast,
    flashGoldWarning,
    BONUS_COST,
    getIsRefilling,
    setIsRefilling,
    getTimeLeft,
    setTimeLeft,
    isFeedbackVisible,
    getGameState: () => gameState,
    getActiveGame,
  });

  const eyeGlassHandler = initEyeGlassBonus({
    eyeGlassBonus,
    board,
    gameState,
    BONUS_COST,
    flashGoldWarning,
    getCanUseEyeGlass,
    setCanUseEyeGlass,
    getIsRefilling,
    isFeedbackVisible,
    deductGold,
    updateBonusAvailability,
    getActiveGame,
  });

  const resetBonusState = () => {
    setCanUseEyeGlass(false);
    updateBonusAvailability();
  };

  return { addTimeHandler, eyeGlassHandler, resetBonusState };
}

export {
  initAddTimeBonus,
  initEyeGlassBonus,
  revealSequenceHints,
  initBonusFlow,
};
