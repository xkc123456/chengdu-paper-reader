/* 画在 canvas 上的颜色跟不了 CSS 变量，所以两套主题的色标必须在这里各写一份。
 *
 * 分工是清楚的：**SVG 与 DOM 一律用 var(--…)，主题一切自动跟着走；
 * 只有 canvas 的逐像素填色、以及需要按背景反转的字色，才来这里取。**
 * 页面上百分之九十的颜色都不经过这个文件。
 *
 * 两条画色标的规矩：
 *   · 顺序量（注意力权重）用单色标，暗色从底色升到强调色，亮色从纸白降到深金 ——
 *     方向必须跟着背景走，否则「值大」在亮色主题下会变成「更浅」。
 *   · 发散量（正弦有正负）才允许双色，中点必须落在背景色上。 */

export type Theme = 'dark' | 'light'

type RGB = [number, number, number]
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const mix = (ramp: RGB[], t: number) => {
  const x = Math.max(0, Math.min(1, t)) * (ramp.length - 1)
  const i = Math.min(ramp.length - 2, Math.floor(x)), f = x - i
  const a = ramp[i], b = ramp[i + 1]
  return `rgb(${Math.round(lerp(a[0], b[0], f))},${Math.round(lerp(a[1], b[1], f))},${Math.round(lerp(a[2], b[2], f))})`
}

const HEAT: Record<Theme, RGB[]> = {
  dark: [[16, 17, 21], [43, 37, 26], [88, 66, 27], [148, 106, 33], [206, 150, 55], [236, 195, 118], [255, 240, 214]],
  light: [[255, 255, 255], [253, 243, 219], [246, 219, 155], [231, 184, 88], [193, 138, 32], [140, 96, 14], [92, 62, 8]],
}

/* 八个头需要八种能区分的颜色 —— 这是整页唯一允许出现色盘的地方（论文 Figure 3 也是这么画的）。
   两套都刻意低饱和：亮色那套不是把暗色那套调暗，而是各自对着自己的背景重新配过。 */
const HEADS: Record<Theme, string[]> = {
  dark: ['#e8b04b', '#7fb3d5', '#a3c88f', '#d99a9a', '#c2a5d6', '#e0a06a', '#8fc7c0', '#b8b09a'],
  light: ['#a3760f', '#2f6f9e', '#4e7c3f', '#a85a5a', '#7a5a9e', '#b06a2c', '#2f7a72', '#6f6647'],
}

/** 位置编码是发散量：中点落在背景上，正负各走一支。 */
const DIV: Record<Theme, { base: RGB; pos: RGB; neg: RGB }> = {
  dark: { base: [16, 17, 21], pos: [232, 176, 75], neg: [127, 179, 213] },
  light: { base: [255, 255, 255], pos: [150, 102, 12], neg: [47, 111, 158] },
}

export interface Palette {
  theme: Theme
  /** 顺序色标：0 → 背景，1 → 最热 */
  heat: (t: number) => string
  /** 热格子上的字色：底色一深就得翻成白的 */
  onHeat: (t: number) => string
  /** 发散色标，用于位置编码 */
  diverge: (v: number) => string
  heads: string[]
  /** 头颜色块上的字色 */
  onHead: string
  /** canvas 的底色与网格线 —— 这两个取不到 CSS 变量 */
  cvBg: string
  cvOff: string
  cvFocus: string
}

const make = (theme: Theme): Palette => ({
  theme,
  heat: t => mix(HEAT[theme], t),
  onHeat: t => (theme === 'dark' ? (t > .55 ? '#1a1206' : 'var(--ink)')
    : (t > .52 ? '#ffffff' : 'var(--ink)')),
  diverge: v => {
    const t = Math.max(-1, Math.min(1, v)), a = Math.abs(t)
    const { base, pos, neg } = DIV[theme]
    const c = t >= 0 ? pos : neg
    return `rgb(${base.map((x, i) => Math.round(x + (c[i] - x) * Math.pow(a, .8))).join(',')})`
  },
  heads: HEADS[theme],
  onHead: theme === 'dark' ? '#12100a' : '#ffffff',
  cvBg: theme === 'dark' ? '#0c0d10' : '#ffffff',
  cvOff: theme === 'dark' ? '#6c7078' : '#9aa0a8',
  cvFocus: theme === 'dark' ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.42)',
})

export const PALETTES: Record<Theme, Palette> = { dark: make('dark'), light: make('light') }
