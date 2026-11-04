import { app, BrowserWindow, ipcMain, nativeImage, powerMonitor, safeStorage, shell } from 'electron'
import { Client } from 'discord-rpc'
import { APP_NAME } from '@shared/brand'
import { isIconVariant, type IconVariant } from '@shared/pixelIcon'
import { join } from 'node:path'
import { IpcChannel, PushChannel, type AppInfo } from '@shared/ipc'
import { IdleMonitor } from './idle'
import type { ThemeName } from '@shared/settings'
import { THEME_ARG_PREFIX, THEME_META, isTheme } from '@shared/theme'
import { openDatabase, type DbHandle } from './db/client'
import { createRepositories, type Repositories } from './db/repositories'
import { broadcastDataChanged, registerDataHandlers } from './ipc'
import { AiService } from './ai/service'
import { GoogleService } from './google/service'
import { GOOGLE_ENDPOINTS, type GoogleEndpoints } from './google/oauth'
import { SecretStore } from './secrets'
import { BackgroundStore } from './backgrounds'
import { Library } from './library'

const isDev = !app.isPackaged

// Datos de desarrollo separados de los reales. Debe hacerse antes de que algo lea userData.
// Nombre visible: Oasi. La carpeta de datos conserva su nombre original ("Student OS")
// para no perder la información de quienes ya usaban la app.
app.setName(APP_NAME)
// STUDENT_OS_USER_DATA permite aislar los datos (tests end-to-end, perfiles de prueba).
app.setPath(
  'userData',
  process.env['STUDENT_OS_USER_DATA'] ?? join(app.getPath('appData'), isDev ? 'Student OS (dev)' : 'Student OS')
)

/** PNG de la variante de ícono (en dev desde el repo; empaquetado, desde extraResources). */
function iconPath(variant: IconVariant): string {
  return isDev ? join(app.getAppPath(), 'resources', 'icons', `${variant}.png`) : join(process.resourcesPath, 'icons', `${variant}.png`)
}

function currentIcon(): IconVariant {
  const v = repos?.settings.get('appIcon')
  return isIconVariant(v) ? v : 'clasico'
}

/** Ícono del Dock (macOS) y de las ventanas (Windows/Linux) mientras la app está abierta. */
function applyAppIcon(variant: IconVariant) {
  const img = nativeImage.createFromPath(iconPath(variant))
  if (img.isEmpty()) return
  if (process.platform === 'darwin') app.dock?.setIcon(img)
  for (const w of BrowserWindow.getAllWindows()) w.setIcon(img)
}

let dbHandle: DbHandle | null = null
let repos: Repositories

function initDatabase(): { dbPath: string } {
  const dbPath = join(app.getPath('userData'), 'student-os.db')
  // En dev las migraciones se leen del repo; empaquetadas viajan como extraResources.
  const migrationsFolder = isDev ? join(app.getAppPath(), 'drizzle') : join(process.resourcesPath, 'drizzle')
  dbHandle = openDatabase(dbPath, migrationsFolder)
  repos = createRepositories(dbHandle.db)
  const recovered = repos.sessions.closeDangling()
  if (recovered) console.info(`[sessions] ${recovered} sesión(es) recuperada(s) tras un cierre inesperado`)
  const library = new Library(join(app.getPath('userData'), 'library'), repos)
  const secrets = new SecretStore(join(app.getPath('userData'), 'secrets.json'), {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (s) => safeStorage.encryptString(s),
    decrypt: (b) => safeStorage.decryptString(b)
  })
  const ai = new AiService(() => repos.settings.get('ai'), secrets)
  // STUDENT_OS_GOOGLE_ENDPOINTS (JSON) redirige a un servidor de Google simulado en las pruebas end-to-end.
  const endpoints: GoogleEndpoints = { ...GOOGLE_ENDPOINTS, ...JSON.parse(process.env['STUDENT_OS_GOOGLE_ENDPOINTS'] ?? '{}') }
  const google = new GoogleService(repos, secrets, (url) => shell.openExternal(url), fetch, endpoints)
  // Sincroniza al arrancar y cada 30 minutos (si está conectado).
  if (google.status().connected) {
    google.startAutoSync()
    void google.sync().then(() => broadcastDataChanged('events')).catch(() => {})
  }
  // Modo ausente: inactividad del sistema o pantalla bloqueada → avisar a las ventanas.
  new IdleMonitor(powerMonitor, () => repos.settings.get('idle'), (e) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send(PushChannel.Away, e)
  }).start()

  const backgrounds = new BackgroundStore(join(app.getPath('userData'), 'backgrounds'))
  registerDataHandlers({ repos, library, ai, google, secrets, backgrounds }, {
    onSettingChanged: (key, value) => {
      // El fondo nativo de la ventana acompaña al tema (se ve al redimensionar o al recargar).
      if (key === 'theme' && isTheme(value)) {
        for (const w of BrowserWindow.getAllWindows()) w.setBackgroundColor(THEME_META[value].windowBackground)
      }
      if (key === 'appIcon' && isIconVariant(value)) applyAppIcon(value)
    }
  })
  return { dbPath }
}

function createMainWindow(): BrowserWindow {
  const theme: ThemeName = repos.settings.get('theme')
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: APP_NAME,
    icon: iconPath(currentIcon()),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: THEME_META[theme].windowBackground,
    webPreferences: {
      additionalArguments: [`${THEME_ARG_PREFIX}${theme}`],
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())

  // Los enlaces externos se abren en el navegador del sistema, nunca dentro de la app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  const { dbPath } = initDatabase()

  ipcMain.handle(IpcChannel.AppInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    userDataPath: app.getPath('userData'),
    dbPath
  }))

  createMainWindow()
  applyAppIcon(currentIcon())

  const clientId = '1567335462433984572'
  const rpc = new Client({ transport: 'ipc' })

  rpc.on('ready', () => {
    rpc.setActivity({
      details: 'Organizando el cuatrimestre',
      state: 'En el planificador',
      startTimestamp: new Date(),
      largeImageKey: 'logo',
      largeImageText: 'Oasi',
      instance: false,
    })
  })

  rpc.login({ clientId }).catch(console.error)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  dbHandle?.close()
  dbHandle = null
})