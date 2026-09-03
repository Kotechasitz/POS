import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { count } from 'drizzle-orm'
import icon from '../../resources/icon.png?asset'
import { createDbClient, type DbClient } from './database/client'
import { getDbPath } from './database/db-path'
import { products } from './database/schema'
import { registerProductHandlers } from './ipc/register-product-handlers'
import { registerSaleHandlers } from './ipc/register-sale-handlers'
import { registerDashboardHandlers } from './ipc/register-dashboard-handlers'
import { registerSalesHistoryHandlers } from './ipc/register-sales-history-handlers'

let dbClient: DbClient

export function getDb(): DbClient {
  if (!dbClient) {
    throw new Error('Database not initialized yet')
  }
  return dbClient
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  try {
    dbClient = createDbClient(getDbPath(), join(__dirname, '../../drizzle'))
  } catch (err) {
    dialog.showErrorBox(
      'Database Error',
      `Failed to open the local database:\n${err instanceof Error ? err.message : String(err)}`
    )
    app.quit()
    return
  }

  ipcMain.handle('db:health', () => {
    const [{ value }] = dbClient.db.select({ value: count() }).from(products).all()
    return { productCount: value }
  })

  registerProductHandlers(dbClient.db)
  registerSaleHandlers(dbClient.db)
  registerDashboardHandlers(dbClient.db)
  registerSalesHistoryHandlers(dbClient.db)

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  dbClient?.sqlite.close()
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
