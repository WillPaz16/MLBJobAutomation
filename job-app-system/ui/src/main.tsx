import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { App } from './App.tsx'

// shadcn's dark-mode variant is class-based (.dark), not media-query-based — mirror the
// OS preference onto <html> so dark mode keeps following the system setting with no
// in-app toggle (none has been built yet).
function syncDarkClass(matches: boolean) {
  document.documentElement.classList.toggle('dark', matches)
}
const media = window.matchMedia('(prefers-color-scheme: dark)')
syncDarkClass(media.matches)
media.addEventListener('change', (e) => syncDarkClass(e.matches))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
