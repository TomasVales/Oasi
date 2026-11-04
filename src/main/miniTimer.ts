import { BrowserWindow, screen } from 'electron'
import { PushChannel, type MiniState, type TrayState } from '@shared/ipc'
import type { ThemeName } from '@shared/settings'

const WIDTH = 248
const HEIGHT = 72
const MARGIN = 16

/**
 * Ventanita flotante con el contador. Aparece cuando hay sesión y Oasi no es la app activa
 * (estás en el navegador, en otra app o con la ventana minimizada) y se esconde al volver.
 * Siempre encima, en todos los escritorios, sin robar el foco.
 */
export class MiniTimer {
  private win: BrowserWindow | null = null
  private state: TrayState | null = null
  /** La cerró con la ✕: no vuelve hasta la próxima sesión. */
  private dismissed = false
  private position: { x: number; y: number } | null = null

  constructor(
    private readonly opts: {
      mainWindow: () => BrowserWindow | null
      load: (win: BrowserWindow) => void
      preload: string
      theme: () => ThemeName
      enabled: () => boolean
      themeArg: (t: ThemeName) => string
    }
  ) {}

  /** Conecta la visibilidad a la ventana principal (llamar cada vez que se crea una). */
  attach(main: BrowserWindow) {
    const sync = () => this.sync()
    for (const ev of ['focus', 'blur', 'minimize', 'restore', 'hide', 'show'] as const) main.on(ev as 'focus', sync)
    // Sin ventana principal no hay ventanita (y en Windows/Linux no frena el cierre de la app).
    main.on('closed', () => this.destroy())
  }

  update(state: TrayState | null) {
    if (!state) this.dismissed = false
    this.state = state
    this.sync()
  }

  dismiss() {
    this.dismissed = true
    this.hide()
  }

  /** Reaplica tema y visibilidad (p. ej. tras cambiar un ajuste). */
  refresh() {
    this.push()
    this.sync()
  }

  private shouldShow(): boolean {
    if (!this.state || this.dismissed || !this.opts.enabled()) return false
    const main = this.opts.mainWindow()
    if (!main || main.isDestroyed()) return false
    return !main.isFocused() || main.isMinimized() || !main.isVisible()
  }

  private sync() {
    if (!this.shouldShow()) return this.hide()
    const win = this.ensure()
    this.push()
    if (!win.isVisible()) win.showInactive()
  }

  private push() {
    if (!this.win || this.win.isDestroyed() || !this.state) return
    const payload: MiniState = { ...this.state, theme: this.opts.theme() }
    this.win.webContents.send(PushChannel.MiniState, payload)
  }

  private hide() {
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) this.win.hide()
  }

  private ensure(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win
    const main = this.opts.mainWindow()
    const display = main ? screen.getDisplayMatching(main.getBounds()) : screen.getPrimaryDisplay()
    const area = display.workArea
    const pos = this.position ?? { x: area.x + area.width - WIDTH - MARGIN, y: area.y + MARGIN }
    const win = new BrowserWindow({
      ...pos,
      width: WIDTH,
      height: HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      alwaysOnTop: true,
      hasShadow: true,
      backgroundColor: '#00000000',
      webPreferences: {
        additionalArguments: [this.opts.themeArg(this.opts.theme())],
        preload: this.opts.preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    win.setAlwaysOnTop(true, 'floating')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    win.on('moved', () => {
      const [x, y] = win.getPosition()
      this.position = { x: x!, y: y! }
    })
    win.on('closed', () => {
      if (this.win === win) this.win = null
    })
    // Al cargar recibe el estado actual (los mensajes previos a la carga se pierden).
    win.webContents.on('did-finish-load', () => this.push())
    this.opts.load(win)
    this.win = win
    return win
  }

  /** La ventanita no es "la ventana principal" para nadie más. */
  isMini(win: BrowserWindow) {
    return win === this.win
  }

  destroy() {
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
    this.win = null
  }
}
