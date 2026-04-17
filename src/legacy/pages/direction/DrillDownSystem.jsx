import { useState, useCallback, createContext, useContext } from 'react'
import { X, ChevronRight, ArrowLeft } from 'lucide-react'

const DrillContext = createContext(null)

export function useDrill() {
  return useContext(DrillContext)
}

export function DrillProvider({ children }) {
  const [stack, setStack] = useState([])

  const push = useCallback((panel) => {
    setStack((prev) => [...prev, panel])
  }, [])

  const pop = useCallback(() => {
    setStack((prev) => prev.slice(0, -1))
  }, [])

  const reset = useCallback(() => {
    setStack([])
  }, [])

  const goTo = useCallback((index) => {
    setStack((prev) => prev.slice(0, index + 1))
  }, [])

  return (
    <DrillContext.Provider value={{ stack, push, pop, reset, goTo }}>
      {children}
      <DrillOverlay />
    </DrillContext.Provider>
  )
}

function DrillOverlay() {
  const drill = useDrill()
  if (!drill) return null
  const { stack, pop, reset, goTo } = drill

  if (stack.length === 0) return null
  const current = stack[stack.length - 1]

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={reset} role="presentation" />
      <div
        className="w-full max-w-3xl bg-[var(--color-surface)] flex flex-col shadow-2xl"
        style={{ animation: 'slideInRight 200ms cubic-bezier(0.4,0,0.2,1)' }}
      >
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-[var(--color-border)] shrink-0">
          <div className="min-w-0 flex-1">
            {stack.length > 1 && (
              <div className="flex items-center gap-1 mb-2 flex-wrap">
                {stack.map((panel, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight size={10} className="text-[var(--color-faint)]" />}
                    <button
                      type="button"
                      onClick={() => goTo(i)}
                      className={`text-[10px] font-mono transition-colors ${
                        i === stack.length - 1
                          ? 'text-[var(--color-ink)] font-medium'
                          : 'text-[var(--color-muted)] hover:text-[var(--color-primary)]'
                      }`}
                    >
                      {panel.title}
                    </button>
                  </span>
                ))}
              </div>
            )}
            <h2 className="text-[16px] font-semibold text-[var(--color-ink)] truncate">{current.title}</h2>
            {current.subtitle && <p className="text-[11px] text-[var(--color-muted)] mt-0.5 font-mono">{current.subtitle}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {stack.length > 1 && (
              <button
                type="button"
                onClick={pop}
                className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--color-muted)] hover:text-[var(--color-ink)] px-2.5 py-1.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors"
              >
                <ArrowLeft size={12} />
                Retour
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              className="w-8 h-8 flex items-center justify-center rounded text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {current.component && <current.component {...(current.props || {})} />}
        </div>
      </div>
    </div>
  )
}

export default DrillProvider
