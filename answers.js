function checkAnswers({
  timerUI,
  config,
  timeLeft,
  stones,
  currentMode,
  speedMultiplier,
  postTimerBonusPerStoneMs,
  postTimerBonusThresholdMs,
  freezeBarState,
  addGold,
  logSkillRatingDebug,
}) {
  const appendRoundDebug = (event, details = {}) => {
    if (!window.activeGame) return;
    if (!window.activeGame.roundDebug) {
      window.activeGame.roundDebug = { meta: {}, events: [] };
    }
    window.activeGame.roundDebug.events.push({
      ts: Date.now(),
      event,
      ...details,
    });
  };
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
  let filledPositions = 0;
  const debugSequence =
    window.DEBUG_SEQUENCE === true && currentMode === 'sequence';
  const mismatches = [];
  if (debugSequence) {
    const preOrderMistakes = window.activeGame?.orderMistakes;
    console.log('[sequence-debug] pre-check', {
      preOrderMistakes: preOrderMistakes ? Array.from(preOrderMistakes) : null,
    });
  }
  let expectedMoves = [];
  let history = [];
  if (currentMode === 'sequence') {
    history = window.activeGame?.sequenceHistory ?? [];
    expectedMoves = window.activeGame?.gameSnapshot?.moves ?? [];
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
    if (debugSequence) {
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
      const expectedList = expectedMoves.map(formatExpected);
      const actualList = history.map(formatActual);
      let firstMismatch = null;
      for (let i = 0; i < Math.min(expectedList.length, actualList.length); i++) {
        if (expectedList[i] !== actualList[i]) {
          firstMismatch = {
            index: i + 1,
            expected: expectedList[i],
            actual: actualList[i],
          };
          break;
        }
      }
      if (!firstMismatch && expectedList.length !== actualList.length) {
        firstMismatch = {
          index: Math.min(expectedList.length, actualList.length) + 1,
          expected: expectedList[actualList.length] ?? 'end',
          actual: actualList[expectedList.length] ?? 'end',
        };
      }
      console.log('[sequence-debug] compare', {
        expected: expectedList,
        actual: actualList,
        firstMismatch,
        orderIssues: sequenceOrderIssues,
      });
    }
  }
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
      let actualColor = null;
      if (playerWhite) actualColor = 'white';
      if (playerBlack) actualColor = 'black';
      if (expected) {
        correct =
          (expected.color === 'white' && playerWhite) ||
          (expected.color === 'black' && playerBlack);
        if (playerWhite || playerBlack) {
          filledPositions++;
        }
      } else if (!playerWhite && !playerBlack) correct = true;

      const marker = document.createElement('div');
      marker.classList.add('marker');
      marker.textContent = correct ? '✅' : '❌';
      const coordKey = `${x},${y}`;
      const isOrderMistake = orderMistakes.has(coordKey);
      if (!correct || isOrderMistake) {
        allCorrect = false;
        missedCount++;
        if (isOrderMistake) missedCount--; // already counted elsewhere
      }
      if (isOrderMistake) {
        marker.textContent = '❌';
        marker.classList.add('marker--order');
      }
      if (debugSequence && (!correct || isOrderMistake)) {
        const expectedColor = expected ? expected.color : null;
        const reason = isOrderMistake
          ? 'orderMistake'
          : expected
          ? actualColor
            ? 'wrongColor'
            : 'missingStone'
          : actualColor
          ? 'extraStone'
          : 'empty';
        mismatches.push({
          x,
          y,
          expected: expectedColor,
          actual: actualColor,
          reason,
        });
      }
      inter.appendChild(marker);
    }
  }

  const expectedBlackCount = stones.filter((s) => s.color === 'black').length;
  const expectedWhiteCount = stones.filter((s) => s.color === 'white').length;
  let playerBlackCount = 0;
  let playerWhiteCount = 0;
  document.querySelectorAll('.intersection.black').forEach(() => {
    playerBlackCount++;
  });
  document.querySelectorAll('.intersection.white').forEach(() => {
    playerWhiteCount++;
  });
  const positionsReward = filledPositions === stones.length && stones.length > 0;
  const colorsReward =
    playerBlackCount === expectedBlackCount &&
    playerWhiteCount === expectedWhiteCount &&
    expectedBlackCount + expectedWhiteCount > 0;

  if (debugSequence) {
    console.log('[sequence-debug] board-eval', {
      missedCount,
      filledPositions,
      expectedTotal: stones.length,
      playerBlackCount,
      playerWhiteCount,
      expectedBlackCount,
      expectedWhiteCount,
      mismatches,
    });
    if (sequenceOrderIssues === 0 && missedCount > 0) {
      console.log('[sequence-debug] note', {
        message: 'Order matched but board state mismatched; check mismatches list.',
      });
    }
  }
  if (currentMode === 'sequence') {
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

  const feedback = document.getElementById('feedback');
  const msg = document.getElementById('feedbackMsg');
  const nextBtn = document.getElementById('nextBtn');
  feedback.style.display = 'block';
  requestAnimationFrame(() => {
    feedback.classList.add('show');
    window.updateBonusAvailability();
  });

  const finalBoardCorrect = missedCount === 0;
  const playerSkipped = Boolean(window.activeGame?.playerSkipped);
  appendRoundDebug('checkAnswers', {
    stoneCount:
      window.activeGame?.challengeStoneCount ??
      window.activeGame?.puzzleConfig?.stoneCount ??
      config?.stoneCount ??
      0,
    playerSkipped,
    timedOut: Boolean(window.activeGame?.timedOut),
    barRatioAtHide:
      window.activeGame?.barRatioAtHide ??
      window.activeGame?.initialRemainingRatio ??
      null,
    timeLeftAtHide: window.activeGame?.timeLeftAtHide ?? null,
    freezeReason: window.activeGame?.freezeReason ?? null,
  });
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
    const stoneCount =
      window.activeGame.challengeStoneCount ??
      window.activeGame?.puzzleConfig?.stoneCount ??
      config.stoneCount ??
      0;
    const perStoneMs = Number(postTimerBonusPerStoneMs) || 0;
    const fallbackThreshold = Math.max(0, stoneCount * perStoneMs);
    const resolvedThreshold = Number(postTimerBonusThresholdMs);
    const postTimerThresholdMs = Number.isFinite(resolvedThreshold)
      ? Math.max(0, resolvedThreshold)
      : fallbackThreshold;
    window.activeGame.maxSpeedBonusThresholdMs = postTimerThresholdMs;
    window.activeGame.maxSpeedBonusAchieved =
      postTimerThresholdMs > 0 &&
      window.activeGame.solveDuration <= postTimerThresholdMs;
    appendRoundDebug('postTimerBonus', {
      stoneCount,
      perStoneMs,
      thresholdMs: postTimerThresholdMs,
      calculation: `${stoneCount} * ${perStoneMs} = ${fallbackThreshold}`,
      startTimestampSolve: window.activeGame.startTimestampSolve,
      endTimestampSolve: window.activeGame.endTimestampSolve,
      solveDuration: window.activeGame.solveDuration,
      qualifies: window.activeGame.maxSpeedBonusAchieved,
    });
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
      window.incrementPlayerProgress(modeKey, boardKey, stoneCount, total);
    }
  }

  if (nextBtn) {
    const succeeded = allCorrect;
    nextBtn.textContent = succeeded ? 'Next' : 'Retry';
  }

  if (window.recordDifficultyOutcome) {
    window.recordDifficultyOutcome(Boolean(window.activeGame?.timedOut));
  }
  let targetWasCorrect = null;
  const targetInfo = window.getTargetInfo?.();
  if (targetInfo) {
    const inter = document.querySelector(
      `.intersection[data-x="${targetInfo.x}"][data-y="${targetInfo.y}"]`
    );
    if (inter) {
      const expected = stones.find(
        (s) => s.x === targetInfo.x && s.y === targetInfo.y
      );
      const playerWhite = inter.classList.contains('white');
      const playerBlack = inter.classList.contains('black');
      const correct =
        expected &&
        ((expected.color === 'white' && playerWhite) ||
          (expected.color === 'black' && playerBlack));
      targetWasCorrect = Boolean(correct);
    }
  }

  if (allCorrect) {
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
    const enableNextWhenAllowed = () => {
      if (!levelOverlayActive()) {
        nextBtn.disabled = false;
      }
    };

    // Add gold with delay for animation sync
    nextBtn.disabled = true;
    setTimeout(enableNextWhenAllowed, window.NEXT_BUTTON_ENABLE_DELAY || 0);
    setTimeout(() => {
      addGold({
        reactionTime: window.activeGame?.reactionTime || 10000,
        finalBoardCorrect,
        sequenceOrderIssues,
        positionsReward,
        colorsReward,
      }).finally(enableNextWhenAllowed);
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

  // Partial rewards even on failure
  if (!allCorrect) {
    setTimeout(() => {
      addGold({
        reactionTime: window.activeGame?.reactionTime || 10000,
        finalBoardCorrect,
        sequenceOrderIssues,
        positionsReward,
        colorsReward,
      });
    }, window.ANIM_DELAY);
  }

  feedback.classList.add('show-msg');
  setTimeout(() => feedback.classList.add('show-btn'), 1500);
  msg.style.opacity = 1;
  nextBtn.style.display = 'inline-block';
  return { passed: allCorrect, targetWasCorrect };
}

function createCheckAnswersHandler({
  timerUI,
  config,
  stones,
  currentMode,
  speedMultiplier,
  postTimerBonusPerStoneMs,
  postTimerBonusThresholdMs,
  freezeBarState,
  addGold,
  logSkillRatingDebug,
  getTimeLeft,
  onResult,
}) {
  return () => {
    const result = checkAnswers({
      timerUI,
      config,
      stones,
      currentMode,
      speedMultiplier,
      postTimerBonusPerStoneMs,
      postTimerBonusThresholdMs,
      freezeBarState,
      addGold,
      logSkillRatingDebug,
      timeLeft: getTimeLeft?.() ?? 0,
    });
    onResult?.({
      passed: Boolean(result?.passed),
      targetWasCorrect: result?.targetWasCorrect,
    });
    return result;
  };
}

export { checkAnswers, createCheckAnswersHandler };
