function initAddTimeBonus({
  addTimeBonus,
  config,
  timerUI,
  startTimerInterval,
  updateBonusAvailability,
  deductPoints,
  tutorialController,
  showTimerToast,
  flashScoreWarning,
  BONUS_COST,
  getIsRefilling,
  setIsRefilling,
  getTimeLeft,
  setTimeLeft,
  isFeedbackVisible,
}) {
  return function addTimeHandler() {
    const cannotAfford = gameState.score < BONUS_COST;
    if (
      addTimeBonus.classList.contains('disabled') ||
      isFeedbackVisible() ||
      cannotAfford ||
      getIsRefilling()
    ) {
      if (cannotAfford) {
        flashScoreWarning();
      }
      return;
    }
    window.activeGame.usedAssistBonus = true;
    setIsRefilling(true);
    addTimeBonus.classList.add('disabled');
    updateBonusAvailability();
    deductPoints(BONUS_COST, addTimeBonus);
    tutorialController.onAddTimeUsed();
    showTimerToast('Time bonus!');

    const duration = 800;
    const holdTime = 600;
    const startRatio = getTimeLeft() / config.time;
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
          setTimeLeft(config.time);
          timerUI.setProgress(1);
          startTimerInterval();
          setTimeout(() => {
            setIsRefilling(false);
            addTimeBonus.classList.remove('disabled'); // re-enable
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
  flashScoreWarning,
  getCanUseEyeGlass,
  setCanUseEyeGlass,
  getIsRefilling,
  isFeedbackVisible,
  deductPoints,
  updateBonusAvailability,
}) {
  return function eyeGlassHandler() {
    const cannotAfford = gameState.score < BONUS_COST;
    if (cannotAfford) {
      flashScoreWarning();
      return;
    }
    if (!getCanUseEyeGlass() || getIsRefilling()) {
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

    revealSequenceHints(board, upcomingMoves).finally(() => {
      // original behavior: nothing else to toggle here
    });
  };
}

export { initAddTimeBonus, initEyeGlassBonus, revealSequenceHints };
