function checkAnswers({
  timerUI,
  config,
  timeLeft,
  stones,
  currentMode,
  speedMultiplier,
  MAX_SPEED_BONUS_THRESHOLD,
  freezeBarState,
  addScore,
  logSkillRatingDebug,
}) {
  if (window.activeGame?.timer) {
    clearInterval(window.activeGame.timer);
    window.activeGame.timer = null;
  }
  if (window.activeGame) {
    // Treat manual check as not timed out unless explicitly marked elsewhere
    window.activeGame.timedOut = false;
  }
  if (!window.activeGame.timerEndTime) {
    window.activeGame.timerEndTime = Date.now();
  }
  if (window.activeGame && window.activeGame.initialRemainingRatio === null) {
    freezeBarState('checkAnswers', timeLeft, config.time);
  }
  // Record players reaction time
  const endTs = window.activeGame.timerEndTime || Date.now();
  const startTs = window.activeGame.startedAt || endTs;
  window.activeGame.reactionTime = endTs - startTs;

  document.querySelectorAll('.marker').forEach((m) => m.remove());
  let allCorrect = true;
  let sequenceOrderIssues = 0;

  let missedCount = 0;
  const orderMistakes = new Set();
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
      const coordKey = `${x},${y}`;
      const isOrderMistake = window.activeGame?.orderMistakes?.has(coordKey);
      if (!correct || isOrderMistake) {
        allCorrect = false;
        missedCount++;
        if (isOrderMistake) missedCount--; // already counted elsewhere
      }
      if (isOrderMistake) {
        marker.textContent = '❌';
        marker.classList.add('marker--order');
      }
      inter.appendChild(marker);
    }
  }

  if (currentMode === 'sequence') {
    const history = window.activeGame?.sequenceHistory ?? [];
    const expectedMoves = window.activeGame?.gameSnapshot?.moves ?? [];
    const expectedCount = expectedMoves.length;
    const alignCount = Math.min(history.length, expectedCount);
    for (let i = 0; i < alignCount; i++) {
      const expected = expectedMoves[i];
      const actual = history[i];
      const expectedColor = expected.color === 'B' ? 'black' : 'white';
      if (
        actual.x !== expected.x ||
        actual.y !== expected.y ||
        actual.color !== expectedColor
      ) {
        sequenceOrderIssues++;
        orderMistakes.add(`${actual.x},${actual.y}`);
        orderMistakes.add(`${expected.x},${expected.y}`);
        break;
      }
    }
    if (history.length < expectedCount) {
      const next = expectedMoves[history.length];
      if (next) {
        orderMistakes.add(`${next.x},${next.y}`);
      }
      sequenceOrderIssues++;
    } else if (history.length > expectedCount) {
      const extra = history[expectedCount];
      if (extra) {
        orderMistakes.add(`${extra.x},${extra.y}`);
      }
      sequenceOrderIssues++;
    }
    if (sequenceOrderIssues > 0) {
      allCorrect = false;
    }
    const formatExpected = (move) => {
      if (!move) return '??';
      const color = move.color === 'black' || move.color === 'B' ? 'B' : 'W';
      return `${color}[${move.x},${move.y}]`;
    };
    const formatActual = (move) => {
      if (!move) return '??';
      const color =
        move.color === 'black'
          ? 'B'
          : move.color === 'white'
          ? 'W'
          : move.color;
      return `${color}[${move.x},${move.y}]`;
    };
    window.activeGame.orderMistakes = orderMistakes;
  } else {
    window.activeGame.orderMistakes = new Set();
  }
  const toggleInteraction = (enable) => {
    document.querySelectorAll('.intersection').forEach((i) => {
      i.style.pointerEvents = enable ? 'auto' : 'none';
    });
    const checkBtn = timerUI.checkBtn;
    checkBtn.disabled = !enable;
    checkBtn.style.opacity = enable ? '1' : '0.5';
  };
  toggleInteraction(false);

  let levelIncreased = false;

  if (allCorrect) {
    window.gameState.currentRound++;
    if (window.gameState.currentRound > window.gameState.totalRounds) {
      window.progress[currentMode].level++;
      window.gameState.currentRound = 1;
      levelIncreased = true;
    }
  }

  window.progress[currentMode].round = window.gameState.currentRound;

  const feedback = document.getElementById('feedback');
  const msg = document.getElementById('feedbackMsg');
  const nextBtn = document.getElementById('nextBtn');
  const okBtn = document.getElementById('levelOkBtn');
  feedback.style.display = 'block';
  requestAnimationFrame(() => {
    feedback.classList.add('show');
    window.updateBonusAvailability();
  });

  const finalBoardCorrect = missedCount === 0;
  const playerSkipped = Boolean(window.activeGame?.playerSkipped);
  const barRatioAtHide =
    window.activeGame?.barRatioAtHide ??
    window.activeGame?.initialRemainingRatio ??
    timeLeft / config.time;
  const initialRemainingRatio = barRatioAtHide || 0;
  let remainingRatio = initialRemainingRatio;
  if (window.activeGame?.timedOut) remainingRatio = 0;

  if (window.activeGame) {
    window.activeGame.playerSkipped = playerSkipped;
    const succeeded = allCorrect;
    window.activeGame.challengeCompleted = succeeded;
    if (window.activeGame.timeLeftAtSolveEnd == null) {
      window.activeGame.timeLeftAtSolveEnd = timeLeft;
    }
    if (window.activeGame.startTimestampSolve == null) {
      window.activeGame.startTimestampSolve = Date.now();
    }
    const endTs = Date.now();
    window.activeGame.endTimestampSolve = endTs;
    window.activeGame.solveDuration =
      window.activeGame?.startTimestampSolve != null
        ? endTs - window.activeGame.startTimestampSolve
        : 0;
    window.activeGame.maxSpeedBonusAchieved =
      window.activeGame.solveDuration <= MAX_SPEED_BONUS_THRESHOLD;
    window.activeGame.speedBoostUsed = Boolean(
      window.activeGame.speedBoostUsed || speedMultiplier > 1
    );
    window.activeGame.speedBonusUsed = Boolean(
      window.activeGame.speedBonusUsed || speedMultiplier > 1
    );
  }

  if (window.activeGame?.challengeCompleted) {
    const boardKey = window.activeGame.boardKey;
    const stoneCount =
      window.activeGame.challengeStoneCount ??
      window.activeGame?.puzzleConfig?.stoneCount ??
      config.stoneCount;
    const total = window.activeGame.challengePoolSize ?? 0;
    const modeKey =
      window.activeGame.challengeMode === 'sequence'
        ? 'sequence'
        : 'position';
    if (boardKey) {
      window.incrementPlayerProgress(modeKey, boardKey, total);
    }
  }

  if (nextBtn) {
    const succeeded = allCorrect;
    nextBtn.textContent = succeeded ? 'Next Challenge' : 'Retry';
  }

  if (window.recordDifficultyOutcome) {
    window.recordDifficultyOutcome(Boolean(window.activeGame?.timedOut));
  }

  if (levelIncreased) {
    msg.textContent = `Level ${window.progress[currentMode].level} now unlocked!`;
    nextBtn.disabled = true;
    if (okBtn) {
      okBtn.style.display = 'inline-block';
    }
    levelIncreased = false;
    window.launchConfetti();
    setTimeout(() => {
      addScore({
        reactionTime: window.activeGame?.reactionTime || 10000,
        finalBoardCorrect,
        sequenceOrderIssues,
      });
    }, window.ANIM_DELAY);
  } else if (allCorrect) {
    if (okBtn) {
      okBtn.style.display = 'none';
    }
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
    const levelOverlayActive = () =>
      Boolean(document.querySelector('.level-up-overlay'));

    // Add score with delay for animation sync
    nextBtn.disabled = true;
    setTimeout(() => {
      addScore({
        reactionTime: window.activeGame?.reactionTime || 10000,
        finalBoardCorrect,
        sequenceOrderIssues,
      }).finally(() => {
        if (!levelOverlayActive()) {
          nextBtn.disabled = false;
        }
      });
    }, window.ANIM_DELAY);
  } else {
    if (
      currentMode === 'sequence' &&
      finalBoardCorrect &&
      sequenceOrderIssues > 0
    ) {
      msg.textContent = 'Sequence order was off!';
    } else {
      msg.textContent =
        missedCount === 1 ? 'Missed just one stone!' : 'Missed some stones!';
    }
  }

  feedback.classList.add('show-msg');
  setTimeout(() => feedback.classList.add('show-btn'), 1500);
  msg.style.opacity = 1;
  nextBtn.style.display = 'inline-block';
}

export { checkAnswers };
