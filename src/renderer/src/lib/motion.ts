import type { Transition, Variants } from 'framer-motion'

/**
 * Lenguaje de movimiento de la app (estilo macOS): desaceleración larga y suave,
 * resortes críticamente amortiguados (sin rebote visible) y duraciones cortas.
 */
export const EASE_OUT_MAC = [0.32, 0.72, 0, 1] as const
export const EASE_IN_MAC = [0.4, 0, 1, 1] as const

export const spring = {
  /** Paneles y diálogos: firme, sin rebote. */
  sheet: { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 } satisfies Transition,
  /** Elementos pequeños (menús, popovers): más rápido. */
  snappy: { type: 'spring', stiffness: 560, damping: 40, mass: 0.7 } satisfies Transition,
  /** Reordenamientos de layout. */
  layout: { type: 'spring', stiffness: 380, damping: 36 } satisfies Transition
}

export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2, ease: EASE_OUT_MAC } },
  exit: { opacity: 0, transition: { duration: 0.15, ease: EASE_IN_MAC } }
}

/** Diálogo modal: aparece desde levemente más chico, como las hojas de macOS. */
export const dialog: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: spring.sheet },
  exit: { opacity: 0, scale: 0.97, y: 4, transition: { duration: 0.14, ease: EASE_IN_MAC } }
}

/** Menús contextuales y popovers: crecen desde el punto de origen. */
export const popover: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  visible: { opacity: 1, scale: 1, transition: spring.snappy },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.1, ease: EASE_IN_MAC } }
}

/** Panel lateral que entra desde la derecha. */
export const sidePanel: Variants = {
  hidden: { opacity: 0, x: 28 },
  visible: { opacity: 1, x: 0, transition: spring.sheet },
  exit: { opacity: 0, x: 20, transition: { duration: 0.16, ease: EASE_IN_MAC } }
}

/** Cambio de pantalla: fundido con un desplazamiento mínimo. */
export const page: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE_OUT_MAC } }
}

/** Avisos (toasts): suben desde abajo. */
export const toast: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: spring.sheet },
  exit: { opacity: 0, y: 8, transition: { duration: 0.14, ease: EASE_IN_MAC } }
}
