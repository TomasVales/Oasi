import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/space-grotesk'
import App from './App'
import { MiniTimer } from './features/mini/MiniTimer'
import './styles/globals.css'
import './styles/workspace.css'
import './styles/shell.css'
import './styles/background.css'

// La ventanita flotante del contador carga esta misma interfaz con #/mini: solo eso, sin la app.
const isMini = window.location.hash === '#/mini'

createRoot(document.getElementById('root')!).render(<StrictMode>{isMini ? <MiniTimer /> : <App />}</StrictMode>)
