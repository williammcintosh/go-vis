function hideFeedbackPanel(feedback) {
  if (!feedback) return;
  feedback.style.display = 'none';
  feedback.classList.remove('show');
}

function clearMarkers(root = document) {
  if (!root) return;
  root.querySelectorAll('.marker').forEach((marker) => marker.remove());
}

function resetBoardUI(board, root = document) {
  if (board) {
    board.replaceChildren();
  }
  clearMarkers(root);
}

function resetLevelUI(nextBtn, levelOkBtn) {
  if (nextBtn?.disabled) {
    nextBtn.disabled = false;
  }
  nextBtn?.click();
  if (levelOkBtn) {
    levelOkBtn.style.display = 'none';
  }
}

function disableInteraction(intersections, checkBtn) {
  intersections?.forEach?.((intersection) => {
    intersection.style.pointerEvents = 'none';
  });
  if (checkBtn) {
    checkBtn.disabled = true;
    checkBtn.style.opacity = '0.5';
  }
}

function enableInteraction(intersections, checkBtn) {
  intersections?.forEach?.((intersection) => {
    intersection.style.pointerEvents = 'auto';
  });
  if (checkBtn) {
    checkBtn.disabled = false;
    checkBtn.style.opacity = '1';
  }
}

function showMainScreen({ mainGame, show, hide, showScreen }) {
  if (mainGame) {
    mainGame.style.display = 'none';
  }
  showScreen?.(show, hide);
}

function showHomeScreen({
  feedback,
  updateBonusAvailability,
  activeGame,
  mainGame,
  intro,
  difficulty,
  showScreen,
  setSpeedMultiplier,
}) {
  hideFeedbackPanel(feedback);
  updateBonusAvailability?.();
  if (activeGame?.timer) {
    setSpeedMultiplier?.(1);
    clearInterval(activeGame.timer);
  }
  if (mainGame) {
    mainGame.style.display = 'none';
  }
  showScreen?.(intro, difficulty);
}

async function prepareNextChallenge({
  feedback,
  updateBonusAvailability,
  activeGame,
  setSpeedMultiplier,
  board,
  documentRoot,
  startGame,
}) {
  hideFeedbackPanel(feedback);
  updateBonusAvailability?.();
  if (activeGame?.timer) {
    setSpeedMultiplier?.(1);
    clearInterval(activeGame.timer);
  }
  resetBoardUI(board, documentRoot);
  const mode = activeGame.mode;
  await startGame(mode);
}

function resetGameStateUI({
  localStorage,
  PLAYER_PROGRESS_KEY,
  CHALLENGE_ATTEMPTS_KEY,
  saveDifficultyState,
  renderSkillRating,
  normalizeProgress,
  setProgress,
  gameState,
  emptyPlayerProgress,
  emptyChallengeAttempts,
  resetTutorialProgress,
  showScreen,
  difficulty,
  intro,
  refreshHomeButtons,
  scoreElement,
}) {
  localStorage.removeItem('goVizProgress');
  localStorage.removeItem('skill_rating');
  localStorage.removeItem('skill_progress');
  localStorage.removeItem(PLAYER_PROGRESS_KEY);
  localStorage.removeItem(CHALLENGE_ATTEMPTS_KEY);

  const difficultyState = saveDifficultyState({ rating: 0, level: 1 });
  renderSkillRating(difficultyState.rating);
  const progress = normalizeProgress();
  setProgress?.(progress);
  gameState.currentRound = 1;
  const playerProgress = emptyPlayerProgress();
  const challengeAttempts = emptyChallengeAttempts();

  gameState.score = 0;
  if (scoreElement) {
    scoreElement.textContent = '0';
  }
  resetTutorialProgress?.();

  showScreen?.(difficulty, intro);
  refreshHomeButtons?.();

  return { difficultyState, playerProgress, challengeAttempts };
}

export {
  hideFeedbackPanel,
  clearMarkers,
  resetBoardUI,
  resetLevelUI,
  disableInteraction,
  enableInteraction,
  showMainScreen,
  showHomeScreen,
  prepareNextChallenge,
  resetGameStateUI,
};
