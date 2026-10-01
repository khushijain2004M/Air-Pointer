const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require("electron");
const { spawn } = require("child_process");
const path = require("path");

let window;
let mouseBridge;
let trackingEnabled = false;

function startMouseBridge() {
  const script = path.join(__dirname, "mouse-bridge.ps1");
  mouseBridge = spawn(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
    { stdio: ["pipe", "ignore", "pipe"], windowsHide: true }
  );

  mouseBridge.stderr.on("data", (data) => {
    console.error(`Mouse bridge: ${data}`);
  });
}

function sendMouse(command) {
  if (!mouseBridge || mouseBridge.killed || !mouseBridge.stdin.writable) return;
  mouseBridge.stdin.write(`${JSON.stringify(command)}\n`);
}

function createWindow() {
  window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 940,
    minHeight: 640,
    backgroundColor: "#050611",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#070814",
      symbolColor: "#c9f8ff",
      height: 42
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.webContents.on("console-message", (details) => {
    if (details.level >= 2) console.error(`Renderer: ${details.message}`);
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    console.error(`Renderer exited: ${details.reason}`);
  });
  window.webContents.on("did-fail-load", (_event, code, description) => {
    console.error(`Page failed to load (${code}): ${description}`);
  });
  window.webContents.on("did-finish-load", async () => {
    if (process.env.AIR_POINTER_DIAGNOSTICS === "1") {
      setTimeout(async () => {
        const image = await window.webContents.capturePage();
        require("fs").writeFileSync(path.join(app.getPath("temp"), "air-pointer-startup.png"), image.toPNG());
        console.log(`Diagnostic screenshot: ${path.join(app.getPath("temp"), "air-pointer-startup.png")}`);
      }, 3000);
    }
  });

  window.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(() => {
  startMouseBridge();
  createWindow();

  globalShortcut.register("CommandOrControl+Shift+Q", () => {
    trackingEnabled = false;
    sendMouse({ type: "release" });
    window?.webContents.send("emergency-stop");
  });
});

ipcMain.handle("display-size", () => {
  const display = screen.getPrimaryDisplay();
  return display.size;
});

ipcMain.on("tracking-state", (_event, enabled) => {
  trackingEnabled = Boolean(enabled);
  if (!trackingEnabled) sendMouse({ type: "release" });
});

ipcMain.on("mouse-command", (_event, command) => {
  if (trackingEnabled) sendMouse(command);
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  sendMouse({ type: "release" });
  mouseBridge?.stdin.end();
  mouseBridge?.kill();
});

app.on("window-all-closed", () => app.quit());
