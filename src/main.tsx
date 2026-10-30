import "@/lib/logger";
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './lib/theme'
import { TRPCProvider } from './providers/trpc'
import './styles/kit.css'
import './styles/app.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <TRPCProvider>
        <App />
      </TRPCProvider>
    </ThemeProvider>
  </StrictMode>,
)
