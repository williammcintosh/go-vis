import { getPlayerProgressIndex } from './puzzle.js';
import { launchConfetti } from './anim.js';

const STORAGE_KEY = 'goVizLevelSelect';
const MIN_STONES = 5;
const STONE_INCREMENT = 10;
const BOARD_UNLOCKS = {
  5: 0,
  6: 100,
  7: 1000,
};
const BOARD_IMAGES = {
  5: 'images/board_5x5.png',
  6: 'images/board_6x6.png',
  7: 'images/board_7x7.png',
};

function createLevelSelectController({
  introEl,
  difficultyEl,
  mainGameEl,
  showScreen,
  setMode,
  setNextPuzzleSuggestion,
  startGame,
  getSkillRating = () => 0,
  getPlayerProgress = () => ({}),
}) {
  const state = {
    mode: 'position',
    selection: loadSavedSelection(),
    totals: null,
    screen: null,
    modal: null,
    modalText: null,
  };

  function loadSavedSelection() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const mode = parsed.mode === 'sequence' ? 'sequence' : 'position';
      const boardSize = Number(parsed.boardSize);
      const stoneCount = Number(parsed.stoneCount);
      if (!Number.isFinite(boardSize) || !Number.isFinite(stoneCount)) return null;
      return { mode, boardSize, stoneCount };
    } catch (_err) {
      return null;
    }
  }

  function saveSelection(selection) {
    state.selection = selection;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
    } catch (_err) {
      /* no-op */
    }
  }

  function clearSelection() {
    state.selection = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_err) {
      /* no-op */
    }
  }

  function ensureStyles() {
    if (document.getElementById('levelSelectStyles')) return;
    const style = document.createElement('style');
    style.id = 'levelSelectStyles';
    style.textContent = `
      #levelSelectScreen {
        position: fixed;
        inset: 0;
        background: var(--tan-bg, tan);
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 3.35rem 1.2rem 2.25rem;
        opacity: 0;
        pointer-events: none;
        transition: opacity 200ms ease;
        overflow-y: auto;
        overflow-x: hidden;
        z-index: 20;
      }
      #levelSelectScreen.active {
        opacity: 1;
        pointer-events: auto;
      }
      .level-select__inner {
        width: min(720px, 100%);
        max-width: min(720px, 100%);
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
        align-items: center;
        margin: 0 auto;
      }
      .level-select__masthead {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
        align-items: center;
      }
      .level-select__header {
        width: 100%;
        display: grid;
        grid-template-columns: 1fr;
        align-items: center;
        gap: 0.85rem;
      }
      .level-select__title {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        align-items: center;
        text-align: center;
        width: 100%;
      }
      .level-select__eyebrow {
        font-size: 0.9rem;
        color: #0b360f;
        opacity: 0.8;
        margin: 0;
      }
      .level-select__heading {
        margin: 0;
        font-size: 1.65rem;
        text-align: center;
      }
      .level-select__grid {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        width: 100%;
        align-items: center;
      }
      .level-select__footer {
        width: 100%;
        display: flex;
        justify-content: center;
        margin-top: 0.5rem;
      }
      .level-select__board-card {
        width: var(--layout-width, min(90vw, 420px));
        max-width: var(--layout-width, 420px);
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 0.75rem;
      }
      .level-select__board-card.locked {
        opacity: 0.7;
      }
      .level-select__board-card.selected {
        border: 2px solid rgba(46, 125, 50, 0.35);
        box-shadow: 0 14px 32px rgba(46, 125, 50, 0.16);
      }
      .level-select__board-icon {
        position: relative;
        width: 72px;
      }
      .level-select__board-icon img {
        display: block;
        width: 100%;
        filter: drop-shadow(0 4px 10px rgba(0,0,0,0.08));
      }
      .level-select__board-card.locked .level-select__board-icon img,
      .level-select__board-card.locked button {
        filter: grayscale(1);
      }
      .level-select__board-card .diffBtn.locked {
        background: #dcdcdc !important;
        background-image: none !important;
        border-color: #bdbdbd !important;
        color: #4a4a4a !important;
        box-shadow: none;
        cursor: not-allowed;
      }
      .level-select__board-content {
        flex: 1;
      }
      .level-select__card-row {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 1rem;
      }
      .level-select__drawer {
        width: 100%;
        overflow: hidden;
        max-height: 0;
        opacity: 0;
        transition: max-height 200ms ease, opacity 180ms ease, padding 160ms ease;
        padding: 0;
      }
      .level-select__drawer.open {
        opacity: 1;
        padding: 0.75rem 0 0.6rem;
      }
      .level-select__drawer-content {
        background: rgba(255, 255, 255, 0.86);
        border-radius: 12px;
        padding: 0.75rem;
        border: 2px solid rgba(70, 116, 65, 0.18);
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
        width: 100%;
        box-sizing: border-box;
      }
      .level-select__lock {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 32px;
        height: 32px;
        transform: translate(-50%, -50%);
        pointer-events: none;
      }
      .level-select__board-content .mode-status {
        letter-spacing: 0.12em;
      }
      .level-select__stones {
        background: rgba(255, 255, 255, 0.8);
        border-radius: 14px;
        padding: 0.85rem 0.85rem 0.35rem;
        border: 2px solid rgba(70, 116, 65, 0.4);
        box-shadow: 0 6px 14px rgba(0, 0, 0, 0.08);
      }
      .level-select__stone-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 0.65rem;
        justify-content: center;
        width: 100%;
      }
      .level-select__stone-item {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        align-items: center;
      }
      .level-select__stone-btn {
        border-radius: 10px;
        border: 2px solid rgba(70, 116, 65, 0.6);
        background: linear-gradient(180deg, #66bb6a 0%, #43a047 100%);
        color: #0b360f;
        padding: 0.65rem 0.75rem;
        font-weight: 700;
        font-size: 0.95rem;
        cursor: pointer;
        transition: transform 120ms ease, box-shadow 120ms ease;
      }
      .level-select__stone-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 8px 14px rgba(0, 0, 0, 0.18);
      }
      .level-select__stone-btn.selected {
        box-shadow: 0 10px 18px rgba(46, 125, 50, 0.28);
      }
      .level-select__stone-btn.locked {
        background: #dcdcdc !important;
        background-image: none !important;
        border-color: #bdbdbd !important;
        color: #4a4a4a !important;
      }
      .level-select__stone-lock {
        position: absolute;
        width: 22px;
        height: 22px;
        top: 6px;
        right: 6px;
        pointer-events: none;
      }
      .level-select__stone-item-inner {
        position: relative;
        width: 100%;
      }
      .level-select__stone-status {
        margin: 0;
        font-size: 0.9rem;
        text-align: center;
        color: #2f3d2f;
      }
      .level-select__stone-header {
        margin: 0 0 0.5rem;
        font-size: 1.05rem;
        text-align: center;
      }
      .level-select__note {
        margin: 0.25rem 0 0.75rem;
        font-size: 0.9rem;
        color: #2f3d2f;
      }
      .level-select__back {
        border-radius: 10px;
        padding: 0.65rem 0.9rem;
        min-width: 92px;
        justify-self: start;
        width: min(320px, 100%);
      }
      @media (max-width: 540px) {
        .level-select__header {
          grid-template-columns: 1fr;
          justify-items: center;
        }
        .level-select__back {
          justify-self: center;
        }
        .level-select__heading {
          font-size: 1.5rem;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    if (state.modal) return;
    const modal = document.createElement('div');
    modal.id = 'levelSelectModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <p id="levelSelectModalText"></p>
        <div class="modal-buttons">
          <button id="levelSelectModalGo" style="display:none">Go now!</button>
          <button id="levelSelectModalClose">Okay</button>
        </div>
      </div>
    `;
    const closeBtn = modal.querySelector('#levelSelectModalClose');
    const goBtn = modal.querySelector('#levelSelectModalGo');
    closeBtn?.addEventListener('click', () => hideModal());
    goBtn?.addEventListener('click', () => {
      if (typeof state.modalGoHandler === 'function') {
        state.modalGoHandler();
      }
      hideModal();
    });
    modal.addEventListener('click', (evt) => {
      if (evt.target === modal) hideModal();
    });
    document.body.appendChild(modal);
    state.modal = modal;
    state.modalText = modal.querySelector('#levelSelectModalText');
    state.modalGoBtn = goBtn;
  }

  function dismissOtherOverlays() {
    document.querySelectorAll('.modal.active').forEach((m) => {
      if (m !== state.modal) m.classList.remove('active');
    });
    const feedback = document.getElementById('feedback');
    if (feedback) {
      feedback.style.display = 'none';
      feedback.classList.remove('show', 'show-msg', 'show-btn');
    }
  }

  function showModal(message, options = {}) {
    const { showGoNow = false, onGoNow = null } = options;
    ensureModal();
    if (state.modalText) state.modalText.textContent = message;
    if (state.modalGoBtn) {
      state.modalGoBtn.style.display = showGoNow ? 'block' : 'none';
    }
    state.modalGoHandler = showGoNow
      ? () => {
          dismissOtherOverlays();
          onGoNow?.();
        }
      : null;
    state.modal?.classList.add('active');
  }

  function hideModal() {
    state.modal?.classList.remove('active');
    if (state.modalGoBtn) {
      state.modalGoBtn.style.display = 'none';
    }
    state.modalGoHandler = null;
  }

  function parseBoardSize(boardKey) {
    const value = Number(String(boardKey).split('x')[0]);
    return Number.isFinite(value) ? value : null;
  }

  function getRequirement(boardSize, stoneCount = MIN_STONES) {
    const base = BOARD_UNLOCKS[Number(boardSize)] ?? 0;
    const extra = Math.max(0, (Number(stoneCount) || MIN_STONES) - MIN_STONES) * STONE_INCREMENT;
    return base + extra;
  }

  function isBoardUnlocked(boardSize, rating) {
    return rating >= getRequirement(boardSize, MIN_STONES);
  }

  function isStoneUnlocked(boardSize, stoneCount, rating) {
    return rating >= getRequirement(boardSize, stoneCount);
  }

  async function ensureTotals() {
    if (state.totals) return state.totals;
    if (!window.GoMiniBoardLogic?.loadMiniBoards) return {};
    const data = await window.GoMiniBoardLogic.loadMiniBoards();
    const totals = {};
    ['5x5', '6x6', '7x7'].forEach((key) => {
      const bucket = Array.isArray(data?.[key]) ? data[key] : [];
      const perStone = {};
      bucket.forEach((game) => {
        const moves = Number(game?.num_moves);
        if (!Number.isFinite(moves)) return;
        perStone[moves] = (perStone[moves] || 0) + 1;
      });
      totals[key] = perStone;
    });
    state.totals = totals;
    return totals;
  }

  function getRating() {
    const value = Number(getSkillRating?.() ?? 0);
    return Number.isFinite(value) ? value : 0;
  }

  function buildScreen() {
    if (state.screen) return state.screen;
    ensureStyles();
    const screen = document.createElement('div');
    screen.id = 'levelSelectScreen';
    screen.className = 'screen';
    screen.innerHTML = `
      <div class="level-select__inner">
        <div class="level-select__masthead">
          <div class="level-select__header">
            <div class="level-select__title">
              <p class="level-select__eyebrow">Board Select</p>
              <h2 class="level-select__heading">Pick a board</h2>
            </div>
          </div>
        </div>
        <div class="level-select__grid" id="boardOptions"></div>
        <div class="level-select__footer">
          <button class="level-select__back" data-action="back">Back</button>
        </div>
      </div>
    `;

    const backBtn = screen.querySelector('[data-action="back"]');
    backBtn?.addEventListener('click', () => {
      if (showScreen && difficultyEl && state.screen) {
        showScreen(difficultyEl, state.screen);
      } else {
        hide();
        difficultyEl?.classList.add('active');
      }
      introEl?.classList.remove('active');
    });

    state.screen = screen;
    document.body.appendChild(screen);
    return screen;
  }

  function setModeInternal(mode) {
    state.mode = mode === 'sequence' ? 'sequence' : 'position';
    setMode?.(state.mode);
  }

  function renderBoards() {
    const grid = state.screen?.querySelector('#boardOptions');
    if (!grid) return;
    const rating = getRating();
    grid.innerHTML = '';
    [5, 6, 7].forEach((size) => {
      const boardKey = `${size}x${size}`;
      const locked = !isBoardUnlocked(size, rating);
      const card = document.createElement('div');
      card.className = 'mode-card mode-card--horizontal level-select__board-card';
      if (locked) card.classList.add('locked');
      if (state.selection?.boardSize === size) card.classList.add('selected');

      const cardRow = document.createElement('div');
      cardRow.className = 'level-select__card-row mode-card--horizontal';

      const iconWrap = document.createElement('div');
      iconWrap.className = 'mode-icon level-select__board-icon';
      const img = document.createElement('img');
      img.src = BOARD_IMAGES[size] || BOARD_IMAGES[5];
      img.alt = `${boardKey} board`;
      iconWrap.appendChild(img);

      const content = document.createElement('div');
      content.className = 'mode-content level-select__board-content';
      const btn = document.createElement('button');
      btn.className = 'diffBtn';
      btn.textContent = `${boardKey} board`;
      const requirement = getRequirement(size);
      if (locked) btn.classList.add('locked');
      if (locked) {
        const lockImg = document.createElement('img');
        lockImg.src = 'images/lock_lock.png';
        lockImg.alt = 'Locked';
        lockImg.className = 'level-select__stone-lock';
        btn.classList.add('level-select__board-lock-wrap');
        btn.appendChild(lockImg);
      }
      const status = document.createElement('p');
      status.className = 'mode-status level-select__status';
      status.textContent = locked ? `Needs skill rating ${requirement}` : 'Unlocked';

      btn.onclick = () => {
        if (locked) {
          showModal(`must have a skill rating of ${requirement} to unlock`);
          return;
        }
        const isOpen = state.selection?.boardSize === size;
        state.selection = isOpen ? { ...state.selection, boardSize: null } : { ...state.selection, boardSize: size, boardKey };
        renderBoards();
      };

      content.appendChild(btn);
      content.appendChild(status);
      cardRow.appendChild(iconWrap);
      cardRow.appendChild(content);
      card.appendChild(cardRow);
      if (!locked) {
        const drawer = document.createElement('div');
        drawer.className = 'level-select__drawer';
        const drawerContent = document.createElement('div');
        drawerContent.className = 'level-select__drawer-content';
        drawer.appendChild(drawerContent);
        if (state.selection?.boardSize === size) {
          drawer.classList.add('open');
          populateStoneOptions({ boardSize: size, container: drawerContent });
          requestAnimationFrame(() => {
            drawer.style.maxHeight = `${drawer.scrollHeight}px`;
          });
        } else {
          drawer.classList.remove('open');
          drawer.style.maxHeight = '0px';
        }
        card.appendChild(drawer);
      }
      grid.appendChild(card);
    });
  }

  function populateStoneOptions({ boardSize, container }) {
    if (!container) return;
    container.innerHTML = '';
    const boardKey = `${boardSize}x${boardSize}`;
    const totals = state.totals?.[boardKey] || {};
    const stones = Object.keys(totals)
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    const rating = getRating();
    const header = document.createElement('h4');
    header.className = 'level-select__stone-header';
    header.textContent = stones.length ? 'Choose your stone target:' : 'No puzzles available.';
    container.appendChild(header);
    const grid = document.createElement('div');
    grid.className = 'level-select__stone-grid';
    container.appendChild(grid);
    stones.forEach((stoneCount) => {
      const total = totals[stoneCount] || 0;
      const locked = !isStoneUnlocked(boardSize, stoneCount, rating);
      const progress = getPlayerProgressIndex(
        getPlayerProgress?.() ?? {},
        state.mode,
        boardKey,
        total
      );
      const displayProgress = total ? Math.min(total, progress) : progress;
      const item = document.createElement('div');
      item.className = 'level-select__stone-item';
      const inner = document.createElement('div');
      inner.className = 'level-select__stone-item-inner';
      const btnWrap = document.createElement('div');
      btnWrap.className = 'level-select__stone-btn-wrap';
      const btn = document.createElement('button');
      btn.className = 'level-select__stone-btn';
      if (locked) btn.classList.add('locked');
      if (
        state.selection?.boardSize === boardSize &&
        state.selection?.stoneCount === stoneCount
      ) {
        btn.classList.add('selected');
      }
      btn.textContent = `${stoneCount} stones`;
      btn.onclick = () => {
        const requirement = getRequirement(boardSize, stoneCount);
        if (locked) {
          showModal(`must have a skill rating of ${requirement} to unlock`);
          return;
        }
        startWithSelection({ boardSize, stoneCount, mode: state.mode });
      };
      btnWrap.appendChild(btn);
      inner.appendChild(btnWrap);
      if (locked) {
        const lockImg = document.createElement('img');
        lockImg.src = 'images/lock_lock.png';
        lockImg.alt = 'Locked';
        lockImg.className = 'level-select__stone-lock';
        inner.appendChild(lockImg);
      }
      const status = document.createElement('p');
      status.className = 'level-select__stone-status';
      const safeTotal = Number.isFinite(total) ? total : 0;
      status.textContent = `completed (${displayProgress}/${safeTotal})`;
      item.appendChild(inner);
      item.appendChild(status);
      grid.appendChild(item);
    });
  }

  function hide() {
    state.screen?.classList.remove('active');
  }

  function startWithSelection(selection) {
    const next = {
      mode: selection.mode,
      boardSize: selection.boardSize,
      stoneCount: selection.stoneCount,
    };
    saveSelection(next);
    setModeInternal(next.mode);
    setNextPuzzleSuggestion?.({
      boardSize: next.boardSize,
      stoneCount: next.stoneCount,
    });
    hide();
    difficultyEl?.classList.remove('active');
    introEl?.classList.remove('active');
    if (mainGameEl) {
      mainGameEl.style.display = 'block';
    }
    startGame?.(next.mode);
  }

  async function open(mode) {
    buildScreen();
    setModeInternal(mode);
    const screen = state.screen;
    difficultyEl?.classList.remove('active');
    introEl?.classList.remove('active');
    screen?.classList.add('active');
    await ensureTotals();
    renderBoards();
  }

  async function resumeLastSelection() {
    const selection = state.selection;
    if (!selection) return false;
    const requirement = getRequirement(selection.boardSize, selection.stoneCount);
    const rating = getRating();
    if (rating < requirement) {
      showModal(`must have a skill rating of ${requirement} to unlock`);
      return false;
    }
    await ensureTotals();
    startWithSelection(selection);
    return true;
  }

  function updateHeader({ activeGame, mode }) {
    const levelText = document.getElementById('levelText');
    const roundText = document.getElementById('roundText');
    if (!levelText || !roundText) return;
    if (!state.totals) {
      ensureTotals().then(() => updateHeader({ activeGame, mode }));
    }
    const currentMode = mode === 'sequence' ? 'sequence' : state.mode;
    const boardSize =
      Number(activeGame?.puzzleConfig?.boardSize) ||
      parseBoardSize(activeGame?.boardKey) ||
      Number(state.selection?.boardSize) ||
      5;
    const boardKey = `${boardSize}x${boardSize}`;
    const stoneCount =
      Number(activeGame?.challengeStoneCount) ||
      Number(activeGame?.puzzleConfig?.stoneCount) ||
      Number(state.selection?.stoneCount) ||
      MIN_STONES;
    const totalFromActive = Number(activeGame?.challengePoolSize);
    const totals = state.totals?.[boardKey] || {};
    const total =
      (Number.isFinite(totalFromActive) && totalFromActive > 0
        ? totalFromActive
        : totals[stoneCount]) || 0;
    const challengeIndex = Number.isFinite(activeGame?.challengeIndex)
      ? activeGame.challengeIndex
      : getPlayerProgressIndex(
          getPlayerProgress?.() ?? {},
          currentMode,
          boardKey,
          total
        );
    const challengeNumber = Math.max(1, Math.min(total || challengeIndex + 1, challengeIndex + 1));
    const attemptsRaw = Number(activeGame?.challengeAttempts);
    const attempts = Number.isFinite(attemptsRaw) ? Math.max(0, attemptsRaw - 1) : 0;
    const header = `${boardKey} board • ${stoneCount} stones<br>challenge ${challengeNumber}/${total || '?'} • attempts ${attempts}`;
    levelText.innerHTML = header;
    roundText.textContent = '';
  }

  function detectUnlocks(ratingBefore, ratingAfter) {
    if (ratingAfter <= ratingBefore) return null;
    const unlocks = [];
    [5, 6, 7].forEach((size) => {
      const req = getRequirement(size);
      if (ratingBefore < req && ratingAfter >= req) {
        unlocks.push({ type: 'board', requirement: req, size });
      }
    });
    Object.entries(state.totals || {}).forEach(([boardKey, byStone]) => {
      const size = parseBoardSize(boardKey);
      Object.keys(byStone || {})
        .map((k) => Number(k))
        .filter((n) => Number.isFinite(n))
        .forEach((stoneCount) => {
          const req = getRequirement(size, stoneCount);
          if (ratingBefore < req && ratingAfter >= req) {
            unlocks.push({ type: 'stone', requirement: req, stones: stoneCount, size });
          }
        });
    });
    if (!unlocks.length) return null;
    unlocks.sort((a, b) => a.requirement - b.requirement);
    return unlocks[0];
  }

  function handleRatingChange({ ratingBefore, ratingAfter }) {
    if (ratingAfter <= ratingBefore) return;
    ensureTotals().then(() => {
      renderBoards();
      const unlocked = detectUnlocks(ratingBefore, ratingAfter);
      if (!unlocked) return;
      if (unlocked.type === 'board') {
        showModal(`${unlocked.size}x${unlocked.size} board unlocked!`, {
          showGoNow: true,
          onGoNow: () => {
            state.selection = {
              mode: state.mode,
              boardSize: unlocked.size,
              boardKey: `${unlocked.size}x${unlocked.size}`,
            };
            renderBoards();
            startWithSelection(state.selection);
          },
        });
        launchConfetti();
      } else if (unlocked.type === 'stone') {
        showModal(`${unlocked.stones} stones unlocked!`, {
          showGoNow: true,
          onGoNow: () => {
            const size = unlocked.size || parseBoardSize(state.selection?.boardKey) || 5;
            state.selection = {
              mode: state.mode,
              boardSize: size,
              boardKey: `${size}x${size}`,
              stoneCount: unlocked.stones,
            };
            renderBoards();
            startWithSelection(state.selection);
          },
        });
        launchConfetti();
      }
    });
  }

  return {
    open,
    hide,
    resumeLastSelection,
    handleRatingChange,
    updateHeader,
    getSelection: () => state.selection,
    resetSelection: clearSelection,
  };
}

export { createLevelSelectController };
