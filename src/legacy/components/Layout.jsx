import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import VisiteMedicalePopup from './VisiteMedicalePopup'
import VisiteMedicaleManagerPopup from './VisiteMedicaleManagerPopup'

const SIDEBAR_WIDTH = 240
const SIDEBAR_TRANSITION = 'margin-left 260ms cubic-bezier(0.4, 0, 0.2, 1)'

export default function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="flex h-screen min-h-0 bg-[var(--color-bg)]">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        style={{
          marginLeft: sidebarCollapsed ? 0 : SIDEBAR_WIDTH,
          transition: SIDEBAR_TRANSITION,
        }}
      >
        <header className="sticky top-0 z-20 flex shrink-0 items-center gap-3 border-b border-[#E4E7EE] bg-white px-4 py-3 font-['DM_Sans']">
          {sidebarCollapsed && (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-xl text-[#0F1729] transition-colors hover:bg-[#F0F2F6]"
              aria-label="Ouvrir le menu"
            >
              ≡
            </button>
          )}
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="min-h-full bg-[var(--color-bg)] p-8">
            <Outlet />
          </div>
        </main>
      </div>
      <VisiteMedicalePopup />
      <VisiteMedicaleManagerPopup />
    </div>
  )
}
