
// preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // ---------- Settings / panels ----------

  openSettings: () => ipcRenderer.send("open-settings"),

  setEvaluationWindowEnabled: (enabled) =>
    ipcRenderer.send("set-eval-window", enabled),

  setReportWindowEnabled: (enabled) =>
    ipcRenderer.send("set-report-window", enabled),

  setMovesWindowEnabled: (enabled) =>
    ipcRenderer.send("set-moves-window", enabled),

  openEnginesManager: () =>
    ipcRenderer.send("open-engines-manager"),

  openNewGame: () =>
    ipcRenderer.send("open-new-game"),

  showConsole: () =>
    ipcRenderer.send("show-console"),

  // Sound settings window
  openSoundsManager: () =>
    ipcRenderer.send("open-sounds-manager"),

  // Threats & analysis board
  openThreatsWindow: () =>
    ipcRenderer.send("open-threats-window"),

  openAnalysisBoard: () =>
    ipcRenderer.send("open-analysis-board"),

  // ---------- New Game flow ----------

  newGameSelected: (payload) =>
    ipcRenderer.send("new-game-selected", payload),

  onNewGameStart: (callback) =>
    ipcRenderer.on("new-game-start", (_event, payload) => {
      callback(payload);
    }),

  // ---------- Game state / report / threats ----------

  gamePositionUpdated: (payload) =>
    ipcRenderer.send("game-position-updated", payload),

  requestLastGame: () =>
    ipcRenderer.send("request-last-game"),

  onLastGame: (callback) =>
    ipcRenderer.on("last-game-data", (_event, data) => {
      callback(data);
    }),

  startReviewMode: (gameData) =>
    ipcRenderer.send("start-review-mode", gameData),

  onReviewGame: (callback) =>
    ipcRenderer.on("review-game", (_event, data) => {
      callback(data);
    }),

  // ---------- Review mode window sizing ----------

  enterReviewMode: () =>
    ipcRenderer.send("enter-review-mode"),

  exitReviewMode: () =>
    ipcRenderer.send("exit-review-mode"),

  // ---------- Evaluation bar ----------

  onEvalScore: (callback) =>
    ipcRenderer.on("eval-score", (_event, score) => {
      callback(score);
    }),

  // ---------- Engine manager ----------

  browseEngineFile: () =>
    ipcRenderer.invoke("engines-browse"),

  browseImageFile: () =>
    ipcRenderer.invoke("dialog-browse-image"),

  enginesGetAll: () =>
    ipcRenderer.invoke("engines-get-all"),

  enginesSave: (engine) =>
    ipcRenderer.invoke("engines-save", engine),

  enginesDelete: (id) =>
    ipcRenderer.invoke("engines-delete", id),

  enginesGetBasic: () =>
    ipcRenderer.invoke("engines-get-basic"),

  // ---------- Engine play (moves) ----------

  requestEngineMove: (info) =>
    ipcRenderer.send("request-engine-move", info),

  onEngineMove: (callback) =>
    ipcRenderer.on("engine-move", (_event, move) => {
      callback(move);
    }),

  // ---------- Review Analysis (MultiPV) ----------
  
  requestAnalysis: (fen) => 
    ipcRenderer.send("request-analysis", fen),
  
  onAnalysisResult: (callback) =>
    ipcRenderer.on("analysis-result", (_event, results) => {
      callback(results);
    }),

  // ---------- DEEP THREAT SCAN ----------
  startThreatScan: (moves) =>
    ipcRenderer.send("start-threat-scan", moves),
    
  onThreatFound: (callback) =>
    ipcRenderer.on("threat-found", (_event, threat) => callback(threat)),
    
  onScanComplete: (callback) =>
    ipcRenderer.on("scan-complete", (_event) => callback()),

  // ---------- Moves window live feed ----------

  onMovesUpdate: (callback) =>
    ipcRenderer.on("moves-update", (_event, moves) => {
      callback(moves);
    }),

  // ---------- Timer window ----------

  onTimerGameStart: (callback) =>
    ipcRenderer.on("timer-game-start", (_event, info) => {
      callback(info);
    }),

  onTurnChanged: (callback) =>
    ipcRenderer.on("turn-changed", (_event, color) => {
      callback(color);
    }),

  onTimerStop: (callback) =>
    ipcRenderer.on("timer-stop", () => callback()),

  // from renderer -> main (then to timer)
  turnChanged: (color) =>
    ipcRenderer.send("turn-changed", color),

  stopMatch: () =>
    ipcRenderer.send("stop-match"),

  // ---------- Sound configuration ----------

  soundsGetAll: () =>
    ipcRenderer.invoke("sounds-get-all"),

  soundsSaveAll: (data) =>
    ipcRenderer.invoke("sounds-save-all", data),

  browseSoundFile: () =>
    ipcRenderer.invoke("sounds-browse"),

  // ---------- Database Config ----------
  
  databaseBrowse: () => ipcRenderer.invoke("database-browse"),
  databaseGet: () => ipcRenderer.invoke("database-get"),
  databaseSave: (data) => ipcRenderer.invoke("database-save", data),

  // ---------- Preferences (Theme) ----------
  
  getPreferences: () => ipcRenderer.invoke("get-preferences"),
  savePreferences: (data) => ipcRenderer.invoke("save-preferences", data),
  onThemeChanged: (callback) => ipcRenderer.on("theme-changed", (_event, theme) => callback(theme))
});
