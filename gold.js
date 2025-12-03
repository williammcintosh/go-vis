const REACTION_TIME_BASE = 4000;
const REACTION_TIME_SLOW = 10000;
const SPEED_BONUS_MAX = 300;

function getGoldAwardDuration(amount) {
  // Keep awards snappy even for large amounts
  return Math.max(
    Math.round((amount * window.GOLD_STEP_DELAY + 200) * 0.4),
    280
  );
}

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

function showGoldFloat(label, amount, duration = getGoldAwardDuration(amount)) {
  const goldValueEl = document.getElementById('goldValue');
  if (!goldValueEl) return Promise.resolve();
  const startRect = goldValueEl.getBoundingClientRect();
  const float = document.createElement('div');
  float.className = 'gold-float';
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

function animateGoldValue(amount, duration = getGoldAwardDuration(amount)) {
  if (!amount || amount <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const goldValueEl = document.getElementById('goldValue');
    const start = window.gameState.gold;
    const target = start + amount;
    if (goldValueEl) {
      goldValueEl.animate(
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
      window.gameState.gold = nextValue;
      if (goldValueEl) goldValueEl.textContent = nextValue;
      if (ratio < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    };

    requestAnimationFrame(tick);
  });
}

async function addGold({
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
    const floatPromise = showGoldFloat(award.label, award.value);
    const goldPromise = animateGoldValue(award.value);
    await Promise.all([floatPromise, goldPromise]);
    await window.delay(window.GOLD_AWARD_PAUSE);
  }

  window.persistProgress();
  updateBonusAvailability();
  window.refreshHomeButtons();
}

function deductGold(cost, sourceElement) {
  const goldValue = document.getElementById('goldValue');
  const startRect = sourceElement.getBoundingClientRect();
  const endRect = goldValue.getBoundingClientRect();

  const start = {
    x: startRect.left + startRect.width / 2,
    y: startRect.top + startRect.height / 2,
  };

  const end = {
    x: endRect.left + endRect.width / 2,
    y: endRect.top + endRect.height / 2,
  };

  const float = document.createElement('div');
  float.className = 'gold-float gold-float--deduct';
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

  window.gameState.gold -= cost;

  let settled = false;
  const finalizeDeduction = () => {
    if (settled) return;
    settled = true;
    float.remove();
    goldValue.textContent = window.gameState.gold;
    goldValue.style.animation = 'goldDeduct 0.5s ease';
    setTimeout(() => (goldValue.style.animation = ''), window.ANIM_DELAY);
    updateBonusAvailability();
    window.persistProgress();
    window.refreshHomeButtons();
  };

  animation.addEventListener('finish', finalizeDeduction);
  setTimeout(finalizeDeduction, animationDuration + 100);
}

function flashGoldWarning() {
  const goldValueEl = document.getElementById('goldValue');
  if (!goldValueEl) return;
  goldValueEl.classList.remove('gold-alert');
  void goldValueEl.offsetWidth;
  goldValueEl.classList.add('gold-alert');
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

  const canAffordBonus = window.gameState.gold >= window.BONUS_COST;
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
  addGold,
  showGoldFloat,
  animateGoldValue,
  deductGold,
  flashGoldWarning,
  updateBonusAvailability,
  setBonusState,
  isFeedbackVisible,
  getGoldAwardDuration,
  calculateSpeedBonus,
};
