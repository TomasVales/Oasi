// Ejecuta electron-vite sin ELECTRON_RUN_AS_NODE: las terminales de VS Code/Cursor
// exportan esa variable y hacen que Electron arranque como Node puro (require('electron') === undefined).
import { spawn } from 'node:child_process'

delete process.env.ELECTRON_RUN_AS_NODE
const child = spawn('electron-vite', process.argv.slice(2), { stdio: 'inherit', shell: true })
child.on('exit', (code) => process.exit(code ?? 0))
