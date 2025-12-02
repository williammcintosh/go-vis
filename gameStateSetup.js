function setupGameState({
  mode,
  progress,
  gameState,
  difficultyState,
  MODE_INTERVAL_SPEED,
  MIN_STONES,
  getBoardSizeForLevel,
  updateModeIndicator,
  renderSkillRating,
  nextPuzzleSuggestion,
  setNextPuzzleSuggestion,
  getTapMode,
  persistProgress,
  setSpeedMultiplier,
  setLastTap,
  setLastStoneTap,
}) {
  if (!window.activeGame) window.activeGame = { mode };
  else window.activeGame.mode = mode;

  window.activeGame.tapMode = getTapMode();
  window.activeGame.lastPlacedColor = 'white';
  if (!progress[mode].started) {
    progress[mode].started = true;
    persistProgress();
  }
  window.activeGame.sequenceHistory = [];
  window.activeGame.nextHintIndex = 0;

  setSpeedMultiplier(1);
  setLastTap(0);
  setLastStoneTap({ time: 0, target: null });

  const level = progress[mode].level;
  const levelConfig = gameState.levels[level - 1] || gameState.levels[0];
  const currentLevel = progress[mode].level;
  gameState.currentLevel = currentLevel || 1;
  gameState.currentRound = progress[mode].round || 1;

  const plannedPuzzle = nextPuzzleSuggestion;
  setNextPuzzleSuggestion(null);
  const playerLevel = difficultyState.level || 1;
  renderSkillRating(difficultyState.rating);
  const resolvedBoardSize =
    plannedPuzzle?.boardSize ?? getBoardSizeForLevel(playerLevel);

  document.getElementById(
    'levelText'
  ).textContent = `Level ${gameState.currentLevel}`;
  document.getElementById(
    'roundText'
  ).textContent = `Round ${gameState.currentRound}/${gameState.totalRounds}`;

  updateModeIndicator(mode);
  const TIME_PER_STONE = 7;
  const stoneCount = Math.max(
    MIN_STONES,
    plannedPuzzle?.stoneCount ?? levelConfig.stones
  );
  const config = {
    intervalSpeed: MODE_INTERVAL_SPEED[mode] ?? 40,
    stoneCount,
    size: Math.max(2, (resolvedBoardSize || levelConfig.boardSize) - 1),
    time: stoneCount * TIME_PER_STONE,
  };

  const boardDimension = config.size + 1;
  window.activeGame.puzzleConfig = {
    stoneCount: config.stoneCount,
    boardSize: boardDimension,
  };
  window.activeGame.startingLevel = gameState.currentLevel || 1;
  window.activeGame.startingRound = gameState.currentRound || 1;
  window.activeGame.startedAt = Date.now();
  window.activeGame.timedOut = false;
  window.activeGame.timerEndTime = null;
  window.activeGame.difficultyRecorded = false;
  window.activeGame.speedBoostUsed = false;
  window.activeGame.speedBonusUsed = false;
  window.activeGame.maxSpeedBonusAchieved = false;
  window.activeGame.usedAssistBonus = false;
  window.activeGame.initialRemainingRatio = null;
  window.activeGame.startTimestampSolve = null;
  window.activeGame.timeLeftAtSolveStart = null;
  window.activeGame.timeLeftAtSolveEnd = null;
  window.activeGame.timeLeftAtHide = null;
  window.activeGame.barRatioAtHide = null;
  window.activeGame.playerSkipped = false;
  window.activeGame.freezeReason = null;
  window.activeGame.totalTime = config.time;
  window.activeGame.challengeCompleted = false;

  return { config, boardDimension, updatedActiveGame: window.activeGame };
}

export { setupGameState };
