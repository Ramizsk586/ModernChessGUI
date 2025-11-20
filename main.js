
// main.js
const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  dialog
} = require("electron");

const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

let mainWindow;
let settingsWindow;
let evalWindow;
let reportWindow;
let enginesWindow;
let newGameWindow;
let movesWindow;
let timerWindow;
let soundsWindow;
let threatsWindow;
let analysisBoardWindow;

// engine list and current defaults
let engines = [];
let currentPlayEngineId = null;  // engine playing against user
let currentEvalEngineId = null;  // engine used for evaluation bar

// last game data (for autosave + report + threats)
let lastGameData = { fen: null, moves: [] };

// ----- persistent storage paths -----
let SAVES_DIR;
let ENGINES_FILE;
let SOUNDS_FILE;
let DB_CONFIG_FILE; 
let PREFS_FILE; // New file for user preferences (theme)
let customSounds = {};
let userPreferences = { boardTheme: "classic" };

app.whenReady().then(() => {
  SAVES_DIR = path.join(app.getPath("userData"), "saves");
  if (!fs.existsSync(SAVES_DIR)) fs.mkdirSync(SAVES_DIR, { recursive: true });

  ENGINES_FILE = path.join(app.getPath("userData"), "engines.json");
  engines = loadEngines();
  if (engines.length) {
    const evalDefault = engines.find(e => e.isDefaultEval);
    const playDefault = engines.find(e => e.isDefaultPlay);
    currentEvalEngineId = evalDefault ? evalDefault.id : engines[0].id;
    currentPlayEngineId = playDefault ? playDefault.id : engines[0].id;
  }

  SOUNDS_FILE = path.join(app.getPath("userData"), "sounds.json");
  customSounds = loadSounds();
  
  DB_CONFIG_FILE = path.join(app.getPath("userData"), "database_config.json");
  
  PREFS_FILE = path.join(app.getPath("userData"), "preferences.json");
  userPreferences = loadPreferences();

  Menu.setApplicationMenu(null);
  createMainWindow();
  setupIPC();
});

// -------------- window creation -----------------

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 680,
    minWidth: 400,
    minHeight: 500,
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile("index.html");

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 620,
    height: 520, // Slight increase for new panel
    minWidth: 520,
    minHeight: 380,
    resizable: true,
    maximizable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: "Settings"
  });

  settingsWindow.loadFile("settings.html");

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

function createEvalWindow() {
  if (evalWindow) {
    evalWindow.focus();
    return;
  }

  evalWindow = new BrowserWindow({
    width: 110,
    height: 540,
    resizable: true,
    movable: true,
    alwaysOnTop: true,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: "Evaluation Bar"
  });

  evalWindow.loadFile("evaluation.html");

  evalWindow.on("closed", () => {
    evalWindow = null;
  });
}

function createReportWindow() {
  if (reportWindow) {
    reportWindow.focus();
    return;
  }

  reportWindow = new BrowserWindow({
    width: 720,
    height: 520,
    minWidth: 540,
    minHeight: 400,
    resizable: true,
    maximizable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: "Game Report"
  });

  reportWindow.loadFile("report.html");

  reportWindow.on("closed", () => {
    reportWindow = null;
  });
}

function createEnginesWindow() {
  if (enginesWindow) {
    enginesWindow.focus();
    return;
  }

  enginesWindow = new BrowserWindow({
    width: 620,
    height: 550,
    minWidth: 520,
    minHeight: 450,
    resizable: true,
    maximizable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: "Engines"
  });

  enginesWindow.loadFile("engines.html");

  enginesWindow.on("closed", () => {
    enginesWindow = null;
  });
}

function createNewGameWindow() {
  if (newGameWindow) {
    newGameWindow.focus();
    return;
  }

  newGameWindow = new BrowserWindow({
    width: 360,
    height: 260,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: "New Game"
  });

  newGameWindow.loadFile("newgame.html");

  newGameWindow.on("closed", () => {
    newGameWindow = null;
  });
}

function createMovesWindow() {
  if (movesWindow) {
    movesWindow.focus();
    return;
  }

  movesWindow = new BrowserWindow({
    width: 260,
    height: 400,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: "Moves"
  });

  movesWindow.loadFile("moves.html");

  movesWindow.webContents.on("did-finish-load", () => {
    if (lastGameData && Array.isArray(lastGameData.moves)) {
      movesWindow.webContents.send("moves-update", lastGameData.moves);
    }
  });

  movesWindow.on("closed", () => {
    movesWindow = null;
  });
}

function createTimerWindow() {
  if (timerWindow) {
    timerWindow.focus();
    return;
  }

  timerWindow = new BrowserWindow({
    width: 420,
    height: 380,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: "Game Clock"
  });

  timerWindow.loadFile("timer.html");

  timerWindow.on("closed", () => {
    timerWindow = null;
  });
}

function createSoundsWindow() {
  if (soundsWindow) {
    soundsWindow.focus();
    return;
  }

  soundsWindow = new BrowserWindow({
    width: 500,
    height: 420,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: "Sound Settings"
  });

  soundsWindow.loadFile("sounds.html");

  soundsWindow.on("closed", () => {
    soundsWindow = null;
  });
}

function createThreatsWindow() {
  if (threatsWindow) {
    threatsWindow.focus();
    return;
  }

  threatsWindow = new BrowserWindow({
    width: 800,
    height: 600, // Increased size for advanced UI
    minWidth: 600,
    minHeight: 450,
    resizable: true,
    maximizable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: "Deep Threat Analysis"
  });

  threatsWindow.loadFile("threats.html");

  threatsWindow.on("closed", () => {
    threatsWindow = null;
  });
}

function createAnalysisBoardWindow() {
  if (analysisBoardWindow) {
    analysisBoardWindow.focus();
    return;
  }

  analysisBoardWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: "Game Review"
  });

  analysisBoardWindow.loadFile("review.html");

  analysisBoardWindow.on("closed", () => {
    analysisBoardWindow = null;
  });
}

// -------------- IPC setup -----------------

function setupIPC() {
  // Settings open
  ipcMain.on("open-settings", () => {
    createSettingsWindow();
  });

  // DevTools from settings
  ipcMain.on("show-console", () => {
    if (mainWindow) {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  });

  // Panels
  ipcMain.on("set-eval-window", (_event, enabled) => {
    if (enabled) {
      if (!evalWindow) createEvalWindow();
    } else if (evalWindow) {
      evalWindow.close();
      evalWindow = null;
    }
  });

  ipcMain.on("set-report-window", (_event, enabled) => {
    if (enabled) {
      if (!reportWindow) createReportWindow();
    } else if (reportWindow) {
      reportWindow.close();
      reportWindow = null;
    }
  });

  ipcMain.on("set-moves-window", (_event, enabled) => {
    if (enabled) {
      if (!movesWindow) createMovesWindow();
    } else if (movesWindow) {
      movesWindow.close();
      movesWindow = null;
    }
  });

  // Engines manager
  ipcMain.on("open-engines-manager", () => {
    createEnginesWindow();
  });

  // New Game panel
  ipcMain.on("open-new-game", () => {
    createNewGameWindow();
  });

  // 🔊 Sound settings window
  ipcMain.on("open-sounds-manager", () => {
    createSoundsWindow();
  });

  // Threats window
  ipcMain.on("open-threats-window", () => {
    createThreatsWindow();
  });

  // From threats: open dedicated analysis board
  ipcMain.on("open-analysis-board", () => {
    createAnalysisBoardWindow();
  });

  // Game updates from renderer (after every move)
  ipcMain.on("game-position-updated", (_event, payload) => {
    if (!payload) return;
    lastGameData = payload;

    if (SAVES_DIR) {
      const filePath = path.join(SAVES_DIR, "lastGame.json");
      fs.writeFile(filePath, JSON.stringify(lastGameData, null, 2), () => {});
    }

    if (evalWindow && payload.fen) {
      evaluateWithEngine(payload.fen)
        .then(score => {
          evalWindow.webContents.send("eval-score", score);
        })
        .catch(err => {
          console.error("Eval engine error:", err?.message || err);
        });
    }

    if (movesWindow) {
      movesWindow.webContents.send("moves-update", payload.moves || []);
    }
  });

  ipcMain.on("request-last-game", (event) => {
    event.sender.send("last-game-data", lastGameData);
  });

  ipcMain.on("start-review-mode", (_event, gameData) => {
    createAnalysisBoardWindow();
    const sendData = () => {
      analysisBoardWindow.webContents.send("review-game", gameData || lastGameData);
    };
    if (analysisBoardWindow.webContents.isLoading()) {
      analysisBoardWindow.webContents.once('did-finish-load', sendData);
    } else {
      sendData();
    }
  });

  ipcMain.on("new-game-selected", (_event, payload) => {
    if (newGameWindow) {
      newGameWindow.close();
      newGameWindow = null;
    }
    if (payload && payload.engineId) {
      currentPlayEngineId = payload.engineId;
    }
    if (mainWindow) {
      mainWindow.webContents.send("new-game-start", payload);
    }
    createTimerWindow();
    const timerInfo = buildTimerInfo(payload);
    if (timerWindow) {
      timerWindow.webContents.send("timer-game-start", timerInfo);
    }
  });

  ipcMain.on("turn-changed", (_event, color) => {
    if (timerWindow) {
      timerWindow.webContents.send("turn-changed", color);
    }
  });

  ipcMain.on("stop-match", () => {
    if (timerWindow) {
      timerWindow.webContents.send("timer-stop");
    }
  });

  ipcMain.on("enter-review-mode", () => {
    if (!mainWindow) return;
    const [w, h] = mainWindow.getSize();
    if (w < 800 || h < 640) {
      mainWindow.setSize(800, 640);
    }
  });

  ipcMain.on("exit-review-mode", () => {
  });

  // ------------- engine management IPC -------------

  ipcMain.handle("engines-browse", async () => {
    const result = await dialog.showOpenDialog({
      title: "Select engine executable",
      properties: ["openFile"]
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("dialog-browse-image", async () => {
    const result = await dialog.showOpenDialog({
      title: "Select Avatar Image",
      properties: ["openFile"],
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }
      ]
    });
    if (result.canceled || !result.filePaths || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("engines-get-all", () => {
    return engines;
  });

  ipcMain.handle("engines-save", (_event, engineData) => {
    if (!engineData || !engineData.path) return engines;
    if (!engineData.id) {
      engineData.id = "eng-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
    }
    if (engineData.isDefaultPlay) {
      engines.forEach(e => { e.isDefaultPlay = false; });
      currentPlayEngineId = engineData.id;
    }
    if (engineData.isDefaultEval) {
      engines.forEach(e => { e.isDefaultEval = false; });
      currentEvalEngineId = engineData.id;
    }
    const idx = engines.findIndex(e => e.id === engineData.id);
    if (idx >= 0) {
      engines[idx] = engineData;
    } else {
      engines.push(engineData);
    }
    saveEngines(engines);
    return engines;
  });

  ipcMain.handle("engines-delete", (_event, id) => {
    engines = engines.filter(e => e.id !== id);
    saveEngines(engines);
    if (currentPlayEngineId === id) currentPlayEngineId = engines[0]?.id || null;
    if (currentEvalEngineId === id) currentEvalEngineId = engines[0]?.id || null;
    return engines;
  });

  ipcMain.handle("engines-get-basic", () => {
    return engines.map(e => ({ id: e.id, name: e.name }));
  });

  // ------------- engine MOVE IPC -------------

  ipcMain.on("request-engine-move", (event, payload) => {
    const { fen, engineId } = payload || {};
    const enginePath = getPlayEnginePath(engineId);
    if (!enginePath || !fen) {
      event.sender.send("engine-move", null);
      return;
    }
    const engObj = engines.find(e => e.id === engineId);
    const depth = engObj?.depth || 10;
    let bestMove = null;
    const engine = spawn(enginePath);

    engine.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      const match = text.match(/bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
      if (match) {
        bestMove = match[1];
      }
    });

    engine.on("close", () => {
      event.sender.send("engine-move", bestMove);
    });

    engine.on("error", (err) => {
      console.error("Play engine error:", err?.message || err);
      event.sender.send("engine-move", null);
    });

    try {
      engine.stdin.write("uci\n");
      engine.stdin.write("isready\n");
      engine.stdin.write(`position fen ${fen}\n`);
      engine.stdin.write(`go depth ${depth}\n`);
      setTimeout(() => {
        try { engine.stdin.write("quit\n"); } catch (_) {}
      }, 5000);
    } catch (e) {
      console.error("Engine write error:", e?.message || e);
      event.sender.send("engine-move", null);
    }
  });

  // ------------- ANALYSIS (MultiPV) IPC -------------

  ipcMain.on("request-analysis", (event, fen) => {
    // Uses the EVAL engine for analysis
    const enginePath = getEvalEnginePath();
    if (!enginePath || !fen) {
      event.sender.send("analysis-result", {});
      return;
    }

    const engine = spawn(enginePath);
    const results = {}; // { 1: "move", 2: "move", 3: "move" }

    engine.stdout.on("data", (chunk) => {
      const lines = chunk.toString().split("\n");
      for (const line of lines) {
        // Parse Info lines: info ... multipv 1 ... pv e2e4 ...
        if (line.startsWith("info") && line.includes("pv")) {
          // Extract multipv index
          const mpvMatch = line.match(/multipv\s+(\d+)/);
          const pvMatch = line.match(/pv\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
          
          if (mpvMatch && pvMatch) {
            const idx = parseInt(mpvMatch[1], 10);
            const move = pvMatch[1];
            results[idx] = move;
          }
        }
      }
    });

    engine.on("close", () => {
      event.sender.send("analysis-result", results);
    });

    try {
      engine.stdin.write("uci\n");
      engine.stdin.write("setoption name MultiPV value 3\n"); // Request top 3 lines
      engine.stdin.write("isready\n");
      engine.stdin.write(`position fen ${fen}\n`);
      engine.stdin.write("go depth 12\n"); // Fast but decent
      setTimeout(() => {
        try { engine.stdin.write("quit\n"); } catch (_) {}
      }, 2000); // Allow 2 seconds for analysis
    } catch (e) {
      console.error(e);
      event.sender.send("analysis-result", {});
    }
  });
  
  // ------------- DEEP THREAT SCAN IPC (New) -------------

  ipcMain.on("start-threat-scan", (event, moves) => {
    const enginePath = getEvalEnginePath();
    if (!enginePath || !moves || moves.length === 0) {
      event.sender.send("scan-complete");
      return;
    }

    // We will check specific positions in the game.
    // Checking every single move is slow, so let's check every other move or look for eval swings if we had them.
    // For this implementation, we check from the perspective of the player who JUST moved.
    
    let moveIndex = 0;
    
    const checkNextPosition = () => {
      if (moveIndex >= moves.length) {
        event.sender.send("scan-complete");
        return;
      }

      // Construct position moves string "startpos moves e2e4 ..."
      const movesSoFar = moves.slice(0, moveIndex + 1).map(m => m.from + m.to + (getPromoChar(m.piece) || ""));
      const uciMoves = movesSoFar.join(" ");
      
      // Who just moved?
      const turn = (moveIndex % 2 === 0) ? 'white' : 'black'; // Index 0 is white's first move
      // We want to see if this move created a threat for the opponent.
      
      const engine = spawn(enginePath);
      let foundThreat = null;
      let pvSequence = [];
      let scoreVal = 0;

      engine.stdout.on("data", (chunk) => {
        const lines = chunk.toString().split("\n");
        for (const line of lines) {
          if (line.startsWith("info") && line.includes("score") && line.includes("pv")) {
             // Score parsing
             const scoreMatch = line.match(/score\s+(cp|mate)\s+(-?\d+)/);
             const pvMatch = line.match(/pv\s+(.+)/);
             
             if (scoreMatch && pvMatch) {
                const type = scoreMatch[1];
                const val = parseInt(scoreMatch[2]);
                const movesStr = pvMatch[1];
                
                let isWinningForAttacker = false;
                
                // If mate is detected
                if (type === 'mate') {
                    if (turn === 'white' && val > 0) isWinningForAttacker = true;
                    if (turn === 'black' && val < 0) isWinningForAttacker = true;
                } 
                else if (type === 'cp') {
                    if (turn === 'white' && val > 200) isWinningForAttacker = true; // +2 pawns
                    if (turn === 'black' && val < -200) isWinningForAttacker = true; // -2 pawns
                }
                
                if (isWinningForAttacker) {
                    scoreVal = val;
                    pvSequence = movesStr.trim().split(" ");
                    foundThreat = {
                        type: type === 'mate' ? `Forced Mate in ${Math.abs(val)}` : `Material Advantage (${(Math.abs(val)/100).toFixed(1)})`,
                        pv: pvSequence
                    };
                }
             }
          }
        }
      });

      engine.on("close", () => {
        if (foundThreat && pvSequence.length > 1) {
           // Only report if there is a sequence (a threat implies a future danger)
           event.sender.send("threat-found", {
               index: moveIndex,
               ...foundThreat
           });
        }
        moveIndex++;
        checkNextPosition(); // Recurse
      });

      // Run engine
      engine.stdin.write(`position startpos moves ${uciMoves}\n`);
      engine.stdin.write(`go depth 10\n`); // Quick depth
      setTimeout(() => {
         try { engine.stdin.write("quit\n"); } catch(e){}
      }, 300); // 300ms per move scan
    };
    
    checkNextPosition();
  });

  // ------------- sound config IPC -------------

  ipcMain.handle("sounds-get-all", () => {
    return customSounds || {};
  });

  ipcMain.handle("sounds-save-all", (_event, data) => {
    customSounds = data && typeof data === "object" ? data : {};
    saveSounds(customSounds);
    return customSounds;
  });

  ipcMain.handle("sounds-browse", async () => {
    const result = await dialog.showOpenDialog({
      title: "Choose sound file",
      properties: ["openFile"],
      filters: [
        { name: "Audio Files", extensions: ["mp3", "wav", "ogg", "flac", "m4a"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });
    if (result.canceled || !result.filePaths || !result.filePaths.length) {
      return null;
    }
    return result.filePaths[0];
  });

  // ------------- DATABASE CONFIG IPC (New) -------------

  ipcMain.handle("database-browse", async () => {
    const result = await dialog.showOpenDialog({
      title: "Select Database File",
      properties: ["openFile"],
      filters: [
        { name: "Chess Databases", extensions: ["bin", "pgn", "db", "scid"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });
    if (result.canceled || !result.filePaths || !result.filePaths.length) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle("database-get", () => {
    try {
      if (fs.existsSync(DB_CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(DB_CONFIG_FILE, "utf8"));
      }
    } catch (e) { console.error(e); }
    return { path: "" };
  });

  ipcMain.handle("database-save", (_event, data) => {
    try {
      fs.writeFileSync(DB_CONFIG_FILE, JSON.stringify(data || { path: "" }, null, 2));
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  });
  
  // ------------- PREFERENCES (Theme) IPC -------------
  
  ipcMain.handle("get-preferences", () => {
      return userPreferences;
  });
  
  ipcMain.handle("save-preferences", (_event, data) => {
      if (!data) return userPreferences;
      userPreferences = { ...userPreferences, ...data };
      savePreferences(userPreferences);
      
      // Broadcast theme change to all windows
      const wins = [mainWindow, settingsWindow, evalWindow, reportWindow, enginesWindow, newGameWindow, movesWindow, timerWindow, soundsWindow, threatsWindow, analysisBoardWindow];
      wins.forEach(w => {
          if (w) w.webContents.send("theme-changed", userPreferences.boardTheme);
      });
      
      return userPreferences;
  });
}

// -------------- app lifecycle -----------------

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null && !analysisBoardWindow) createMainWindow();
});

// -------------- helpers -----------------

function loadEngines() {
  try {
    const txt = fs.readFileSync(ENGINES_FILE, "utf8");
    const arr = JSON.parse(txt);
    if (Array.isArray(arr)) return arr;
    return [];
  } catch {
    return [];
  }
}

function saveEngines(list) {
  try {
    fs.writeFileSync(ENGINES_FILE, JSON.stringify(list, null, 2));
  } catch (e) {
    console.error("Failed to save engines:", e?.message || e);
  }
}

function loadSounds() {
  try {
    const txt = fs.readFileSync(SOUNDS_FILE, "utf8");
    const obj = JSON.parse(txt);
    if (obj && typeof obj === "object") return obj;
    return {};
  } catch {
    return {};
  }
}

function saveSounds(obj) {
  try {
    fs.writeFileSync(SOUNDS_FILE, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.error("Failed to save sounds:", e?.message || e);
  }
}

function loadPreferences() {
    try {
        if (fs.existsSync(PREFS_FILE)) {
            return JSON.parse(fs.readFileSync(PREFS_FILE, "utf8"));
        }
    } catch { }
    return { boardTheme: "classic" };
}

function savePreferences(obj) {
    try {
        fs.writeFileSync(PREFS_FILE, JSON.stringify(obj, null, 2));
    } catch(e) {
        console.error("Failed to save prefs:", e);
    }
}

function getPromoChar(pieceStr) {
    if (!pieceStr) return "";
    const type = pieceStr[1];
    if (type === 'Q' || type === 'R' || type === 'B' || type === 'N') {
        return "";
    }
    return "";
}

function getEvalEnginePath() {
  if (!engines.length) return null;
  const evalEngine = engines.find(e => e.id === currentEvalEngineId) ||
                     engines.find(e => e.isDefaultEval) ||
                     engines[0];
  return evalEngine ? evalEngine.path : null;
}

function getPlayEnginePath(optionalId) {
  if (!engines.length) return null;
  let eng = null;
  if (optionalId) {
    eng = engines.find(e => e.id === optionalId) || null;
  }
  if (!eng) {
    eng = engines.find(e => e.id === currentPlayEngineId) ||
          engines.find(e => e.isDefaultPlay) ||
          engines[0];
  }
  return eng ? eng.path : null;
}

function evaluateWithEngine(fen) {
  return new Promise((resolve) => {
    const enginePath = getEvalEnginePath();
    if (!enginePath || !fen) {
      return resolve(0);
    }
    let bestScore = 0;
    const engine = spawn(enginePath);
    engine.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      const match = text.match(/score\s+(cp|mate)\s+(-?\d+)/);
      if (match) {
        const kind = match[1];
        const value = parseInt(match[2], 10);
        if (kind === "cp") {
          bestScore = value / 100;
        } else {
          bestScore = value > 0 ? 100 : -100;
        }
      }
    });
    engine.on("close", () => {
      resolve(bestScore);
    });
    engine.on("error", (err) => {
      resolve(0);
    });
    try {
      engine.stdin.write("uci\n");
      engine.stdin.write("isready\n");
      engine.stdin.write(`position fen ${fen}\n`);
      engine.stdin.write("go depth 14\n");
      setTimeout(() => {
        try { engine.stdin.write("quit\n"); } catch (_) {}
      }, 4000);
    } catch (e) {
      resolve(0);
    }
  });
}

function buildTimerInfo(payload) {
  const mode = payload?.mode === "engine" ? "engine" : "human";
  const humanColor = payload?.humanColor === "b" ? "b" : "w";
  let engineName = null;
  if (mode === "engine" && payload?.engineId) {
    const eng = engines.find(e => e.id === payload.engineId);
    engineName = eng ? eng.name : "Engine";
  }
  const result = {
    mode,
    white: { type: "Human", color: "w" },
    black: { type: "Human", color: "b" }
  };
  if (mode === "engine") {
    if (humanColor === "w") {
      result.white.type = "Human";
      result.black.type = engineName || "Engine";
    } else {
      result.white.type = engineName || "Engine";
      result.black.type = "Human";
    }
  }
  return result;
}
