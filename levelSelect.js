import { getPlayerProgressIndex } from './puzzle.js';
import { launchConfetti } from './anim.js';

const STORAGE_KEY = 'goVizLevelSelect';
const UNLOCK_CACHE_KEY = 'goVizUnlockCache';
const MIN_STONES = 5;
const BOARD_IMAGES = {
  5: 'images/board_5x5.png',
  6: 'images/board_6x6.png',
  7: 'images/board_7x7.png',
};
let UNLOCKS = {};
let unlocksPromise = null;
const BOARD_MIN_STONES_CACHE = {};

function loadUnlocksViaXHR(url) {
  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          try {
            const parsed = JSON.parse(xhr.responseText || '{}');
            UNLOCKS = parsed?.unlockCosts || {};
          } catch (err) {
            console.error('Failed to parse unlocks.json via XHR', err);
            UNLOCKS = {};
          }
          resolve(UNLOCKS);
        }
      };
      xhr.onerror = () => {
        UNLOCKS = {};
        resolve(UNLOCKS);
      };
      xhr.send();
    } catch (err) {
      console.error('XHR fallback for unlocks.json failed', err);
      UNLOCKS = {};
      resolve(UNLOCKS);
    }
  });
}

function loadUnlocksFromCache() {
  try {
    const raw = localStorage.getItem(UNLOCK_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (_err) {
    /* ignore */
  }
  return null;
}

function saveUnlocksToCache(data) {
  try {
    localStorage.setItem(UNLOCK_CACHE_KEY, JSON.stringify(data));
  } catch (_err) {
    /* ignore */
  }
}

function ensureUnlocks() {
  if (unlocksPromise) return unlocksPromise;
  const unlockUrl =
    typeof import.meta !== 'undefined'
      ? new URL('./unlocks.json', import.meta.url).toString()
      : 'unlocks.json';
  const cached = loadUnlocksFromCache();
  if (cached) {
    UNLOCKS = cached;
  }
  unlocksPromise = fetch(unlockUrl)
    .catch(() => fetch('unlocks.json'))
    .then((res) => {
      if (!res || !res.ok) throw new Error(`Fetch failed for ${unlockUrl}`);
      return res.json();
    })
    .then((data) => {
      UNLOCKS = data?.unlockCosts || {};
      if (!Object.keys(UNLOCKS).length && cached) {
        UNLOCKS = cached;
        return UNLOCKS;
      }
      if (!Object.keys(UNLOCKS).length) {
        console.warn('Unlock data empty after fetch; check unlocks.json path.');
      }
      if (Object.keys(UNLOCKS).length) saveUnlocksToCache(UNLOCKS);
      return UNLOCKS;
    })
    .catch((err) => {
      console.error('Failed to load unlocks.json', err);
      if (cached) {
        UNLOCKS = cached;
        return UNLOCKS;
      }
      return loadUnlocksViaXHR(unlockUrl).then(async (result) => {
        let finalResult = result || {};
        if (!Object.keys(finalResult).length && unlockUrl !== 'unlocks.json') {
          finalResult = (await loadUnlocksViaXHR('unlocks.json')) || {};
        }
        if (!Object.keys(finalResult).length) {
          try {
            const sync = new XMLHttpRequest();
            sync.open('GET', 'unlocks.json', false);
            sync.send(null);
            const parsed = JSON.parse(sync.responseText || '{}');
            finalResult = parsed?.unlockCosts || {};
          } catch (_err) {
            /* ignore */
          }
        }
        if (!Object.keys(finalResult).length && cached) {
          UNLOCKS = cached;
          return UNLOCKS;
        }
        if (Object.keys(finalResult).length) {
          UNLOCKS = finalResult;
          saveUnlocksToCache(finalResult);
        }
        UNLOCKS = finalResult;
        return finalResult;
      });
    });
  return unlocksPromise;
}

ensureUnlocks();

function createLevelSelectController({
  introEl,
  difficultyEl,
  mainGameEl,
  showScreen,
  setPageType = () => {},
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
      if (!Number.isFinite(boardSize) || !Number.isFinite(stoneCount))
        return null;
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
        display: none;
        flex-direction: column;
        align-items: center;
        padding: calc(var(--header-height, 72px) + 0.85rem) 1.2rem 2.25rem;
        opacity: 0;
        pointer-events: none;
        transition: opacity 200ms ease;
        overflow-y: hidden;
        overflow-x: hidden;
        z-index: 20;
        overscroll-behavior: contain;
      }
      #levelSelectScreen.active {
        display: flex;
        opacity: 1;
        pointer-events: auto;
      }
      #levelSelectScreen.level-select--scrollable {
        overflow-y: auto;
      }
      body.level-select-open {
        overflow: hidden;
      }
      .level-select__inner {
        width: min(92vw, 900px);
        max-width: min(92vw, 900px);
        display: flex;
        flex-direction: column;
        gap: clamp(1rem, 2vw, 1.5rem);
        align-items: center;
        margin: 0 auto;
        padding: clamp(16px, 3vw, 28px);
        box-sizing: border-box;
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
        color: var(--text-accent-dark);
        opacity: 0.8;
        margin: 0;
      }
      .level-select__heading {
        margin: 0;
        font-size: 1.65rem;
        text-align: center;
      }
      .level-select__grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: clamp(14px, 2vw, 22px);
        width: 100%;
        align-items: stretch;
        justify-items: center;
        box-sizing: border-box;
      }
      .level-select__footer {
        width: 100%;
        display: flex;
        justify-content: center;
        margin-top: 0.5rem;
      }
      .level-select__board-card {
        width: 100%;
        max-width: 900px;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 0.75rem;
        box-sizing: border-box;
        overflow: hidden;
      }
      .level-select__board-card.locked {
        opacity: 0.7;
      }
      .level-select__board-card.selected {
        border: 2px solid rgba(var(--accent-shadow-rgb), 0.35);
        box-shadow: 0 14px 32px rgba(var(--accent-shadow-rgb), 0.16);
      }
      .level-select__board-icon {
        position: relative;
        width: 72px;
        flex-shrink: 0;
      }
      .level-select__board-icon img {
        display: block;
        width: 100%;
        filter: drop-shadow(0 4px 10px var(--shadow-ambient-color));
      }
      .level-select__board-lock-wrap {
        position: relative;
        overflow: hidden;
      }
      .level-select__board-content {
        flex: 1;
      }
      .level-select__card-row {
        width: 100%;
        max-width: 100%;
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        gap: 0.85rem;
        padding: 0 0.5rem;
        box-sizing: border-box;
      }
      .level-select__card-row > * {
        min-width: 0;
      }
      .level-select__board-card .mode-content.level-select__board-content {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 0;
        gap: 0.25rem;
        text-align: center;
        width: 100%;
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
        background: var(--card-overlay-strong);
        border-radius: 12px;
        padding: 0.75rem;
        border: 2px solid rgba(var(--accent-shadow-rgb), 0.18);
        box-shadow: 0 6px 18px var(--shadow-ambient-color);
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
        background: var(--card-overlay-soft);
        border-radius: 14px;
        padding: 0.85rem 0.85rem 0.35rem;
        border: 2px solid rgba(var(--level-border-rgb), 0.4);
        box-shadow: 0 6px 14px var(--shadow-ambient-color);
        width: 100%;
        box-sizing: border-box;
      }
      .level-select__stone-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: clamp(12px, 2vw, 18px);
        justify-content: center;
        width: 100%;
        box-sizing: border-box;
      }
      .level-select__stone-item {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        align-items: center;
        min-width: 0;
      }
      .level-select__stone-lock {
        position: absolute;
        width: 22px;
        height: 22px;
        top: 50%;
        right: 14px;
        transform: translateY(-50%);
        pointer-events: none;
      }
      .level-select__stone-item-inner {
        position: relative;
        width: 100%;
        max-width: 420px;
        box-sizing: border-box;
      }
      .level-select__stone-status {
        margin: 0;
        font-size: 0.9rem;
        text-align: center;
        color: var(--text-olive);
      }
      .level-select__stone-header {
        margin: 0 0 0.5rem;
        font-size: 1.05rem;
        text-align: center;
      }
      .level-select__note {
        margin: 0.25rem 0 0.75rem;
        font-size: 0.9rem;
        color: var(--text-olive);
      }
      @media (max-width: 540px) {
        .level-select__header {
          grid-template-columns: 1fr;
          justify-items: center;
        }
        .level-select__heading {
          font-size: 1.5rem;
        }
      }
      @media (min-width: 900px) {
        .level-select__grid {
          grid-template-columns: 1fr 1fr;
        }
        .level-select__stone-grid {
          grid-template-columns: 1fr 1fr;
        }
        .level-select__card-row {
          grid-template-columns: auto 1fr;
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
    if (state.modalText) {
      state.modalText.style.textAlign = 'center';
      state.modalText.style.whiteSpace = 'pre-line';
    }
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
    if (state.modalText) {
      state.modalText.innerHTML = '';
      const [firstLine, ...rest] = String(message ?? '').split('\n');
      const firstSpan = document.createElement('span');
      firstSpan.textContent = firstLine;
      firstSpan.style.fontWeight = 'bold';
      firstSpan.style.fontSize = '1.15em';
      state.modalText.appendChild(firstSpan);
      rest.forEach((line) => {
        state.modalText.appendChild(document.createElement('br'));
        if (line === '') {
          state.modalText.appendChild(document.createElement('br'));
        } else {
          state.modalText.appendChild(document.createTextNode(line));
        }
      });
    }
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

  function getTotalsForBoard(boardSize) {
    return state.totals?.[String(boardSize)] || {};
  }

  function getBoardMinimumStoneCount(boardSize) {
    const size = Number(boardSize);
    if (!Number.isFinite(size)) return MIN_STONES;
    if (BOARD_MIN_STONES_CACHE[size]) return BOARD_MIN_STONES_CACHE[size];
    const unlockStoneCounts = Object.keys(UNLOCKS || {})
      .map((key) => {
        const [board, stones] = String(key).split('-').map((n) => Number(n));
        return { board, stones };
      })
      .filter(
        (entry) =>
          entry &&
          Number.isFinite(entry.board) &&
          Number.isFinite(entry.stones) &&
          entry.board === size
      )
      .map((entry) => entry.stones);
    if (unlockStoneCounts.length) {
      const minFromUnlocks = Math.min(...unlockStoneCounts);
      BOARD_MIN_STONES_CACHE[size] = minFromUnlocks;
      return minFromUnlocks;
    }
    const stones = Object.keys(getTotalsForBoard(size))
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n));
    const minStone = stones.length ? Math.min(...stones) : MIN_STONES;
    BOARD_MIN_STONES_CACHE[size] = minStone;
    return minStone;
  }

  function getRequirement(boardSize, stoneCount = null) {
    const size = Number(boardSize);
    const parsedStone = Number(stoneCount);
    const hasStoneInput =
      stoneCount !== null &&
      stoneCount !== undefined &&
      Number.isFinite(parsedStone);
    const stones = hasStoneInput
      ? parsedStone
      : getBoardMinimumStoneCount(size);
    const key = `${size}-${stones}`;
    const raw = UNLOCKS ? UNLOCKS[key] : undefined;
    const requirement =
      typeof raw === 'string' ? Number(raw.trim()) : Number(raw);
    return Number.isFinite(requirement) ? requirement : null;
  }

  function isBoardUnlocked(boardSize, rating) {
    const requirement = getRequirement(boardSize);
    return Number.isFinite(requirement) && rating >= requirement;
  }

  function isStoneUnlocked(boardSize, stoneCount, rating) {
    const requirement = getRequirement(boardSize, stoneCount);
    return Number.isFinite(requirement) && rating >= requirement;
  }

  async function ensureTotals() {
    if (state.totals) return state.totals;
    try {
      const res = await fetch('games/game_counts.json');
      const data = await res.json();
      state.totals = data || {};
      return state.totals;
    } catch (err) {
      console.error('Failed to load game counts', err);
      state.totals = {};
      return state.totals;
    }
  }

  function getRating(mode = state.mode) {
    const value = Number(getSkillRating?.(mode) ?? getSkillRating?.() ?? 0);
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
      hide();
      if (showScreen && difficultyEl && state.screen) {
        showScreen(difficultyEl, state.screen);
      } else {
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

  async function renderBoards() {
    await ensureUnlocks();
    const grid = state.screen?.querySelector('#boardOptions');
    if (!grid) return;
    const rating = getRating();
    grid.innerHTML = '';
    [5, 6, 7].forEach((size) => {
      const boardKey = `${size}x${size}`;
      const locked = !isBoardUnlocked(size, rating);
      const card = document.createElement('div');
      card.className = 'mode-card level-select__board-card';
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
      status.textContent = locked
        ? Number.isFinite(requirement)
          ? `Needs skill rating ${requirement}`
          : 'Locked'
        : 'Unlocked';

      btn.onclick = () => {
        if (locked) {
          const minStone = getBoardMinimumStoneCount(size);
          const message = Number.isFinite(requirement)
            ? `${boardKey} board with ${minStone} stones\nNeed skill rating ${requirement} to unlock`
            : `${boardKey} board with ${minStone} stones\nThis board is locked`;
          showModal(message);
          return;
        }
        const isOpen = state.selection?.boardSize === size;
        const nextSelection = state.selection ? { ...state.selection } : {};
        if (isOpen) {
          nextSelection.boardSize = null;
          nextSelection.boardKey = null;
        } else {
          nextSelection.boardSize = size;
          nextSelection.boardKey = boardKey;
        }
        state.selection = nextSelection;
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
    updateScrollState();
  }

  function populateStoneOptions({ boardSize, container }) {
    if (!container) return;
    container.innerHTML = '';
    const boardKey = `${boardSize}x${boardSize}`;
    const totals = getTotalsForBoard(boardSize);
    const stones = Object.keys(totals)
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    const rating = getRating();
    const header = document.createElement('h4');
    header.className = 'level-select__stone-header';
    header.textContent = stones.length
      ? 'Choose your stone target:'
      : 'No puzzles available.';
    container.appendChild(header);
    const grid = document.createElement('div');
    grid.className = 'level-select__stone-grid';
    container.appendChild(grid);
    stones.forEach((stoneCount) => {
      const total = totals[stoneCount] || 0;
      const requirement = getRequirement(boardSize, stoneCount);
      const locked = !Number.isFinite(requirement) || rating < requirement;
      const progress = getPlayerProgressIndex(
        getPlayerProgress?.() ?? {},
        state.mode,
        boardKey,
        stoneCount,
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
        if (locked) {
          const message = Number.isFinite(requirement)
            ? `${boardKey} board with ${stoneCount} stones\n\nNeed skill rating ${requirement} to unlock`
            : `${boardKey} board with ${stoneCount} stones\n\nThis level is locked`;
          showModal(message);
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
    document.body.classList.remove('level-select-open');
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
    setPageType?.('boardSelect');
    document.body.classList.add('level-select-open');
    document.body.classList.remove('badges-hidden');
    document.body.classList.add('badges-visible');
    await Promise.all([ensureUnlocks(), ensureTotals()]);
    await renderBoards();
  }

  function updateScrollState() {
    const hasOpenDrawer = !!state.screen?.querySelector(
      '.level-select__drawer.open'
    );
    state.screen?.classList.toggle('level-select--scrollable', hasOpenDrawer);
  }

  async function resumeLastSelection() {
    await ensureUnlocks();
    const selection = state.selection;
    if (!selection) return false;
    const requirement = getRequirement(
      selection.boardSize,
      selection.stoneCount
    );
    const rating = getRating();
    if (!Number.isFinite(requirement) || rating < requirement) {
      const message = Number.isFinite(requirement)
        ? `must have a skill rating of ${requirement} to unlock`
        : 'This selection is locked';
      showModal(message);
      return false;
    }
    await ensureTotals();
    startWithSelection(selection);
    return true;
  }

  function updateHeader({ activeGame, mode }) {
    if (!state.totals) {
      ensureTotals().then(() => updateHeader({ activeGame, mode }));
    }
    const currentMode = mode === 'sequence' ? 'sequence' : state.mode;
    const boardSize =
      Number(activeGame?.puzzleConfig?.boardSize) ||
      parseBoardSize(activeGame?.boardKey) ||
      Number(state.selection?.boardSize) ||
      5;
    const stoneCount =
      Number(activeGame?.challengeStoneCount) ||
      Number(activeGame?.puzzleConfig?.stoneCount) ||
      Number(state.selection?.stoneCount) ||
      MIN_STONES;
    const totalFromActive = Number(activeGame?.challengePoolSize);
    const totals = getTotalsForBoard(boardSize);
    const total =
      (Number.isFinite(totalFromActive) && totalFromActive > 0
        ? totalFromActive
        : totals[stoneCount]) || 0;
    const challengeIndex = Number.isFinite(activeGame?.challengeIndex)
      ? activeGame.challengeIndex
      : getPlayerProgressIndex(
          getPlayerProgress?.() ?? {},
          currentMode,
          `${boardSize}x${boardSize}`,
          stoneCount,
          total
        );
    const challengeNumber = Math.max(
      1,
      Math.min(total || challengeIndex + 1, challengeIndex + 1)
    );
    const attemptsRaw = Number(activeGame?.challengeAttempts);
    const attempts = Number.isFinite(attemptsRaw)
      ? Math.max(0, attemptsRaw - 1)
      : 0;
    window.setModeProgressRowText?.({
      mode: currentMode,
      boardSize,
      stoneCount,
      levelIndex: challengeNumber,
      levelTotal: total || null,
    });
  }

  function detectUnlocks(ratingBefore, ratingAfter) {
    if (ratingAfter <= ratingBefore) return null;
    const unlocks = [];
    [5, 6, 7].forEach((size) => {
      const req = getRequirement(size);
      if (Number.isFinite(req) && ratingBefore < req && ratingAfter >= req) {
        unlocks.push({ type: 'board', requirement: req, size });
      }
    });
    Object.entries(state.totals || {}).forEach(([boardDigit, byStone]) => {
      const size = Number(boardDigit);
      if (!Number.isFinite(size)) return;
      Object.keys(byStone || {})
        .map((k) => Number(k))
        .filter((n) => Number.isFinite(n))
        .forEach((stoneCount) => {
          const req = getRequirement(size, stoneCount);
          if (
            Number.isFinite(req) &&
            ratingBefore < req &&
            ratingAfter >= req
          ) {
            unlocks.push({
              type: 'stone',
              requirement: req,
              stones: stoneCount,
              size,
            });
          }
        });
    });
    if (!unlocks.length) return null;
    unlocks.sort((a, b) => a.requirement - b.requirement);
    return unlocks[0];
  }

  function handleRatingChange({ ratingBefore, ratingAfter }) {
    if (ratingAfter <= ratingBefore) return;
    Promise.all([ensureUnlocks(), ensureTotals()]).then(() => {
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
        const size =
          unlocked.size || parseBoardSize(state.selection?.boardKey) || 5;
        const boardLabel = `${size}x${size} board`;
        showModal(
          `Level unlocked!\n\n${boardLabel} with ${unlocked.stones} stones`,
          {
            showGoNow: true,
            onGoNow: () => {
              state.selection = {
                mode: state.mode,
                boardSize: size,
                boardKey: `${size}x${size}`,
                stoneCount: unlocked.stones,
              };
              renderBoards();
              startWithSelection(state.selection);
            },
          }
        );
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
