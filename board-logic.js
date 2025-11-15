/**
 * GoMiniBoardLogic consumes the pre-generated mini board data and exposes
 * helpers to fetch game metadata plus normalized move sequences with captures.
 *
 * This module is deliberately DOM-free so it can be imported into other
 * projects without dragging rendering code along. It exposes a clear API
 * so callers can provide:
 *
 *   1. `size` (e.g. "5x5" or `5`) to pick the board dimension bucket.
 *   2. `gameId` to request a specific game (falls back to the first entry).
 *   3. `moveCount` to truncate the move list as needed.
 *
 * The main output is a snapshot object that includes the normalized moves,
 * the derived board matrix, and a `stoneMap` that maps `x,y` to `'B'`/`'W'`.
 */

const GoMiniBoardLogic = (() => {
  const DATA_FILE = 'OGS_mini_boards.json';
  const SIZE_PATTERN = /^(\d+)x\d+$/;

  let cachedData = null;

  async function loadMiniBoards() {
    if (cachedData) return cachedData;
    const response = await fetch(DATA_FILE);
    if (!response.ok) {
      throw new Error(`Failed to load ${DATA_FILE}: ${response.statusText}`);
    }
    cachedData = await response.json();
    return cachedData;
  }

  function normalizeSizeKey(size) {
    if (typeof size === 'number') {
      return `${size}x${size}`;
    }
    if (typeof size === 'string') {
      const normalized = size.trim();
      if (SIZE_PATTERN.test(normalized)) return normalized;
      const numeric = parseInt(normalized, 10);
      if (!Number.isNaN(numeric)) return `${numeric}x${numeric}`;
    }
    throw new Error(`Board size ${size} is not supported`);
  }

  function parseSizeNumber(sizeKey) {
    const match = SIZE_PATTERN.exec(sizeKey);
    if (!match) return null;
    return Number(match[1]);
  }

  function sgfToCoords(sgf) {
    if (!sgf || sgf.length < 4) {
      console.warn('Skipping malformed move:', sgf);
      return null;
    }
    const x = sgf.charCodeAt(2) - 97;
    const y = sgf.charCodeAt(3) - 97;
    return { x, y, color: sgf[0] === 'B' ? 'B' : 'W', sgf };
  }

  function normalizeMoveSequence(sgfMoves, initialPlayer = 'black', boardSize = 0) {
    const normalized = [];
    let expectedColor = initialPlayer === 'white' ? 'W' : 'B';

    for (const sgf of sgfMoves) {
      const move = sgfToCoords(sgf);
      if (!move || Number.isNaN(move.x) || Number.isNaN(move.y)) continue;
      if (boardSize && (move.x < 0 || move.x >= boardSize || move.y < 0 || move.y >= boardSize)) {
        expectedColor = expectedColor === 'B' ? 'W' : 'B';
        continue;
      }
      normalized.push({ ...move, color: expectedColor });
      expectedColor = expectedColor === 'B' ? 'W' : 'B';
    }

    return normalized;
  }

  function createBoardMatrix(boardSize) {
    return Array.from({ length: boardSize }, () => Array(boardSize).fill(null));
  }

  function neighbors(x, y, board) {
    const height = board.length;
    const width = board[0]?.length ?? 0;
    return [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ].filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < width && ny < height);
  }

  function getGroupAndLiberties(board, x, y, color) {
    const stack = [[x, y]];
    const visited = new Set();
    const group = [];
    const libertySet = new Set();

    const key = (a, b) => `${a},${b}`;

    while (stack.length) {
      const [cx, cy] = stack.pop();
      const k = key(cx, cy);
      if (visited.has(k)) continue;

      visited.add(k);
      group.push([cx, cy]);

      for (const [nx, ny] of neighbors(cx, cy, board)) {
        const cell = board[ny][nx];
        if (cell === null) libertySet.add(key(nx, ny));
        else if (cell === color && !visited.has(key(nx, ny))) {
          stack.push([nx, ny]);
        }
      }
    }

    const liberties = [...libertySet].map((s) => s.split(',').map(Number));

    return { group, liberties };
  }

  function removeGroup(board, group) {
    for (const [gx, gy] of group) {
      board[gy][gx] = null;
    }
  }

  function checkCaptures(board, x, y, color) {
    const opponent = color === 'B' ? 'W' : 'B';
    let captured = false;
    for (const [nx, ny] of neighbors(x, y, board)) {
      if (board[ny][nx] === opponent) {
        const { group, liberties } = getGroupAndLiberties(board, nx, ny, opponent);
        if (liberties.length === 0) {
          removeGroup(board, group);
          captured = true;
        }
      }
    }

    return captured;
  }

  function buildStoneMap(board) {
    const map = {};
    for (let y = 0; y < board.length; y++) {
      for (let x = 0; x < board[y].length; x++) {
        const stone = board[y][x];
        if (stone) {
          map[`${x},${y}`] = stone;
        }
      }
    }
    return map;
  }

  function findGame(bucket, gameId) {
    if (gameId == null) return bucket[0];
    return bucket.find((entry) => entry.game_id === gameId) ?? bucket[0];
  }

  /**
   * Fetches a snapshot of the requested mini board game.
   *
   * Inputs:
   *   - size: "5x5", "6x6", "7x7" (or a number like 5 to auto-normalize).
   *   - gameId: optional numerical ID for the desired game in that bucket.
   *   - moveCount: optional cap on how many moves to apply.
   *
   * Output:
   *   - { sizeKey, sizeNumber, gameId, metadata, moves, board, stoneMap }
   *     where `board` is a 2D array of 'B', 'W', or null and `stoneMap`
   *     maps "x,y" to the occupying color for quick lookups.
   */
  async function getGameSnapshot({ size = '5x5', gameId = null, moveCount = Infinity } = {}) {
    const data = await loadMiniBoards();
    const sizeKey = normalizeSizeKey(size);
    const bucket = data[sizeKey];
    if (!bucket || !bucket.length) {
      throw new Error(`No games available for ${sizeKey}`);
    }
    const game = findGame(bucket, gameId);
    const boardSize = parseSizeNumber(sizeKey);
    const normalizedMoves = normalizeMoveSequence(game.sgf_moves, game.initial_player ?? 'black', boardSize);
    const limitedMoves = normalizedMoves.slice(0, moveCount);
    const board = createBoardMatrix(boardSize);
    for (const move of limitedMoves) {
      board[move.y][move.x] = move.color;
      checkCaptures(board, move.x, move.y, move.color);
    }
    return {
      sizeKey,
      sizeNumber: boardSize,
      gameId: game.game_id,
      metadata: {
        handicap: game.handicap ?? 0,
        num_moves: game.num_moves ?? game.sgf_moves.length,
        initial_player: game.initial_player ?? 'black',
      },
      moves: limitedMoves,
      board,
      stoneMap: buildStoneMap(board),
    };
  }

  return {
    loadMiniBoards,
    getGameSnapshot,
    normalizeMoveSequence,
    createBoardMatrix,
    neighbors,
    getGroupAndLiberties,
    checkCaptures,
    buildStoneMap,
  };
})();

window.GoMiniBoardLogic = GoMiniBoardLogic;
