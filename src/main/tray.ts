import { BrowserWindow, Menu, Tray, nativeImage, type NativeImage } from 'electron'
import { PushChannel, type TrayCommand, type TrayState } from '@shared/ipc'

/**
 * Contador en la barra de menú (macOS) / bandeja del sistema (Windows, Linux).
 * Solo existe mientras hay una sesión: el renderer manda el estado cada segundo y
 * el menú devuelve comandos (pausar, saltar, terminar, vista de foco).
 */
export class TimerTray {
  private tray: Tray | null = null
  private menuKey = ''

  constructor(private readonly icon: () => NativeImage) {}

  update(state: TrayState | null) {
    if (!state) return this.destroy()
    if (!this.tray) {
      // macOS muestra el título como texto en la barra: el ícono queda vacío para no ocupar lugar.
      const img = process.platform === 'darwin' ? nativeImage.createEmpty() : this.icon().resize({ width: 16, height: 16 })
      this.tray = new Tray(img)
      this.tray.on('click', () => process.platform !== 'darwin' && this.showWindow())
    }
    const icon = state.phase === 'break' ? '☕' : state.phase === 'done' ? '✓' : state.running ? '🍅' : '⏸'
    const text = `${icon} ${state.remaining}`
    if (process.platform === 'darwin') this.tray.setTitle(text, { fontType: 'monospacedDigit' })
    this.tray.setToolTip(`${state.label} · ${state.subject} · ${state.remaining}`)

    // El menú solo se rearma cuando cambia algo que lo afecta (no cada segundo).
    const key = `${state.running}|${state.phase}|${state.subject}|${state.label}`
    if (key !== this.menuKey) {
      this.menuKey = key
      this.tray.setContextMenu(this.buildMenu(state))
    }
  }

  private buildMenu(s: TrayState): Menu {
    const done = s.phase === 'done'
    return Menu.buildFromTemplate([
      { label: `${s.label} · ${s.subject}`, enabled: false },
      { type: 'separator' },
      ...(!done
        ? [
            { label: s.running ? 'Pausar' : 'Reanudar', accelerator: 'CommandOrControl+Shift+P', click: () => this.send('toggle') },
            { label: s.phase === 'break' ? 'Saltar descanso' : 'Pasar al descanso', click: () => this.send('skip') },
            { label: 'Sumar 5 minutos', click: () => this.send('plus5') }
          ]
        : []),
      { label: 'Vista de foco', click: () => (this.showWindow(), this.send('focus')) },
      { label: 'Abrir Oasi', click: () => this.showWindow() },
      { type: 'separator' },
      { label: 'Terminar sesión', click: () => (this.showWindow(), this.send('stop')) }
    ] as Electron.MenuItemConstructorOptions[])
  }

  private send(cmd: TrayCommand) {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send(PushChannel.TrayCommand, cmd)
  }

  private showWindow() {
    const w = BrowserWindow.getAllWindows()[0]
    if (!w) return
    if (w.isMinimized()) w.restore()
    w.show()
    w.focus()
  }

  destroy() {
    this.tray?.destroy()
    this.tray = null
    this.menuKey = ''
  }
}
