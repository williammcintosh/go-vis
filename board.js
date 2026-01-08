function getIntersection(board, x, y) {
  return board.querySelector(`.intersection[data-x="${x}"][data-y="${y}"]`);
}

function drawBoard(board, size, toggleStone) {
  for (let i = 0; i <= size; i++) {
    const v = document.createElement('div');
    v.classList.add('line', 'v');
    v.style.left = `${(i / size) * 100}%`;
    board.appendChild(v);
    const h = document.createElement('div');
    h.classList.add('line', 'h');
    h.style.top = `${(i / size) * 100}%`;
    board.appendChild(h);
  }
  for (let y = 0; y <= size; y++) {
    for (let x = 0; x <= size; x++) {
      const inter = document.createElement('div');
      inter.classList.add('intersection');
      inter.dataset.x = x;
      inter.dataset.y = y;
      inter.style.left = `${(x / size) * 100}%`;
      inter.style.top = `${(y / size) * 100}%`;
      inter.addEventListener('click', toggleStone);
      board.appendChild(inter);
    }
  }
}

function clearStones() {
  document
    .querySelectorAll('.intersection')
    .forEach((i) => i.classList.remove('black', 'white'));
}

function renderFinalStones(currentMode, stones, getIntersectionRef, clearStonesRef) {
  if (currentMode === 'position') {
    clearStonesRef();
  }
  stones.forEach((s) => {
    const inter = getIntersectionRef(s.x, s.y);
    if (inter) {
      inter.classList.remove('black', 'white');
      inter.classList.add(s.color);
    }
  });
}

function updateSequenceIntersections(prevMap, nextMap, getIntersectionRef) {
  for (const key of Object.keys(prevMap)) {
    if (nextMap[key]) continue;
    const [x, y] = key.split(',').map(Number);
    const inter = getIntersectionRef(x, y);
    if (inter) inter.classList.remove('black', 'white');
  }
  for (const [key, colorChar] of Object.entries(nextMap)) {
    if (prevMap[key] === colorChar) continue;
    const [x, y] = key.split(',').map(Number);
    const inter = getIntersectionRef(x, y);
    if (!inter) continue;
    inter.classList.remove('black', 'white');
    inter.classList.add(colorChar === 'B' ? 'black' : 'white');
  }
}

async function playSequence(
  moves,
  boardDimension,
  getIntersectionRef,
  updateSequenceIntersectionsRef
) {
  const debugSequence = window.DEBUG_SEQUENCE === true;
  const formatMove = (move) => {
    if (!move) return '??';
    const color = move.color === 'B' ? 'B' : 'W';
    return `${color}[${move.x},${move.y}]`;
  };
  if (debugSequence) {
    console.log('[sequence-debug] expected order', {
      total: moves.length,
      moves: moves.map(formatMove),
    });
  }
  const sequenceBoard = window.GoMiniBoardLogic.createBoardMatrix(boardDimension);
  let prevMap = {};
  const stepDelay = 420;
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    sequenceBoard[move.y][move.x] = move.color;
    window.GoMiniBoardLogic.checkCaptures(
      sequenceBoard,
      move.x,
      move.y,
      move.color
    );
    const nextMap = window.GoMiniBoardLogic.buildStoneMap(sequenceBoard);
    if (debugSequence) {
      const prevCount = Object.keys(prevMap).length;
      const nextCount = Object.keys(nextMap).length;
      console.log('[sequence-debug] step', {
        index: i + 1,
        move: formatMove(move),
        prevCount,
        nextCount,
      });
    }
    updateSequenceIntersectionsRef(prevMap, nextMap);
    prevMap = nextMap;
    await new Promise((resolve) => setTimeout(resolve, stepDelay));
  }
}

function createIntersectionHelpers(board) {
  const getIntersectionRef = (x, y) => getIntersection(board, x, y);
  const updateSequenceIntersectionsRef = (prevMap, nextMap) =>
    updateSequenceIntersections(prevMap, nextMap, getIntersectionRef);
  return { getIntersectionRef, updateSequenceIntersectionsRef };
}

export {
  drawBoard,
  clearStones,
  renderFinalStones,
  updateSequenceIntersections,
  playSequence,
  getIntersection,
  createIntersectionHelpers,
};
