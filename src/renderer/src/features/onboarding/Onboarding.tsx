import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { BookOpen, CalendarClock, Check, Gauge, Palette, Plus, Sparkles, User, X, type LucideIcon } from 'lucide-react'
import { APP_NAME } from '@shared/brand'
import { ICON_VARIANT_LABEL, ICON_VARIANTS, type IconVariant } from '@shared/pixelIcon'
import { DEFAULT_SETTINGS, THEMES, type AppSettings, type SoundscapeId, type ThemeName } from '@shared/settings'
import { THEME_META } from '@shared/theme'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { ipcErrorMessage } from '@/lib/ipcError'
import { EASE_OUT_MAC, spring } from '@/lib/motion'
import { queryKeys } from '@/lib/queryClient'
import { useSettings } from '@/hooks/useAppData'
import { useSubjects } from '@/hooks/useSubjects'
import { Button } from '@/components/ui/Button'
import { PixelIcon } from '@/components/ui/PixelIcon'
import { SOUND_META } from '@/features/sound/SoundPlayer'
import { useSoundscape } from '@/features/sound/SoundscapeProvider'
import { useTheme } from '@/theme/ThemeProvider'

interface DraftSubject {
  key: string
  name: string
  difficulty: number
}

const DIFFICULTY = ['', 'Liviana', 'Tranqui', 'Media', 'Exigente', 'Muy exigente']
const FOCUS_OPTIONS = [25, 40, 50, 60]
const STREAK_OPTIONS = [10, 15, 30, 45]

/**
 * Bienvenida de primer uso, al estilo del Asistente de configuración de macOS:
 * un paso por pantalla, transiciones laterales, puntos de progreso y Atrás/Continuar.
 * Todo lo que se elige se guarda al final (salvo tema e ícono, que se previsualizan en vivo).
 */
export function Onboarding() {
  const qc = useQueryClient()
  const { data: settings } = useSettings()
  const { theme, setTheme } = useTheme()
  const { data: existing = [] } = useSubjects()
  const sound = useSoundscape()

  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [name, setName] = useState(settings?.profile.name ?? '')
  const [icon, setIcon] = useState<IconVariant>(settings?.appIcon ?? 'clasico')
  const [subjects, setSubjects] = useState<DraftSubject[]>([])
  const [exam, setExam] = useState({ subject: '', kind: 'exam' as 'exam' | 'assignment', date: '', title: '' })
  const [focus, setFocus] = useState(settings?.pomodoro.focusMinutes ?? 50)
  const [streak, setStreak] = useState(settings?.streakMinMinutes ?? 15)
  const [soundId, setSoundId] = useState<SoundscapeId>(settings?.soundscape.sound ?? 'rain')
  const [autoplay, setAutoplay] = useState(settings?.soundscape.autoplay ?? true)
  const [away, setAway] = useState(settings?.idle.enabled ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const firstName = name.trim().split(/\s+/)[0] ?? ''
  const allSubjects = useMemo(
    () => [...existing.map((s) => ({ value: s.id, label: s.name })), ...subjects.map((s) => ({ value: `new:${s.key}`, label: s.name }))],
    [existing, subjects]
  )

  const saveIcon = (v: IconVariant) => {
    setIcon(v)
    qc.setQueryData<AppSettings>(queryKeys.settings, (s) => (s ? { ...s, appIcon: v } : s))
    void api.settings.set('appIcon', v)
  }

  const finish = async () => {
    setSaving(true)
    setError(null)
    try {
      const s = settings ?? DEFAULT_SETTINGS
      await api.settings.set('profile', { name: name.trim() })
      // Materias nuevas (el color se asigna solo, en orden fijo de la paleta)
      const created = new Map<string, string>()
      for (const d of subjects) created.set(d.key, (await api.subjects.create({ name: d.name, difficulty: d.difficulty })).id)
      // Primer hito
      if (exam.subject && exam.date) {
        const subjectId = exam.subject.startsWith('new:') ? created.get(exam.subject.slice(4)) : exam.subject
        const label = allSubjects.find((x) => x.value === exam.subject)?.label ?? ''
        await api.events.create({
          subjectId: subjectId ?? null,
          kind: exam.kind,
          title: exam.title.trim() || `${exam.kind === 'exam' ? 'Parcial' : 'Entrega'} · ${label}`,
          startsAt: new Date(`${exam.date}T09:00`),
          weight: exam.kind === 'exam' ? 5 : 3
        })
      }
      await api.settings.set('pomodoro', { ...s.pomodoro, focusMinutes: focus })
      await api.settings.set('streakMinMinutes', streak)
      await api.settings.set('soundscape', { ...s.soundscape, sound: soundId, autoplay })
      await api.settings.set('idle', { ...s.idle, enabled: away })
      await api.settings.set('onboarding', { completedAt: Date.now() })
      sound.stop()
      await qc.invalidateQueries()
    } catch (err) {
      setError(ipcErrorMessage(err))
      setSaving(false)
    }
  }

  const steps: { id: string; icon?: LucideIcon; title: string; subtitle?: string; canContinue?: boolean; optional?: boolean; body: ReactNode }[] = [
    {
      id: 'welcome',
      title: `Te damos la bienvenida a ${APP_NAME}`,
      subtitle: 'Tu espacio de estudio: organiza tus fechas, tus apuntes y tu ritmo. Te toma un minuto dejarlo a tu medida.',
      body: (
        <ul className="mx-auto grid max-w-md gap-3 text-left text-sm">
          {[
            [CalendarClock, 'Un plan diario según tus parciales y tu energía'],
            [BookOpen, 'PDF y apuntes lado a lado, con enlaces a la página exacta'],
            [Sparkles, 'Rachas, sonidos ambiente y un asistente que te destraba']
          ].map(([I, t], i) => {
            const Icon = I as LucideIcon
            return (
              <motion.li
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0, transition: { delay: 0.5 + i * 0.12, duration: 0.5, ease: EASE_OUT_MAC } }}
                className="flex items-center gap-3 rounded-[12px] bg-surface/70 px-4 py-3 backdrop-blur"
              >
                <Icon size={18} className="shrink-0 text-accent" />
                {t as string}
              </motion.li>
            )
          })}
        </ul>
      )
    },
    {
      id: 'name',
      icon: User,
      title: '¿Cómo te llamás?',
      subtitle: 'Lo usamos para saludarte. Queda guardado solo en tu computadora.',
      canContinue: name.trim().length > 0,
      body: (
        <input
          autoFocus
          aria-label="Tu nombre"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tu nombre"
          className="mx-auto block h-14 w-full max-w-sm rounded-[14px] border border-line bg-surface px-5 text-center text-xl font-medium shadow-card focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15"
        />
      )
    },
    {
      id: 'appearance',
      icon: Palette,
      title: 'Elegí tu apariencia',
      subtitle: 'Podés cambiarla cuando quieras con ⌘⇧T.',
      body: (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Tema">
            {THEMES.map((t: ThemeName) => (
              <button
                key={t}
                role="radio"
                aria-checked={theme === t}
                onClick={() => setTheme(t)}
                className="group flex flex-col items-center gap-2 text-sm"
              >
                <span
                  data-theme={t}
                  className={cn(
                    'flex aspect-[4/3] w-full overflow-hidden rounded-[12px] border-2 bg-canvas transition-shadow',
                    theme === t ? 'border-accent shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_20%,transparent)]' : 'border-line'
                  )}
                >
                  <span className="w-1/4 bg-sidebar" />
                  <span className="flex flex-1 flex-col gap-1.5 p-2">
                    <span className="h-1.5 w-2/3 rounded-full bg-fg/70" />
                    <span className="h-1.5 w-1/2 rounded-full bg-fg-subtle" />
                    <span className="mt-auto grid grid-cols-5 gap-0.5">
                      {['bg-heat-1', 'bg-heat-3', 'bg-heat-2', 'bg-heat-4', 'bg-heat-0'].map((c) => (
                        <span key={c} className={cn('aspect-square rounded-[2px]', c)} />
                      ))}
                    </span>
                  </span>
                </span>
                <span className={cn(theme === t ? 'font-semibold text-fg' : 'text-fg-muted')}>{THEME_META[t].label}</span>
              </button>
            ))}
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-fg-muted">Ícono de la app</p>
            <div className="flex justify-center gap-4" role="radiogroup" aria-label="Ícono de la app">
              {ICON_VARIANTS.map((v) => (
                <button key={v} role="radio" aria-checked={icon === v} onClick={() => saveIcon(v)} className="flex flex-col items-center gap-1.5 text-xs">
                  <span className={cn('rounded-[18px] p-1 transition-shadow', icon === v && 'ring-2 ring-accent')}>
                    <PixelIcon variant={v} size={52} />
                  </span>
                  <span className={icon === v ? 'font-semibold' : 'text-fg-muted'}>{ICON_VARIANT_LABEL[v]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'subjects',
      icon: BookOpen,
      title: '¿Qué estás cursando?',
      subtitle: 'Sumá tus materias. La dificultad ayuda a ubicar las exigentes cuando tenés más energía.',
      optional: true,
      body: <SubjectsStep existing={existing.map((s) => s.name)} subjects={subjects} setSubjects={setSubjects} />
    },
    {
      id: 'exam',
      icon: CalendarClock,
      title: '¿Cuándo es tu próximo parcial?',
      subtitle: 'Con una fecha ya podemos armarte un plan y una cuenta regresiva. Las demás las cargás en Calendario.',
      optional: true,
      body: allSubjects.length ? (
        <div className="mx-auto grid max-w-md gap-3 text-left">
          <div className="grid grid-cols-2 gap-1 rounded-[10px] bg-surface-2 p-1" role="radiogroup" aria-label="Tipo">
            {(['exam', 'assignment'] as const).map((k) => (
              <button
                key={k}
                role="radio"
                aria-checked={exam.kind === k}
                onClick={() => setExam({ ...exam, kind: k })}
                className={cn('h-8 rounded-[8px] text-sm font-medium', exam.kind === k ? 'bg-surface shadow-card' : 'text-fg-muted')}
              >
                {k === 'exam' ? 'Parcial' : 'Entrega'}
              </button>
            ))}
          </div>
          <select
            aria-label="Materia"
            value={exam.subject}
            onChange={(e) => setExam({ ...exam, subject: e.target.value })}
            className="h-11 rounded-[10px] border border-line bg-surface px-3 text-sm focus:border-accent focus:outline-none"
          >
            <option value="">Elegí la materia…</option>
            {allSubjects.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            aria-label="Fecha"
            value={exam.date}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setExam({ ...exam, date: e.target.value })}
            className="h-11 rounded-[10px] border border-line bg-surface px-3 text-sm focus:border-accent focus:outline-none"
          />
        </div>
      ) : (
        <p className="text-sm text-fg-muted">Primero agregá una materia en el paso anterior, o seguí y cargalo después.</p>
      )
    },
    {
      id: 'rhythm',
      icon: Gauge,
      title: 'Tu ritmo de estudio',
      subtitle: 'Valores para empezar: el plan y el cronómetro se adaptan a tu energía de cada día.',
      body: (
        <div className="mx-auto max-w-md space-y-5 text-left">
          <Choice label="Bloques de foco" options={FOCUS_OPTIONS} value={focus} onChange={setFocus} format={(m) => `${m} min`} />
          <Choice label="Meta diaria para la racha" options={STREAK_OPTIONS} value={streak} onChange={setStreak} format={(m) => `${m} min`} />
          <div>
            <p className="mb-1.5 text-xs font-medium text-fg-muted">Sonido ambiente al estudiar</p>
            <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Sonido ambiente">
              {(Object.keys(SOUND_META) as SoundscapeId[]).map((id) => {
                const M = SOUND_META[id]
                const active = soundId === id
                return (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={active}
                    title={`${M.label}: tocá de nuevo para escuchar`}
                    onClick={() => {
                      if (active) {
                        sound.playing === id ? sound.stop() : sound.play(id)
                      } else {
                        setSoundId(id)
                        if (sound.playing) sound.play(id)
                      }
                    }}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-[10px] border py-2 text-[11px]',
                      active ? 'border-accent bg-accent-soft font-medium' : 'border-line text-fg-muted hover:bg-hover'
                    )}
                  >
                    <M.icon size={16} className={cn(sound.playing === id && 'text-success')} />
                    {M.label.replace('Ruido ', '')}
                  </button>
                )
              })}
            </div>
            <p className="mt-1 text-[11px] text-fg-subtle">Tocá el seleccionado para escucharlo.</p>
          </div>
          <Switch label="Reproducir el sonido al empezar el foco" checked={autoplay} onChange={setAutoplay} />
          <Switch label="Pausar el cronómetro si me levanto de la compu" checked={away} onChange={setAway} />
        </div>
      )
    },
    {
      id: 'done',
      title: firstName ? `Todo listo, ${firstName}` : 'Todo listo',
      subtitle: 'Podés cambiar cualquiera de estas opciones en Ajustes.',
      body: (
        <ul className="mx-auto grid max-w-sm gap-2 text-left text-sm">
          {[
            `Tema ${THEME_META[theme].label} · ícono ${ICON_VARIANT_LABEL[icon]}`,
            subjects.length ? `${subjects.length} ${subjects.length === 1 ? 'materia nueva' : 'materias nuevas'}` : existing.length ? `${existing.length} materias` : 'Sin materias por ahora',
            exam.subject && exam.date ? `Próximo ${exam.kind === 'exam' ? 'parcial' : 'entrega'} el ${new Date(`${exam.date}T12:00`).toLocaleDateString('es', { day: 'numeric', month: 'long' })}` : 'Sin fechas por ahora',
            `Bloques de ${focus} min · meta diaria ${streak} min`,
            autoplay ? `Sonido: ${SOUND_META[soundId].label.toLowerCase()} al estudiar` : 'Sin sonido automático'
          ].map((t, i) => (
            <motion.li
              key={t}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0, transition: { delay: 0.15 + i * 0.08, ...spring.sheet } }}
              className="flex items-center gap-2.5"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success text-white">
                <Check size={12} strokeWidth={3} />
              </span>
              {t}
            </motion.li>
          ))}
        </ul>
      )
    }
  ]

  const current = steps[step]!
  const last = step === steps.length - 1
  const canContinue = current.canContinue !== false && !saving

  const go = (delta: 1 | -1) => {
    if (delta === 1 && last) return void finish()
    setDir(delta)
    setStep((s) => Math.min(steps.length - 1, Math.max(0, s + delta)))
  }

  // Enter = Continuar (también desde un campo de texto)
  const goRef = useRef(go)
  goRef.current = go
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.isComposing && (e.target as HTMLElement).tagName !== 'BUTTON' && canContinue) {
        e.preventDefault()
        goRef.current(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canContinue])

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`Bienvenida a ${APP_NAME}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.5 } }}
      exit={{ opacity: 0, scale: 1.02, transition: { duration: 0.45, ease: EASE_OUT_MAC } }}
      className="fixed inset-0 z-[400] flex flex-col overflow-hidden bg-canvas text-fg"
    >
      {/* Zona para arrastrar la ventana (barra de título oculta) */}
      <div className="drag-region h-10 shrink-0" />
      <Ambient />

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-8">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.section
            key={current.id}
            custom={dir}
            variants={{
              enter: (d: number) => ({ opacity: 0, x: d * 48 }),
              center: { opacity: 1, x: 0, transition: { ...spring.sheet, opacity: { duration: 0.25 } } },
              exit: (d: number) => ({ opacity: 0, x: d * -48, transition: { duration: 0.18, ease: EASE_OUT_MAC } })
            }}
            initial="enter"
            animate="center"
            exit="exit"
            className="w-full max-w-[600px] py-8 text-center"
          >
            {current.id === 'welcome' || current.id === 'done' ? (
              <motion.div
                initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
                animate={{ scale: 1, opacity: 1, rotate: 0, transition: { type: 'spring', stiffness: 260, damping: 18, delay: 0.1 } }}
                className="mx-auto mb-6 w-fit drop-shadow-xl"
              >
                <PixelIcon variant={icon} size={current.id === 'welcome' ? 112 : 88} title={APP_NAME} />
              </motion.div>
            ) : (
              current.icon && (
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-[16px] bg-accent-soft text-accent">
                  <current.icon size={26} />
                </div>
              )
            )}
            <h1 className="font-display text-[32px] leading-tight font-semibold tracking-tight arcade:text-glow arcade:text-accent">{current.title}</h1>
            {current.subtitle && <p className="mx-auto mt-2 max-w-md text-[15px] text-fg-muted">{current.subtitle}</p>}
            <div className="mt-8">{current.body}</div>
          </motion.section>
        </AnimatePresence>
      </div>

      {/* Barra inferior: progreso + Atrás / Continuar */}
      <footer className="relative flex h-20 shrink-0 items-center justify-between border-t border-line bg-surface/60 px-8 backdrop-blur">
        <div className="w-40">
          {step > 0 && (
            <Button variant="ghost" onClick={() => go(-1)} disabled={saving}>
              Atrás
            </Button>
          )}
        </div>
        <div className="flex gap-1.5" aria-label={`Paso ${step + 1} de ${steps.length}`}>
          {steps.map((s, i) => (
            <motion.span
              key={s.id}
              animate={{ width: i === step ? 22 : 7, opacity: i <= step ? 1 : 0.35 }}
              transition={spring.snappy}
              className="h-[7px] rounded-full bg-accent"
            />
          ))}
        </div>
        <div className="flex w-40 items-center justify-end gap-2">
          {current.optional && (
            <button onClick={() => go(1)} className="text-sm text-fg-muted hover:text-fg">
              Omitir
            </button>
          )}
          <Button variant="primary" onClick={() => go(1)} disabled={!canContinue} className="min-w-28 justify-center">
            {step === 0 ? 'Empezar' : last ? (saving ? 'Guardando…' : `Usar ${APP_NAME}`) : 'Continuar'}
          </Button>
        </div>
      </footer>
      {error && <p className="absolute bottom-24 left-1/2 -translate-x-1/2 text-sm text-danger">{error}</p>}
    </motion.div>
  )
}

function SubjectsStep({
  existing,
  subjects,
  setSubjects
}: {
  existing: string[]
  subjects: DraftSubject[]
  setSubjects: (fn: (s: DraftSubject[]) => DraftSubject[]) => void
}) {
  const [name, setName] = useState('')
  const [difficulty, setDifficulty] = useState(3)
  const add = () => {
    const n = name.trim()
    if (!n) return
    setSubjects((s) => [...s, { key: crypto.randomUUID(), name: n, difficulty }])
    setName('')
    setDifficulty(3)
  }
  return (
    <div className="mx-auto max-w-md space-y-3 text-left">
      <div className="flex gap-2">
        <input
          autoFocus
          aria-label="Nombre de la materia"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) {
              e.preventDefault()
              e.stopPropagation()
              add()
            }
          }}
          placeholder="Ej.: Análisis Matemático II"
          className="h-11 flex-1 rounded-[10px] border border-line bg-surface px-3 text-sm focus:border-accent focus:outline-none"
        />
        <Button variant="secondary" onClick={add} disabled={!name.trim()} className="h-11" aria-label="Agregar materia">
          <Plus size={15} /> Agregar
        </Button>
      </div>
      <div className="flex items-center gap-2 text-xs text-fg-muted">
        Dificultad:
        <div className="flex gap-1" role="radiogroup" aria-label="Dificultad">
          {[1, 2, 3, 4, 5].map((d) => (
            <button
              key={d}
              role="radio"
              aria-checked={difficulty === d}
              title={DIFFICULTY[d]}
              onClick={() => setDifficulty(d)}
              className={cn('h-7 w-7 rounded-[7px] border text-xs font-medium', difficulty === d ? 'border-accent bg-accent-soft text-accent' : 'border-line')}
            >
              {d}
            </button>
          ))}
        </div>
        <span>{DIFFICULTY[difficulty]}</span>
      </div>
      <ul className="flex min-h-10 flex-wrap gap-2">
        {existing.map((n) => (
          <li key={n} className="rounded-full bg-surface-2 px-3 py-1 text-xs text-fg-muted">
            {n}
          </li>
        ))}
        <AnimatePresence initial={false}>
          {subjects.map((s) => (
            <motion.li
              key={s.key}
              layout
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={spring.snappy}
              className="flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft py-1 pr-1 pl-3 text-xs"
            >
              {s.name}
              <span className="text-fg-subtle">· {s.difficulty}</span>
              <button aria-label={`Quitar ${s.name}`} onClick={() => setSubjects((l) => l.filter((x) => x.key !== s.key))} className="rounded-full p-0.5 hover:bg-hover">
                <X size={12} />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  )
}

function Choice({ label, options, value, onChange, format }: { label: string; options: number[]; value: number; onChange: (v: number) => void; format: (v: number) => string }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-fg-muted">{label}</p>
      <div className="grid grid-cols-4 gap-1 rounded-[10px] bg-surface-2 p-1" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o}
            role="radio"
            aria-checked={value === o}
            onClick={() => onChange(o)}
            className={cn('h-8 rounded-[8px] text-sm', value === o ? 'bg-surface font-medium shadow-card' : 'text-fg-muted hover:text-fg')}
          >
            {format(o)}
          </button>
        ))}
      </div>
    </div>
  )
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn('relative h-6 w-10 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-line-strong')}
      >
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-200', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
    </label>
  )
}

function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <motion.div
        animate={{ x: [-60, 50], y: [-30, 30] }}
        transition={{ duration: 16, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
        className="absolute top-[10%] left-[15%] h-[440px] w-[440px] rounded-full bg-accent opacity-[0.12] blur-[120px]"
      />
      <motion.div
        animate={{ x: [40, -50], y: [20, -30] }}
        transition={{ duration: 20, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
        className="absolute right-[12%] bottom-[8%] h-[380px] w-[380px] rounded-full bg-accent-2 opacity-[0.1] blur-[110px]"
      />
    </div>
  )
}
