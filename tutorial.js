function createTutorialController() {
  const overlay = document.getElementById('tutorialOverlay');
  const highlight = document.getElementById('tutorialHighlight');
  const tooltip = document.getElementById('tutorialTooltip');
  const tooltipText = document.getElementById('tutorialText');
  const tooltipBtn = document.getElementById('tutorialOkBtn');
  const skipPanel = document.getElementById('tutorialSkip');
  const skipBtn = document.getElementById('tutorialSkipBtn');

  let shouldRun = false;
  let active = false;
  let completed = false;
  let holdTimer = false;
  let ignoreDoubleTap = false;
  let waitingForAddTime = false;
  let addTimeResolver = null;
  let tooltipResolver = null;
  let hideTooltipTimeout = null;
  let context = null;
  let activeStep = null;
  const completionListeners = [];

  tooltipBtn?.addEventListener('click', () => {
    if (!tooltipResolver) return;
    const resolve = tooltipResolver;
    tooltipResolver = null;
    hideTooltip();
    hideHighlight();
    resolve();
  });

  skipBtn?.addEventListener('click', () => finish(true));

  window.addEventListener('resize', () => {
    if (!skipPanel?.classList.contains('tutorial-hidden')) {
      positionSkipPanel();
    }
    refreshActiveStepLayout();
  });

  function configure({ shouldRun: value }) {
    shouldRun = value;
  }

  function attachToGame(gameContext) {
    if (!shouldRun || active || completed) return;
    context = gameContext;
    startSequence();
  }

  function startSequence() {
    if (active || !context) return;
    active = true;
    ignoreDoubleTap = true;
    showSkip(true);
    overlay?.classList.remove('tutorial-hidden');
    runSequence();
  }

  async function runSequence() {
    try {
      await delay(1400);
      if (!active) return;
      setHold(true);
      if (!active) return;
      const introText =
        context.mode === 'sequence'
          ? '[1/5] Memorize the locations and colors of these stones in order.'
          : '[1/5] Memorize the locations and colors of these five stones.';
      await showStep(context.board, introText, {
        placement: 'center',
        maxWidth: 360,
      });
      if (!active) return;
      await showStep(
        context.timerContainer,
        '[2/5] Memorize those stones before the timer runs out.',
        { placement: 'top' }
      );
      if (!active) return;
      setDim(false);
      setHold(false);
      await delay(1200);
      if (!active) return;
      setHold(true);
      grantStarterBoost();
      await showStep(
        context.addTimeBonus,
        '[3/5] You can purchase more time by pressing this button while the timer is running.',
        { placement: 'top', centerGame: true, maxWidth: 360 }
      );
      if (!active) return;
      setDim(false);
      pulseAddTime(true);
      setHold(false);
      await waitForAddTimeOrLow();
      if (!active) return;
      pulseAddTime(false);
      setHold(true);
      await showStep(
        context.timerContainer,
        '[4/5] Alternatively, you can double-tap anywhere to speed up the timer bar.',
        { placement: 'top' }
      );
      if (!active) return;
      ignoreDoubleTap = false;
      setDim(false);
      setHold(false);
      await delay(800);
      if (!active) return;
      await waitForTimerToEnd();
      if (!active) return;
      setHold(true);
      context.clearBoard?.();
      await showStep(
        context.eyeGlassBonus,
        '[5/5] Need a hint? Tap the eyeglass to preview the next two stones in the sequence.',
        { placement: 'top', centerGame: true, maxWidth: 360 }
      );
      if (!active) return;
      finish(false);
    } catch (err) {
      finish(true);
    }
  }

  function setHold(value) {
    holdTimer = !!value;
  }

  function setDim(value) {
    if (!overlay) return;
    overlay.classList.remove('tutorial-hidden');
    if (value) overlay.classList.add('active');
    else overlay.classList.remove('active');
  }

  function hideAll() {
    overlay?.classList.add('tutorial-hidden');
    overlay?.classList.remove('active');
    hideTooltip();
    hideHighlight();
    showSkip(false);
    activeStep = null;
  }

  function hideTooltip() {
    if (!tooltip) return;
    tooltip.classList.remove('active');
    if (hideTooltipTimeout) clearTimeout(hideTooltipTimeout);
    hideTooltipTimeout = setTimeout(() => {
      tooltip.classList.add('tutorial-hidden');
      hideTooltipTimeout = null;
    }, 150);
    activeStep = null;
  }

  function hideHighlight() {
    if (!highlight) return;
    highlight.classList.remove('active');
    highlight.classList.add('tutorial-hidden');
    if (activeStep) activeStep.target = null;
  }

  function showSkip(show) {
    if (!skipPanel) return;
    if (show) {
      skipPanel.classList.remove('tutorial-hidden');
      requestAnimationFrame(() => {
        positionSkipPanel();
        skipPanel.classList.add('active');
      });
    } else {
      skipPanel.classList.remove('active');
      setTimeout(() => skipPanel.classList.add('tutorial-hidden'), 150);
    }
  }

  function positionSkipPanel() {
    if (!skipPanel) return;
    const bonus = document.getElementById('bonusContainer');
    const frame = document.querySelector('.game-wrapper');
    const anchorRect =
      bonus?.getBoundingClientRect() || frame?.getBoundingClientRect();
    const panelRect = skipPanel.getBoundingClientRect();
    let top = window.innerHeight - panelRect.height - TUTORIAL_SKIP_OFFSET;
    if (anchorRect) {
      top = Math.min(
        window.innerHeight - panelRect.height - 20,
        anchorRect.bottom + TUTORIAL_SKIP_OFFSET
      );
    }
    skipPanel.style.top = `${Math.max(10, top)}px`;
    skipPanel.style.bottom = 'auto';
  }

  function pulseAddTime(enable) {
    if (!context?.addTimeBonus) return;
    if (enable) context.addTimeBonus.classList.add('tutorial-pulse');
    else context.addTimeBonus.classList.remove('tutorial-pulse');
  }

  function grantStarterBoost() {
    if (gameState.gold < 600) {
      gameState.gold = 600;
      const goldValue = document.getElementById('goldValue');
      if (goldValue) {
        goldValue.textContent = gameState.gold;
      }
      updateBonusAvailability();
    }
    context?.addTimeBoost?.(5);
  }

  function waitForAddTimeOrLow() {
    return new Promise((resolve) => {
      waitingForAddTime = true;
      addTimeResolver = resolve;
      setTimeout(() => resolveAddTime('timeout'), 8000);
    });
  }

  function waitForTimerToEnd() {
    return new Promise((resolve) => {
      if (!context?.getTimeRatio) {
        resolve();
        return;
      }
      const check = () => {
        const ratio = context.getTimeRatio();
        if (ratio <= 0 || !window.activeGame || !window.activeGame.timer) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });
  }

  function setHighlightTarget(target, padding = 12, silent = false) {
    if (!highlight || !target) return;
    const rect = target.getBoundingClientRect();
    const width = rect.width + padding * 2;
    const height = rect.height + padding * 2;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    highlight.style.width = width + 'px';
    highlight.style.height = height + 'px';
    highlight.style.left = `${centerX}px`;
    highlight.style.top = `${centerY}px`;
    highlight.classList.remove('tutorial-hidden');
    if (silent) {
      highlight.classList.add('active');
    } else {
      highlight.classList.remove('active');
      requestAnimationFrame(() => highlight.classList.add('active'));
    }
  }

  function showStep(target, text, opts = {}) {
    const placement = opts.placement || 'bottom';
    setDim(true);
    if (target) {
      setHighlightTarget(target, opts.padding || 12);
    } else {
      hideHighlight();
    }
    if (tooltip) {
      if (hideTooltipTimeout) {
        clearTimeout(hideTooltipTimeout);
        hideTooltipTimeout = null;
      }
      tooltipText.textContent = text;
      tooltip.classList.remove('tutorial-hidden');
      positionTooltip(
        target ? target.getBoundingClientRect() : null,
        placement,
        opts
      );
      requestAnimationFrame(() => tooltip.classList.add('active'));
    }
    activeStep = {
      target,
      padding: opts.padding || 12,
      placement,
      options: opts,
    };
    return new Promise((resolve) => {
      tooltipResolver = resolve;
    });
  }

  function positionTooltip(rect, placement, opts = {}) {
    if (!tooltip) return;
    const margin = 16;
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    if (opts.maxWidth) {
      tooltip.style.maxWidth =
        typeof opts.maxWidth === 'number'
          ? `${opts.maxWidth}px`
          : opts.maxWidth;
    } else {
      tooltip.style.maxWidth = '';
    }
    const tooltipRect = tooltip.getBoundingClientRect();
    const tooltipW = tooltipRect.width || 240;
    const tooltipH = tooltipRect.height || 140;

    let resolvedPlacement = placement;
    if (rect) {
      if (resolvedPlacement === 'top' && rect.top - tooltipH - margin < 0) {
        resolvedPlacement = 'bottom';
      } else if (
        resolvedPlacement === 'bottom' &&
        rect.bottom + tooltipH + margin > viewH
      ) {
        resolvedPlacement = 'top';
      } else if (
        resolvedPlacement === 'left' &&
        rect.left - tooltipW - margin < 0
      ) {
        resolvedPlacement = 'right';
      } else if (
        resolvedPlacement === 'right' &&
        rect.right + tooltipW + margin > viewW
      ) {
        resolvedPlacement = 'left';
      }
    }

    let left = viewW / 2;
    let top = viewH / 2;
    let transform = 'translate(-50%, -50%)';
    if (rect) {
      if (opts.centerGame) {
        const wrapper = document.querySelector('.game-wrapper');
        if (wrapper) {
          const wrapRect = wrapper.getBoundingClientRect();
          left = wrapRect.left + wrapRect.width / 2;
        }
      } else {
        left = rect.left + rect.width / 2;
      }
      if (resolvedPlacement === 'top') {
        top = rect.top - margin;
        transform = 'translate(-50%, -100%)';
      } else if (resolvedPlacement === 'bottom') {
        top = rect.bottom + margin;
        transform = 'translate(-50%, 0)';
      } else if (resolvedPlacement === 'right') {
        top = rect.top + rect.height / 2;
        left = rect.right + margin;
        transform = 'translate(0, -50%)';
      } else if (resolvedPlacement === 'left') {
        top = rect.top + rect.height / 2;
        left = rect.left - margin;
        transform = 'translate(-100%, -50%)';
      } else if (resolvedPlacement === 'center') {
        top = rect.top + rect.height / 2;
        left = rect.left + rect.width / 2;
        transform = 'translate(-50%, -50%)';
      }
    } else if (opts.centerGame) {
      const wrapper = document.querySelector('.game-wrapper');
      if (wrapper) {
        const wrapRect = wrapper.getBoundingClientRect();
        left = wrapRect.left + wrapRect.width / 2;
        top = wrapRect.bottom - wrapRect.height * 0.2;
      }
    }

    left = Math.min(viewW - margin, Math.max(margin, left));
    top = Math.min(viewH - margin, Math.max(margin, top));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.transform = transform;
  }

  function finish(skipped) {
    if (!active && completed) return;
    active = false;
    completed = true;
    shouldRun = false;
    holdTimer = false;
    ignoreDoubleTap = false;
    pulseAddTime(false);
    resolveAddTime('skip');
    if (tooltipResolver) {
      const resolve = tooltipResolver;
      tooltipResolver = null;
      resolve();
    }
    hideAll();
    localStorage.setItem(TUTORIAL_KEY, '1');
    completionListeners.forEach((cb) => {
      try {
        cb?.(skipped);
      } catch (_err) {
        /* ignore listener errors */
      }
    });
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function resolveAddTime(reason) {
    if (!waitingForAddTime) return;
    waitingForAddTime = false;
    const resolver = addTimeResolver;
    addTimeResolver = null;
    if (resolver) resolver(reason);
  }

  function refreshActiveStepLayout() {
    if (!activeStep) return;
    const { target, padding, placement, options } = activeStep;
    if (target && document.body.contains(target)) {
      setHighlightTarget(target, padding, true);
      positionTooltip(target.getBoundingClientRect(), placement, options);
    } else {
      hideHighlight();
      positionTooltip(null, placement, options || {});
    }
  }

  function buildGameAttachment({
    board,
    timerContainer,
    addTimeBonus,
    eyeGlassBonus,
    addTimeBoost,
    clearBoard,
    getTimeRatio,
    mode,
  }) {
    return {
      board,
      timerContainer,
      addTimeBonus,
      eyeGlassBonus,
      addTimeBoost,
      clearBoard,
      getTimeRatio,
      mode,
    };
  }

  return {
    configure,
    attachToGame,
    buildGameAttachment,
    onComplete: (cb) => {
      if (typeof cb === 'function') {
        completionListeners.push(cb);
        if (completed) {
          try {
            cb(false);
          } catch (_err) {
            /* ignore */
          }
        }
      }
    },
    shouldHoldTimer: () => active && holdTimer,
    shouldIgnoreDoubleTap: () => active && ignoreDoubleTap,
    onAddTimeUsed: () => {
      resolveAddTime('clicked');
    },
    onTimerTick: (ratio) => {
      if (waitingForAddTime && ratio <= 0.25) {
        resolveAddTime('low');
      }
    },
    reset: () => {
      shouldRun = true;
      completed = false;
      active = false;
      holdTimer = false;
      ignoreDoubleTap = false;
      waitingForAddTime = false;
      addTimeResolver = null;
      tooltipResolver = null;
      hideTooltipTimeout && clearTimeout(hideTooltipTimeout);
      hideTooltipTimeout = null;
      activeStep = null;
      hideAll();
      localStorage.removeItem(TUTORIAL_KEY);
    },
  };
}

export { createTutorialController };
