const REACTION_TIME_BASE = 4000;
const REACTION_TIME_SLOW = 10000;
const SPEED_BONUS_MAX = 300;
const TARGET_THREE_GAMES_TOTAL = 100;
const TARGET_AVG_PER_GAME = TARGET_THREE_GAMES_TOTAL / 3;
window.SPEED_BONUS_MAX = SPEED_BONUS_MAX;

let activeGoldStack = null;

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

function getRewardScale() {
  const basePos = Number(window.POSITION_BONUS) || 0;
  const baseColor = Number(window.COLOR_BONUS) || 0;
  const baseSeq = Number(window.SEQUENCE_BONUS) || 0;
  const baseSlowPos = basePos + baseColor;
  const baseSlowSeq = baseSlowPos + baseSeq;
  const baseValues = [baseSlowPos, baseSlowSeq].filter((v) =>
    Number.isFinite(v)
  );
  const baseSlowAvg =
    baseValues.reduce((a, b) => a + b, 0) / Math.max(1, baseValues.length);
  const speedHalf = (Number(window.SPEED_BONUS_MAX) || SPEED_BONUS_MAX) / 2;
  const currentMid = baseSlowAvg + speedHalf;
  if (!currentMid || currentMid <= 0) return 1;
  const scale = TARGET_AVG_PER_GAME / currentMid;
  window.REWARD_SCALE = scale;
  return scale;
}

function getStoneCountForRewards() {
  const fromActive =
    window.activeGame?.challengeStoneCount ??
    window.activeGame?.puzzleConfig?.stoneCount;
  const parsedActive = Number(fromActive);
  if (Number.isFinite(parsedActive) && parsedActive > 0) return parsedActive;
  const parsedWindow = Number(window.MIN_STONES);
  if (Number.isFinite(parsedWindow) && parsedWindow > 0) return parsedWindow;
  return 5;
}

function showGoldFloat(label, amount, duration = getGoldAwardDuration(amount)) {
  const goldValueEl = document.getElementById('goldValue');
  if (!goldValueEl) return Promise.resolve();
  const goldBadge = document.getElementById('goldBadge');
  const badgeRect = goldBadge?.getBoundingClientRect();
  const startRect = goldValueEl.getBoundingClientRect();
  const relX = badgeRect
    ? badgeRect.left + badgeRect.width / 2 - 120
    : startRect.left + startRect.width / 2 - 120;
  const relY = badgeRect ? badgeRect.bottom - 0 : startRect.top - 0;
  const float = document.createElement('div');
  float.className = 'gold-float';
  float.textContent = `+${amount} ${label}`;
  float.style.fontSize = 'clamp(0.5rem, 2vw + 0.4rem, 1.35rem)';
  float.style.left = `${relX}px`;
  float.style.top = `${relY}px`;
  float.style.transform = `translateX(-50%)`;
  document.body.appendChild(float);
  const keyframes = [
    { transform: 'translate(-50%, 0)', opacity: 0 },
    { transform: 'translate(-50%, 0)', opacity: 1, offset: 0.0002 },
    { transform: 'translate(-50%, -20px)', opacity: 1, offset: 0.99 },
    { transform: 'translate(-50%, -25px)', opacity: 0 },
  ];
  const animation = float.animate(keyframes, {
    duration,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    fill: 'forwards',
  });
  return animation.finished.then(() => float.remove());
}

function showGoldFloatStack(labels) {
  const goldValueEl = document.getElementById('goldValue');
  if (!goldValueEl) return null;
  const goldBadge = document.getElementById('goldBadge');
  const badgeRect = goldBadge?.getBoundingClientRect();
  const startRect = goldValueEl.getBoundingClientRect();
  const relX = badgeRect
    ? badgeRect.left + badgeRect.width / 2 + 20
    : startRect.left + startRect.width / 2 + 20;
  const relY = badgeRect ? badgeRect.bottom + 10 : startRect.top + 10;
  const container = document.createElement('div');
  container.className = 'gold-float gold-float-stack';
  container.style.fontSize = 'clamp(0.5rem, 2vw + 0.4rem, 1.35rem)';
  container.style.position = 'absolute';
  container.style.left = `${relX}px`;
  container.style.top = `${relY}px`;
  container.style.transform = 'translateX(-50%)';
  const addLine = (text) => {
    const line = document.createElement('div');
    line.textContent = text;
    container.appendChild(line);
  };
  clearGoldRewardText();
  activeGoldStack = { container, addLine };
  (labels || []).forEach((text) => addLine(text));
  document.body.appendChild(container);
  return { container, addLine };
}

function clearGoldRewardText() {
  if (activeGoldStack?.container?.remove) {
    activeGoldStack.container.remove();
  }
  activeGoldStack = null;
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
  positionsReward = false,
  colorsReward = false,
} = {}) {
  const rewardScale = getRewardScale();
  const stoneCount = getStoneCountForRewards();
  const baselineStones = Number(window.MIN_STONES) || 5;
  const stoneFactor = Math.max(1, stoneCount / Math.max(1, baselineStones));
  const scaleValue = (value) =>
    Math.max(0, Math.round(value * rewardScale * stoneFactor));
  const breakdown = [];
  if (positionsReward) {
    breakdown.push({
      label: 'Positions',
      value: scaleValue(window.POSITION_BONUS),
    });
  }
  if (colorsReward) {
    breakdown.push({
      label: 'Colors',
      value: scaleValue(window.COLOR_BONUS),
    });
  }
  if (finalBoardCorrect) {
    const speedBonus = calculateSpeedBonus(reactionTime);
    if (speedBonus) {
      breakdown.push({ label: 'Speed', value: scaleValue(speedBonus) });
      if (speedBonus > 0 && window.activeGame) {
        window.activeGame.maxSpeedBonusAchieved = true;
      }
    }
  }
  if (
    finalBoardCorrect &&
    window.currentMode === 'sequence' &&
    sequenceOrderIssues === 0
  ) {
    breakdown.push({
      label: 'Perfect sequence',
      value: scaleValue(window.SEQUENCE_BONUS),
    });
  }
  if (!breakdown.length) return;

  const stack = showGoldFloatStack();

  for (const award of breakdown) {
    const baseLabel = (award.label || '')
      .replace(/bonus/gi, '')
      .replace(/correct/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const decoratedLabel = `${baseLabel.toUpperCase()} \u2705  +${award.value}`;
    stack?.addLine(decoratedLabel);
    const goldPromise = animateGoldValue(award.value);
    await goldPromise;
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

  const cost =
    typeof window.getBonusCost === 'function'
      ? window.getBonusCost()
      : window.BONUS_COST;
  const canAffordBonus = window.gameState.gold >= (Number(cost) || 0);
  const timerIsRunning = Boolean(window.activeGame?.timer);
  const feedbackActive = isFeedbackVisible();

  setBonusState(
    addTime,
    !feedbackActive && canAffordBonus && !window.isRefilling && timerIsRunning
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
  clearGoldRewardText,
};
