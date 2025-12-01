function getAwardDuration(amount) {
  // Keep awards snappy even for large amounts
  return Math.max(
    Math.round((amount * window.SCORE_STEP_DELAY + 200) * 0.4),
    280
  );
}

const REACTION_TIME_BASE = 4000;
const REACTION_TIME_SLOW = 10000;
const SPEED_BONUS_MAX = 300;

function calculateSpeedBonus(reactionTime = REACTION_TIME_SLOW) {
  const normalized =
    1 -
    Math.min(
      1,
      Math.max(
        0,
        (reactionTime - REACTION_TIME_BASE) /
          (REACTION_TIME_SLOW - REACTION_TIME_BASE)
      )
    );
  return Math.round(normalized * SPEED_BONUS_MAX);
}

function showScoreFloat(label, amount, duration = getAwardDuration(amount)) {
  const scoreValueEl = document.getElementById('scoreValue');
  if (!scoreValueEl) return Promise.resolve();
  const startRect = scoreValueEl.getBoundingClientRect();
  const float = document.createElement('div');
  float.className = 'score-float';
  float.textContent = `+${amount}  ${label}`;
  const startX = startRect.left + startRect.width / 2;
  const startY = startRect.top - 16;
  float.style.transform = `translate(${startX}px, ${startY}px)`;
  document.body.appendChild(float);
  const animation = float.animate(
    [
      { transform: `translate(${startX}px, ${startY}px)`, opacity: 0 },
      {
        transform: `translate(${startX}px, ${startY}px)`,
        opacity: 1,
        offset: 0.0002,
      },
      {
        transform: `translate(${startX}px, ${startY - 20}px)`,
        opacity: 1,
        offset: 0.99,
      },
      {
        transform: `translate(${startX}px, ${startY - 25}px)`,
        opacity: 0,
      },
    ],
    {
      duration,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'forwards',
    }
  );
  return animation.finished.then(() => float.remove());
}

function animateScoreValue(amount, duration = getAwardDuration(amount)) {
  if (!amount || amount <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const scoreValueEl = document.getElementById('scoreValue');
    const scoreDisplay = document.getElementById('scoreDisplay');
    const start = window.gameState.score;
    const target = start + amount;
    if (scoreValueEl) {
      scoreValueEl.animate(
        [
          { transform: 'scale(1)', opacity: 0.9 },
          { transform: 'scale(1.15)', opacity: 1 },
          { transform: 'scale(1)', opacity: 0.9 },
        ],
        {
          duration,
          easing: 'ease-out',
          fill: 'forwards',
        }
      );
    }

    const startTime = performance.now();
    const tick = (now) => {
      const elapsed = now - startTime;
      const ratio = Math.min(1, elapsed / duration);
      const nextValue = Math.round(start + (target - start) * ratio);
      window.gameState.score = nextValue;
      if (scoreValueEl) scoreValueEl.textContent = nextValue;
      if (ratio < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    };

    requestAnimationFrame(tick);
  });
}

async function addScore({
  reactionTime = REACTION_TIME_SLOW,
  finalBoardCorrect = false,
  sequenceOrderIssues = 0,
} = {}) {
  if (!finalBoardCorrect) return;
  const breakdown = [
    { label: 'Correct positions', value: window.POSITION_BONUS },
    { label: 'Correct colors', value: window.COLOR_BONUS },
  ];
  const speedBonus = calculateSpeedBonus(reactionTime);
  if (speedBonus) {
    breakdown.push({ label: 'Speed bonus', value: speedBonus });
    if (speedBonus > 0 && window.activeGame) {
      window.activeGame.maxSpeedBonusAchieved = true;
    }
  }
  if (window.currentMode === 'sequence' && sequenceOrderIssues === 0) {
    breakdown.push({ label: 'Perfect sequence', value: window.SEQUENCE_BONUS });
  }
  if (!breakdown.length) return;

  for (const award of breakdown) {
    const floatPromise = showScoreFloat(award.label, award.value);
    const scorePromise = animateScoreValue(award.value);
    await Promise.all([floatPromise, scorePromise]);
    await window.delay(window.SCORE_AWARD_PAUSE);
  }

  window.persistProgress();
  updateBonusAvailability();
  window.refreshHomeButtons();
}

function deductPoints(cost, sourceElement) {
  const scoreDisplay = document.getElementById('scoreDisplay');
  const scoreValue = document.getElementById('scoreValue');
  const startRect = sourceElement.getBoundingClientRect();
  const endRect = scoreValue.getBoundingClientRect();

  const start = {
    x: startRect.left + startRect.width / 2,
    y: startRect.top + startRect.height / 2,
  };

  const end = {
    x: endRect.left + endRect.width / 2,
    y: endRect.top + endRect.height / 2,
  };

  const float = document.createElement('div');
  float.className = 'score-float score-float--deduct';
  float.textContent = `-${cost}`;
  float.style.transform = `translate(${start.x}px, ${start.y}px) scale(1)`;
  document.body.appendChild(float);

  const animationDuration = 900;
  const animation = float.animate(
    [
      {
        transform: `translate(${start.x}px, ${start.y}px) scale(0.9)`,
        opacity: 0,
      },
      {
        transform: `translate(${start.x}px, ${start.y - 20}px) scale(1.05)`,
        opacity: 1,
        offset: 0.2,
      },
      {
        transform: `translate(${end.x}px, ${end.y}px) scale(0.6)`,
        opacity: 0,
      },
    ],
    {
      duration: animationDuration,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'forwards',
    }
  );

  window.gameState.score -= cost;

  let settled = false;
  const finalizeDeduction = () => {
    if (settled) return;
    settled = true;
    float.remove();
    scoreValue.textContent = window.gameState.score;
    scoreDisplay.style.animation = 'scoreDeduct 0.5s ease';
    setTimeout(() => (scoreDisplay.style.animation = ''), window.ANIM_DELAY);
    updateBonusAvailability();
    window.persistProgress();
    window.refreshHomeButtons();
  };

  animation.addEventListener('finish', finalizeDeduction);
  setTimeout(finalizeDeduction, animationDuration + 100);
}

function flashScoreWarning() {
  const scoreValueEl = document.getElementById('scoreValue');
  if (!scoreValueEl) return;
  scoreValueEl.classList.remove('score-alert');
  void scoreValueEl.offsetWidth;
  scoreValueEl.classList.add('score-alert');
}

function isFeedbackVisible() {
  const feedback = document.getElementById('feedback');
  return Boolean(feedback?.classList.contains('show'));
}

function setBonusState(button, enabled) {
  if (!button) return;
  button.classList.toggle('disabled', !enabled);
  button.setAttribute('aria-disabled', String(!enabled));
}

function updateBonusAvailability() {
  const addTime = document.getElementById('addTimeBonus');
  const eyeGlass = document.getElementById('eyeGlassBonus');

  if (!addTime || !eyeGlass) return;

  const canAffordBonus = window.gameState.score >= window.BONUS_COST;
  const timerIsRunning = Boolean(window.activeGame?.timer);
  const feedbackActive = isFeedbackVisible();

  setBonusState(
    addTime,
    !feedbackActive &&
      canAffordBonus &&
      !window.isRefilling &&
      timerIsRunning
  );
  setBonusState(
    eyeGlass,
    !feedbackActive &&
      canAffordBonus &&
      window.canUseEyeGlass &&
      !window.isRefilling
  );
}

export {
  addScore,
  showScoreFloat,
  animateScoreValue,
  deductPoints,
  flashScoreWarning,
  updateBonusAvailability,
  setBonusState,
  isFeedbackVisible,
  getAwardDuration,
  calculateSpeedBonus,
};
