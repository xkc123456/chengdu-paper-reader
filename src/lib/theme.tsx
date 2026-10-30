/* 主题只有三件事：写到 <html data-theme> 上、记进 localStorage、把色标发给需要 canvas 的那三台仪器。
 *
 * 用 context 而不是把 theme 一路传下去：九台仪器里只有三台需要它（矩阵热图、八个头、位置编码），
 * 为这三台给另外六台加一个 prop 是净亏。
 *
 * 首屏那次不在这里定 —— index.html 里有一小段同步脚本先把 data-theme 写好，
 * 否则会先闪一下暗色再跳成亮色。这里只负责读回来，保持两边一致。 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { PALETTES, type Palette, type Theme } from './palette'

const KEY = 'pv-theme'

interface Ctx { theme: Theme; p: Palette; toggle: () => void }
const ThemeCtx = createContext<Ctx>({ theme: 'dark', p: PALETTES.dark, toggle: () => {} })

const current = (): Theme =>
  (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(current)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem(KEY, theme) } catch { /* 无痕模式下写不进去，不影响本次会话 */ }
  }, [theme])

  const toggle = useCallback(() => setTheme(t => (t === 'dark' ? 'light' : 'dark')), [])

  return (
    <ThemeCtx.Provider value={{ theme, p: PALETTES[theme], toggle }}>
      {children}
    </ThemeCtx.Provider>
  )
}

export const useTheme = () => useContext(ThemeCtx)

/** 切换按钮。图标画的是「点了会变成什么」，而不是现在是什么 —— 这样它读起来是个动作。 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const to = theme === 'dark' ? '浅色' : '深色'
  return (
    <button className="kit-theme" onClick={toggle} title={`切换到${to}模式`}
      aria-label={`切换到${to}模式`}>
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
          strokeLinecap="round">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
          strokeLinejoin="round">
          <path d="M20 14.2A8.4 8.4 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2z" />
        </svg>
      )}
    </button>
  )
}
