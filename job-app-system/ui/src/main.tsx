import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { App } from './App.tsx'
import { applyThemeMode, getStoredThemeMode } from './components/ThemeToggle.tsx'

// shadcn's dark-mode variant is class-based (.dark), not media-query-based. Historically this
// unconditionally mirrored the OS preference onto <html> since there was no in-app toggle. Now
// that ThemeToggle exists (three-state system/light/dark, persisted to localStorage), apply
// whatever mode is stored on first load, and only keep following OS changes live while the
// stored mode is still "system" (or unset) — an explicit light/dark choice must not get
// overridden the next time the OS preference flips.
applyThemeMode(getStoredThemeMode())
const media = window.matchMedia('(prefers-color-scheme: dark)')
media.addEventListener('change', () => {
  if (getStoredThemeMode() === 'system') applyThemeMode('system')
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
