import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  showNotification: (title: string, body: string) => {
    ipcRenderer.send("show-notification", { title, body });
  },
  onUpdateStatus: (callback: (status: string) => void) => {
    ipcRenderer.on("update-status", (_event, status) => callback(status));
  },
});
