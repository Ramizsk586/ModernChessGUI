
// ---------------------------
// TOP BAR BUTTONS
// ---------------------------
const settingsBtn = document.getElementById("settingsBtn");
if (settingsBtn) {
  settingsBtn.addEventListener("click", () => {
    window.electronAPI?.openSettings();
  });
}

const startGameBtn = document.getElementById("startGame");
const stopGameBtn = document.getElementById("stopGame");

startGameBtn?.addEventListener("click", () => {
  window.electronAPI?.openNewGame();
});

stopGameBtn?.addEventListener("click", () => {
  endGameAndResetUI();
});

// ---------------------------
// UI / MODALS
// ---------------------------
const modalOverlay = document.getElementById("modal-overlay");
const promotionModal = document.getElementById("promotion-modal");
const gameOverModal = document.getElementById("game-over-modal");
const gameOverTitle = document.getElementById("game-over-title");
const gameOverReason = document.getElementById("game-over-reason");
const closeModalBtn = document.getElementById("close-modal-btn");
const promoOptions = document.querySelectorAll(".promo-option");

// Promotion Pending State
let promotionPending = null; // { fromRow, fromCol, toRow, toCol }

function showModal(type) {
  modalOverlay.classList.remove("hidden");
  if (type === "promotion") {
    promotionModal.classList.remove("hidden");
    gameOverModal.classList.add("hidden");
    
    // Set correct piece icons based on turn
    promoOptions.forEach(opt => {
      const pType = opt.getAttribute("data-type"); // Q, R, B, N
      const pCode = (turn === "w" ? "w" : "b") + pType;
      opt.style.backgroundImage = `url(assets/pieces/${pCode}.png)`;
    });
  } else if (type === "gameover") {
    gameOverModal.classList.remove("hidden");
    promotionModal.classList.add("hidden");
  }
}

function hideModals() {
  modalOverlay.classList.add("hidden");
  promotionModal.classList.add("hidden");
  gameOverModal.classList.add("hidden");
}

promoOptions.forEach(opt => {
  opt.addEventListener("click", () => {
    const type = opt.getAttribute("data-type"); // Q, R, B, N
    if (promotionPending) {
      const { fromRow, fromCol, toRow, toCol } = promotionPending;
      const pCode = (turn === "w" ? "w" : "b") + type; // e.g. wQ
      finalizeMove(fromRow, fromCol, toRow, toCol, pCode);
      promotionPending = null;
      hideModals();
    }
  });
});

closeModalBtn.addEventListener("click", hideModals);

// ---------------------------
// GAME MODE / ENGINE STATE
// ---------------------------

let gameMode = "idle";    // "idle" | "human" | "engine" | "review"
let humanColor = "w";     // 'w' or 'b'
let engineColor = null;   // 'w' or 'b' when in engine mode
let opponentEngineId = null;
let engineThinking = false;

// castling + en passant
let castlingRights = { wK: true, wQ: true, bK: true, bQ: true };
let enPassantTarget = null; // {row, col} or null

// draw rules tracking
let halfmoveClock = 0; // 50-move rule
let fullmoveNumber = 1;
let positionHistory = []; // Array of FENs for 3-fold repetition

// review mode state
let inReviewMode = false;
let reviewGame = null;  // {moves:[{from,to,piece,tag}]}
let reviewIndex = -1;
let reviewCurrentTag = null;

// ---------------------------
// BASIC BOARD + STATE
// ---------------------------

const boardElement = document.getElementById("board");

// starting position
const initialPosition = [
  ["bR","bN","bB","bQ","bK","bB","bN","bR"],
  ["bP","bP","bP","bP","bP","bP","bP","bP"],
  ["","","","","","","",""],
  ["","","","","","","",""],
  ["","","","","","","",""],
  ["","","","","","","",""],
  ["wP","wP","wP","wP","wP","wP","wP","wP"],
  ["wR","wN","wB","wQ","wK","wB","wN","wR"]
];

// mutable game state
let board = cloneBoard(initialPosition);
let turn = "w";                      // 'w' or 'b'
let selectedSquare = null;           // {row, col} or null
let legalMovesForSelected = [];      // [{toRow, toCol}]
let lastMove = null;                 // {fromRow, fromCol, toRow, toCol, piece, capture}
let gameMoves = [];                  // [{from, to, piece}]

// ---------------------------
// THEME INITIALIZATION
// ---------------------------
async function initTheme() {
    const prefs = await window.electronAPI?.getPreferences();
    if (prefs && prefs.boardTheme) {
        document.documentElement.setAttribute('data-theme', prefs.boardTheme);
    }
}
initTheme();

window.electronAPI?.onThemeChanged((theme) => {
    document.documentElement.setAttribute('data-theme', theme);
});

// ---------------------------
// NEW GAME HANDLER
// ---------------------------

function endGameAndResetUI() {
  gameMode = "idle";
  opponentEngineId = null;
  engineColor = null;
  humanColor = "w";
  engineThinking = false;
  inReviewMode = false;
  reviewGame = null;
  reviewIndex = -1;
  reviewCurrentTag = null;
  
  resetBoardState();
  window.electronAPI?.stopMatch();

  if (startGameBtn && stopGameBtn) {
    startGameBtn.style.display = "inline-block";
    stopGameBtn.style.display = "none";
  }
  hideModals();
}

function resetBoardState() {
  board = cloneBoard(initialPosition);
  turn = "w";
  selectedSquare = null;
  legalMovesForSelected = [];
  lastMove = null;
  gameMoves = [];
  castlingRights = { wK: true, wQ: true, bK: true, bQ: true };
  enPassantTarget = null;
  halfmoveClock = 0;
  fullmoveNumber = 1;
  positionHistory = [];
  
  // Initial history
  positionHistory.push(boardToFEN(board, turn));
  
  const boardEl = document.getElementById("board");
  boardEl.classList.remove("board-check", "board-mate");
  renderBoard();
}

function startNewGameFromPayload(payload) {
  const mode = payload?.mode === "engine" ? "engine" : "human";
  const engineId = payload?.engineId || null;
  const hColor = payload?.humanColor === "b" ? "b" : "w";

  gameMode = mode;
  humanColor = hColor;
  engineColor = mode === "engine" ? (hColor === "w" ? "b" : "w") : null;
  opponentEngineId = engineId;
  engineThinking = false;
  inReviewMode = false;
  reviewGame = null;
  reviewIndex = -1;
  reviewCurrentTag = null;

  resetBoardState();

  if (startGameBtn && stopGameBtn) {
    startGameBtn.style.display = "none";
    stopGameBtn.style.display = "inline-block";
  }

  // notify timer who starts
  window.electronAPI?.turnChanged(turn);

  // if engine is White, it moves first
  maybeEngineMove();
}

window.electronAPI?.onNewGameStart((payload) => {
  startNewGameFromPayload(payload);
});

// ---------------------------
// UTILS
// ---------------------------

function cloneBoard(b) {
  return b.map(row => row.slice());
}

function inBounds(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function getPiece(b, row, col) {
  if (!inBounds(row, col)) return "";
  return b[row][col];
}

function getColor(piece) {
  if (!piece) return null;
  return piece[0] === "w" ? "w" : piece[0] === "b" ? "b" : null;
}

function getType(piece) {
  return piece ? piece[1] : null;
}

function coordToSquare(row, col) {
  const file = String.fromCharCode("a".charCodeAt(0) + col);
  const rank = 8 - row;
  return file + rank;
}

function coordToFENPiece(piece) {
  if (!piece) return "";
  const type = getType(piece);
  const color = getColor(piece);
  const letterMap = { P: "p", N: "n", B: "b", R: "r", Q: "q", K: "k" };
  let ch = letterMap[type] || "?";
  if (color === "w") ch = ch.toUpperCase();
  return ch;
}

// Generate FEN for any board + side to move
function boardToFEN(b, activeColor) {
  let rows = [];
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    let rowStr = "";
    for (let c = 0; c < 8; c++) {
      const piece = b[r][c];
      if (!piece) {
        empty++;
      } else {
        if (empty > 0) {
          rowStr += empty.toString();
          empty = 0;
        }
        rowStr += coordToFENPiece(piece);
      }
    }
    if (empty > 0) rowStr += empty.toString();
    rows.push(rowStr);
  }
  const placement = rows.join("/");
  const active = activeColor === "b" ? "b" : "w";
  const castling =
    (castlingRights.wK ? "K" : "") +
    (castlingRights.wQ ? "Q" : "") +
    (castlingRights.bK ? "k" : "") +
    (castlingRights.bQ ? "q" : "") || "-";
  const ep = enPassantTarget
    ? coordToSquare(enPassantTarget.row, enPassantTarget.col)
    : "-";
  
  return `${placement} ${active} ${castling} ${ep} ${halfmoveClock} ${fullmoveNumber}`;
}

// ---------------------------
// DRAW LOGIC
// ---------------------------

function checkInsufficientMaterial(b) {
  // Flat list of pieces
  const pieces = [];
  for(let r=0; r<8; r++){
    for(let c=0; c<8; c++){
      if(b[r][c]) pieces.push(b[r][c]);
    }
  }
  
  // K vs K
  if (pieces.length === 2) return true;
  
  // K+N vs K or K+B vs K
  if (pieces.length === 3) {
    const types = pieces.map(getType);
    if (types.includes("N") || types.includes("B")) return true;
  }
  
  return false;
}

function checkRepetition(fen) {
  const cleanFen = fen.split(" ").slice(0, 4).join(" ");
  const count = positionHistory.filter(f => f.split(" ").slice(0, 4).join(" ") === cleanFen).length;
  return count >= 3;
}

function checkGameOver(currentBoard, sideToMove) {
  const inCheck = isKingInCheck(currentBoard, sideToMove);
  const hasMoves = sideHasAnyLegalMove(sideToMove);
  
  if (!hasMoves) {
    if (inCheck) return { over: true, result: "Checkmate", winner: sideToMove === "w" ? "Black" : "White" };
    else return { over: true, result: "Stalemate", winner: "Draw" };
  }
  
  if (checkInsufficientMaterial(currentBoard)) {
    return { over: true, result: "Insufficient Material", winner: "Draw" };
  }
  
  if (halfmoveClock >= 100) {
    return { over: true, result: "50-Move Rule", winner: "Draw" };
  }
  
  const currentFen = boardToFEN(currentBoard, sideToMove);
  if (checkRepetition(currentFen)) {
     return { over: true, result: "Threefold Repetition", winner: "Draw" };
  }
  
  return { over: false };
}

// ---------------------------
// MOVE EXECUTION
// ---------------------------

function findKing(b, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (p === color + "K") {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

// Apply move purely on board data structure (updates board, castling, EP)
// Returns { piece, captured }
function applyMoveOnBoard(b, fromRow, fromCol, toRow, toCol, opts = { isReal: false, promotionPiece: null }) {
  const piece = b[fromRow][fromCol];
  const color = getColor(piece);
  const type = getType(piece);
  let target = b[toRow][toCol];
  let capturedPiece = target;

  // EN PASSANT CAPTURE
  if (type === "P" && fromCol !== toCol && !target && enPassantTarget &&
      enPassantTarget.row === toRow && enPassantTarget.col === toCol) {
    const capRow = color === "w" ? toRow + 1 : toRow - 1;
    capturedPiece = b[capRow][toCol];
    b[capRow][toCol] = "";
  }

  // MOVE PIECE
  b[fromRow][fromCol] = "";
  b[toRow][toCol] = piece;

  // PROMOTION
  if (type === "P") {
    if ((color === "w" && toRow === 0) || (color === "b" && toRow === 7)) {
      // If explicit promotion piece provided (e.g. from UI or Engine), use it
      if (opts.promotionPiece) {
        b[toRow][toCol] = opts.promotionPiece;
      } else {
         // Default/Fallback (shouldn't happen in real play due to UI)
        b[toRow][toCol] = color + "Q"; 
      }
    }
  }

  // CASTLING ROOK MOVE
  if (type === "K" && Math.abs(toCol - fromCol) === 2) {
    if (toCol > fromCol) { // Kingside
      const rookFromCol = 7;
      const rookToCol = 5;
      b[toRow][rookToCol] = b[toRow][rookFromCol];
      b[toRow][rookFromCol] = "";
    } else { // Queenside
      const rookFromCol = 0;
      const rookToCol = 3;
      b[toRow][rookToCol] = b[toRow][rookFromCol];
      b[toRow][rookFromCol] = "";
    }
  }

  if (opts.isReal) {
    // Update Halfmove Clock
    if (type === "P" || capturedPiece) {
      halfmoveClock = 0;
    } else {
      halfmoveClock++;
    }

    // Update Fullmove Number
    if (color === "b") {
      fullmoveNumber++;
    }

    // Update Castling Rights
    if (type === "K") {
      if (color === "w") { castlingRights.wK = false; castlingRights.wQ = false; }
      else { castlingRights.bK = false; castlingRights.bQ = false; }
    }
    if (type === "R") {
      if (fromRow === 7 && fromCol === 0) castlingRights.wQ = false;
      if (fromRow === 7 && fromCol === 7) castlingRights.wK = false;
      if (fromRow === 0 && fromCol === 0) castlingRights.bQ = false;
      if (fromRow === 0 && fromCol === 7) castlingRights.bK = false;
    }
    // If rook captured
    if (capturedPiece && getType(capturedPiece) === "R") {
      if (toRow === 7 && toCol === 0) castlingRights.wQ = false;
      if (toRow === 7 && toCol === 7) castlingRights.wK = false;
      if (toRow === 0 && toCol === 0) castlingRights.bQ = false;
      if (toRow === 0 && toCol === 7) castlingRights.bK = false;
    }

    // Update En Passant Target
    if (type === "P" && Math.abs(toRow - fromRow) === 2) {
      const epRow = (fromRow + toRow) / 2;
      enPassantTarget = { row: epRow, col: fromCol };
    } else {
      enPassantTarget = null;
    }
  }

  return { piece: b[toRow][toCol], captured: !!capturedPiece };
}

// ---------------------------
// MOVE GENERATION
// ---------------------------

function getPseudoMovesForPiece(b, row, col) {
  const piece = getPiece(b, row, col);
  if (!piece) return [];
  const color = getColor(piece);
  const type = getType(piece);
  const moves = [];

  if (type === "P") {
    const dir = color === "w" ? -1 : 1;
    const startRank = color === "w" ? 6 : 1;

    // 1 step forward
    const oneStep = row + dir;
    if (inBounds(oneStep, col) && !getPiece(b, oneStep, col)) {
      moves.push({ toRow: oneStep, toCol: col });

      // 2 steps forward
      const twoStep = row + 2 * dir;
      if (row === startRank && !getPiece(b, twoStep, col)) {
        moves.push({ toRow: twoStep, toCol: col });
      }
    }

    // normal captures
    const captureCols = [col - 1, col + 1];
    for (const cc of captureCols) {
      const rr = row + dir;
      if (!inBounds(rr, cc)) continue;
      const target = getPiece(b, rr, cc);
      if (target && getColor(target) !== color) {
        moves.push({ toRow: rr, toCol: cc });
      }
    }

    // en passant
    if (enPassantTarget) {
      const epRow = enPassantTarget.row;
      const epCol = enPassantTarget.col;
      if (epRow === row + dir && Math.abs(epCol - col) === 1) {
        const adjPawn = getPiece(b, row, epCol);
        if (adjPawn && getType(adjPawn) === "P" && getColor(adjPawn) !== color) {
          moves.push({ toRow: epRow, toCol: epCol });
        }
      }
    }
  }

  if (type === "N") {
    const deltas = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2],  [1, 2],  [2, -1],  [2, 1]
    ];
    for (const [dr, dc] of deltas) {
      const r = row + dr;
      const c = col + dc;
      if (!inBounds(r, c)) continue;
      const target = getPiece(b, r, c);
      if (getColor(target) !== color) {
        moves.push({ toRow: r, toCol: c });
      }
    }
  }

  if (type === "B" || type === "R" || type === "Q") {
    const dirs = [];
    if (type === "B" || type === "Q") {
      dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    }
    if (type === "R" || type === "Q") {
      dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
    }
    for (const [dr, dc] of dirs) {
      let r = row + dr;
      let c = col + dc;
      while (inBounds(r, c)) {
        const target = getPiece(b, r, c);
        if (!target) {
          moves.push({ toRow: r, toCol: c });
        } else {
          if (getColor(target) !== color) {
            moves.push({ toRow: r, toCol: c });
          }
          break;
        }
        r += dr;
        c += dc;
      }
    }
  }

  if (type === "K") {
    const deltas = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1],  [1, 0],  [1, 1]
    ];
    for (const [dr, dc] of deltas) {
      const r = row + dr;
      const c = col + dc;
      if (!inBounds(r, c)) continue;
      const target = getPiece(b, r, c);
      if (getColor(target) !== color) {
        moves.push({ toRow: r, toCol: c });
      }
    }

    // Castling Logic
    
    if (!isKingInCheck(b, color)) {
      const rank = color === "w" ? 7 : 0;
      const enemy = color === "w" ? "b" : "w";

      // Kingside
      if ((color === "w" ? castlingRights.wK : castlingRights.bK)) {
        if (!getPiece(b, rank, 5) && !getPiece(b, rank, 6)) {
          // Check passing through square f1/f8
          if (!isSquareAttacked(b, rank, 5, enemy)) {
             // Rook must exist
             if (getPiece(b, rank, 7) === (color + "R")) {
                moves.push({ toRow: rank, toCol: 6 });
             }
          }
        }
      }

      // Queenside
      if ((color === "w" ? castlingRights.wQ : castlingRights.bQ)) {
        if (!getPiece(b, rank, 1) && !getPiece(b, rank, 2) && !getPiece(b, rank, 3)) {
          // Check passing through square d1/d8
          if (!isSquareAttacked(b, rank, 3, enemy)) {
             // Rook must exist
             if (getPiece(b, rank, 0) === (color + "R")) {
                moves.push({ toRow: rank, toCol: 2 });
             }
          }
        }
      }
    }
  }

  return moves;
}

function isSquareAttacked(b, targetRow, targetCol, byColor) {
  // Pawn attacks
  const pawnDir = byColor === "w" ? -1 : 1;
  if (inBounds(targetRow - pawnDir, targetCol - 1)) {
    const p = getPiece(b, targetRow - pawnDir, targetCol - 1);
    if (p === byColor + "P") return true;
  }
  if (inBounds(targetRow - pawnDir, targetCol + 1)) {
    const p = getPiece(b, targetRow - pawnDir, targetCol + 1);
    if (p === byColor + "P") return true;
  }

  // Knight attacks
  const knightDeltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  for (const [dr, dc] of knightDeltas) {
    const r = targetRow + dr, c = targetCol + dc;
    if (inBounds(r, c) && getPiece(b, r, c) === byColor + "N") return true;
  }

  // King attacks
  const kingDeltas = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  for (const [dr, dc] of kingDeltas) {
     const r = targetRow + dr, c = targetCol + dc;
     if (inBounds(r, c) && getPiece(b, r, c) === byColor + "K") return true;
  }

  // Sliding pieces (B, R, Q)
  const dirs = [
    [-1,0], [1,0], [0,-1], [0,1],      // Rook dirs
    [-1,-1], [-1,1], [1,-1], [1,1]     // Bishop dirs
  ];

  for (let i = 0; i < 8; i++) {
    const [dr, dc] = dirs[i];
    const isDiagonal = i >= 4;
    let r = targetRow + dr;
    let c = targetCol + dc;
    while (inBounds(r, c)) {
      const p = getPiece(b, r, c);
      if (p) {
        if (getColor(p) === byColor) {
          const type = getType(p);
          if (type === "Q") return true;
          if (isDiagonal && type === "B") return true;
          if (!isDiagonal && type === "R") return true;
        }
        break; // Blocked by any piece
      }
      r += dr;
      c += dc;
    }
  }

  return false;
}

function isKingInCheck(b, color) {
  const king = findKing(b, color);
  if (!king) return false;
  const enemy = color === "w" ? "b" : "w";
  return isSquareAttacked(b, king.row, king.col, enemy);
}

function generateLegalMovesForSquare(row, col) {
  const piece = getPiece(board, row, col);
  if (!piece) return [];
  const color = getColor(piece);
  if (color !== turn) return [];

  const savedCastling = { ...castlingRights };
  const savedEP = enPassantTarget ? { ...enPassantTarget } : null;

  const pseudo = getPseudoMovesForPiece(board, row, col);
  const legal = [];

  for (const mv of pseudo) {
    const tmpBoard = cloneBoard(board);
    const tmpCastling = { ...savedCastling };
    const tmpEP = savedEP ? { ...savedEP } : null;

    // Temporary swap global state to test move logic that depends on it
    const oldCR = castlingRights;
    const oldEP = enPassantTarget;
    castlingRights = tmpCastling;
    enPassantTarget = tmpEP;
    
    applyMoveOnBoard(tmpBoard, row, col, mv.toRow, mv.toCol, { isReal: false });

    if (!isKingInCheck(tmpBoard, color)) {
      legal.push(mv);
    }

    // Restore state
    castlingRights = oldCR;
    enPassantTarget = oldEP;
  }
  return legal;
}

function sideHasAnyLegalMove(color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = getPiece(board, r, c);
      if (!p || getColor(p) !== color) continue;
      const legal = generateLegalMovesForSquare(r, c);
      if (legal.length) return true;
    }
  }
  return false;
}

// ---------------------------
// RENDER + INTERACTION
// ---------------------------

function renderBoard() {
  boardElement.innerHTML = "";

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = document.createElement("div");
      square.classList.add("square");

      if ((row + col) % 2 === 0) square.classList.add("light");
      else square.classList.add("dark");

      if (lastMove) {
        if (
          (lastMove.fromRow === row && lastMove.fromCol === col) ||
          (lastMove.toRow === row && lastMove.toCol === col)
        ) {
          square.classList.add("last-move-square");
        }
      }

      if (selectedSquare &&
          selectedSquare.row === row &&
          selectedSquare.col === col) {
        square.classList.add("selected-square");
      }

      const piece = board[row][col];
      if (piece) {
        const pieceDiv = document.createElement("div");
        pieceDiv.classList.add("piece");
        pieceDiv.style.backgroundImage = `url(assets/pieces/${piece}.png)`;

        if (lastMove && lastMove.toRow === row && lastMove.toCol === col) {
          pieceDiv.classList.add("just-moved");
        }
        square.appendChild(pieceDiv);

        if (inReviewMode && lastMove &&
            lastMove.toRow === row && lastMove.toCol === col &&
            reviewCurrentTag) {
          const icon = document.createElement("div");
          icon.classList.add("annotation-icon");
          if (reviewCurrentTag === "good") {
            icon.classList.add("annotation-good");
            icon.textContent = "!";
          } else if (reviewCurrentTag === "excellent") {
            icon.classList.add("annotation-excellent");
            icon.textContent = "!!";
          } else if (reviewCurrentTag === "mistake") {
            icon.classList.add("annotation-mistake");
            icon.textContent = "?";
          } else if (reviewCurrentTag === "blunder") {
            icon.classList.add("annotation-blunder");
            icon.textContent = "??";
          }
          square.appendChild(icon);
        }
      }

      const isTarget = legalMovesForSelected.some(
        mv => mv.toRow === row && mv.toCol === col
      );
      if (isTarget) {
        const dot = document.createElement("div");
        dot.classList.add("move-dot");
        square.appendChild(dot);
      }

      if (lastMove && lastMove.capture &&
          lastMove.toRow === row && lastMove.toCol === col) {
        square.classList.add("capture-flash");
      }

      square.addEventListener("click", () => onSquareClick(row, col));
      boardElement.appendChild(square);
    }
  }
}

function finalizeMove(fromRow, fromCol, toRow, toCol, promotionPiece = null) {
  // 1. Apply move logic
  const { piece: movedPiece, captured } =
    applyMoveOnBoard(board, fromRow, fromCol, toRow, toCol, { isReal: true, promotionPiece });

  // 2. Update UI state
  lastMove = {
    fromRow,
    fromCol,
    toRow,
    toCol,
    piece: movedPiece,
    capture: captured
  };

  const fromSq = coordToSquare(fromRow, fromCol);
  const toSq = coordToSquare(toRow, toCol);
  
  // Add move to list
  gameMoves.push({ from: fromSq, to: toSq, piece: movedPiece });
  
  // 3. Determine next turn
  const movingColor = getColor(movedPiece);
  const nextTurn = movingColor === "w" ? "b" : "w";
  
  turn = nextTurn;

  // 4. Calculate FEN and History
  const fen = boardToFEN(board, turn);
  positionHistory.push(fen);

  // 5. Send updates
  window.electronAPI?.gamePositionUpdated({
    fen,
    moves: gameMoves
  });
  window.electronAPI?.turnChanged(turn);

  // 6. Check Game Over (using new turn)
  const status = checkGameOver(board, turn);
  const inCheck = isKingInCheck(board, turn);

  // 7. Audio
  if (status.over && status.result === "Checkmate") {
     playSound("check"); 
  } else if (inCheck) {
     playSound("check");
  } else if (promotionPiece) {
     playSound("promote");
  } else if (captured) {
    playSound("capture");
  } else {
    playSound("move");
  }

  // 8. Update Board Status Classes
  const boardEl = document.getElementById("board");
  boardEl.classList.remove("board-check", "board-mate");

  if (inCheck) {
    if (status.over && status.result === "Checkmate") {
      boardEl.classList.add("board-mate");
    } else {
      boardEl.classList.add("board-check");
    }
  }

  // 9. Clear selection
  selectedSquare = null;
  legalMovesForSelected = [];
  renderBoard();

  // 10. Handle Game Over state
  if (status.over) {
    gameOverTitle.textContent = status.result;
    gameOverReason.textContent = `Winner: ${status.winner}`;
    showModal("gameover");
    window.electronAPI?.stopMatch();
  } else {
    // 11. Trigger Engine if needed
    maybeEngineMove();
  }
}

function onSquareClick(row, col) {
  if (inReviewMode || (gameMode !== "idle" && gameOverModal.classList.contains("visible"))) return;

  // Prevent clicking if waiting for engine
  if (gameMode === "engine" && turn === engineColor && engineThinking) return;
  
  // Prevent clicking if playing engine and it's engine's turn (double safety)
  if (gameMode === "engine" && turn !== humanColor) return;

  const piece = getPiece(board, row, col);
  const color = getColor(piece);

  // Check if clicking a destination square for selected piece
  const destMove = legalMovesForSelected.find(
    mv => mv.toRow === row && mv.toCol === col
  );

  if (selectedSquare && destMove) {
    const fromRow = selectedSquare.row;
    const fromCol = selectedSquare.col;
    const movingPiece = getPiece(board, fromRow, fromCol);

    // Check Promotion
    const isPawn = getType(movingPiece) === "P";
    const isLastRank = (turn === "w" && row === 0) || (turn === "b" && row === 7);

    if (isPawn && isLastRank) {
      // Store pending move and show modal
      promotionPending = { fromRow, fromCol, toRow: row, toCol: col };
      showModal("promotion");
    } else {
      // Normal Move
      finalizeMove(fromRow, fromCol, row, col);
    }
    return;
  }

  // Deselect if clicking same square
  if (selectedSquare &&
      selectedSquare.row === row &&
      selectedSquare.col === col) {
    selectedSquare = null;
    legalMovesForSelected = [];
    renderBoard();
    return;
  }

  // Select new piece
  if (piece && color === turn) {
    selectedSquare = { row, col };
    legalMovesForSelected = generateLegalMovesForSquare(row, col);
    renderBoard();
    return;
  }

  // Click empty or enemy without selection -> clear
  selectedSquare = null;
  legalMovesForSelected = [];
  renderBoard();
}

// ---------------------------
// ENGINE MOVE HANDLING
// ---------------------------

function maybeEngineMove() {
  if (gameMode !== "engine") return;
  if (!opponentEngineId) return;
  if (turn !== engineColor) return;
  if (engineThinking) return;

  const fen = boardToFEN(board, turn);
  engineThinking = true;
  window.electronAPI?.requestEngineMove({
    fen,
    engineId: opponentEngineId
  });
}

window.electronAPI?.onEngineMove((uciMove) => {
  engineThinking = false;
  if (!uciMove) {
    return;
  }

  const fromFile = uciMove[0];
  const fromRank = uciMove[1];
  const toFile = uciMove[2];
  const toRank = uciMove[3];
  const promoChar = uciMove.length > 4 ? uciMove[4] : null;

  const fromCol = fromFile.charCodeAt(0) - "a".charCodeAt(0);
  const fromRow = 8 - parseInt(fromRank, 10);
  const toCol = toFile.charCodeAt(0) - "a".charCodeAt(0);
  const toRow = 8 - parseInt(toRank, 10);

  if (!inBounds(fromRow, fromCol) || !inBounds(toRow, toCol)) {
    console.warn("Engine move out of bounds:", uciMove);
    return;
  }

  // Determine specific promotion piece if engine sent one (e.g. "a7a8q")
  let promotionPiece = null;
  if (promoChar) {
    const map = { q: "Q", r: "R", b: "B", n: "N" };
    const type = map[promoChar.toLowerCase()] || "Q";
    promotionPiece = turn + type;
  }

  finalizeMove(fromRow, fromCol, toRow, toCol, promotionPiece);
});

// ---------------------------
// SOUNDS
// ---------------------------

function playSound(type) {
  let file = "move-self.mp3";
  if (type === "capture") file = "capture.mp3";
  if (type === "check") file = "move-check.mp3";
  if (type === "promote") file = "promote.mp3";

  try {
    const audio = new Audio(`assets/sounds/${file}`);
    audio.play().catch(() => {});
  } catch (e) {}
}

// initial render
renderBoard();
