import { Tray, Menu, BrowserWindow, app, nativeImage } from "electron";
import path from "node:path";

let tray: Tray | null = null;

export function setupTray(win: BrowserWindow) {
  const iconPath = path.join(__dirname, "../assets/icon.png");
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });

  tray = new Tray(icon);
  tray.setToolTip("The Ecultify");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show",
      click: () => {
        win.show();
        win.focus();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.exit(0);
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    win.show();
    win.focus();
  });
}
