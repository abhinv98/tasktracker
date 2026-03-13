import { app, BrowserWindow, ipcMain, Notification, Menu } from "electron";
import path from "node:path";
import { setupTray } from "./tray";
import { setupAutoUpdater } from "./updater";

const APP_URL = process.env.ELECTRON_APP_URL || "https://tasktracker-gilt-tau.vercel.app";

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

function createWindow() {
  const isDev = !app.isPackaged;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    titleBarStyle: "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    backgroundColor: "#faf9f5",
    show: false,
  });

  const url = isDev ? "http://localhost:3000" : APP_URL;
  mainWindow.loadURL(url);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("close", (e) => {
    if (process.platform === "darwin" && !isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

}

function createAppMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on("before-quit", () => {
  isQuitting = true;
});

app.whenReady().then(() => {
  createAppMenu();
  createWindow();

  if (mainWindow) {
    setupTray(mainWindow);

    if (app.isPackaged) {
      setupAutoUpdater(mainWindow);
    }
  }

  app.on("activate", () => {
    if (mainWindow) {
      mainWindow.show();
    } else {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.on("show-notification", (_event, { title, body }: { title: string; body: string }) => {
  showNativeNotification(title, body);
});

function showNativeNotification(title: string, body: string) {
  if (Notification.isSupported()) {
    const notification = new Notification({ title, body });
    notification.on("click", () => {
      mainWindow?.show();
      mainWindow?.focus();
    });
    notification.show();
  }
}

