import { autoUpdater } from "electron-updater";
import { BrowserWindow } from "electron";

export function setupAutoUpdater(win: BrowserWindow) {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", () => {
    win.webContents.send("update-status", "downloading");
  });

  autoUpdater.on("update-downloaded", () => {
    win.webContents.send("update-status", "ready");
  });

  autoUpdater.on("error", (err) => {
    console.error("Auto-updater error:", err.message);
  });

  autoUpdater.checkForUpdatesAndNotify();
}
