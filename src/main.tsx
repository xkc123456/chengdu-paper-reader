import "@/lib/logger";
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './lib/theme'
import { TRPCProvider } from './providers/trpc'
import './styles/kit.css'
import './styles/app.css'

// 构建写进 #root 的是无脚本也能读的首页正文，结构比交互页短，所以这里整页替换而不是 hydrate。
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <TRPCProvider>
        <App />
      </TRPCProvider>
    </ThemeProvider>
  </StrictMode>,
)
