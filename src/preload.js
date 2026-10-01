const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("airPointer", {
  getDisplaySize: () => ipcRenderer.invoke("display-size"),
  setTracking: (enabled) => ipcRenderer.send("tracking-state", enabled),
  mouse: (command) => ipcRenderer.send("mouse-command", command),
  onEmergencyStop: (callback) => ipcRenderer.on("emergency-stop", callback)
});
