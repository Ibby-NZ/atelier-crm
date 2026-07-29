// Inline SVG icons — fine brass strokes, no fills (per design system). Pass size + color.
import { c } from '../theme.js'

const S = ({ size = 16, color = c.brass, w = 1.6, children, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={w}
    strokeLinecap="round" strokeLinejoin="round" style={style}>{children}</svg>
)

export const IconSearch = (p) => <S {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></S>
export const IconBarcode = (p) => <S {...p}><path d="M3 5v14M7 5v14M11 5v14M14 5v14M18 5v14M21 5v14" /></S>
export const IconMail = (p) => <S {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></S>
export const IconPhone = (p) => <S {...p}><path d="M5 4h4l2 5-3 2a12 12 0 005 5l2-3 5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" /></S>
export const IconCart = (p) => <S {...p}><path d="M3 4h2l2.4 12.2a1 1 0 001 .8h8.7a1 1 0 001-.8L21 8H6" /><circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></S>
export const IconLock = (p) => <S {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></S>
export const IconPlay = (p) => <S {...p}><path d="M8 5v14l11-7z" /></S>
export const IconCopy = (p) => <S {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 012-2h8" /></S>
export const IconFile = (p) => <S {...p}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5" /></S>
export const IconDownload = (p) => <S {...p}><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" /></S>
export const IconArrow = (p) => <S {...p}><path d="M5 12h14M13 6l6 6-6 6" /></S>
export const IconChevron = (p) => <S {...p}><path d="M9 6l6 6-6 6" /></S>
export const IconClose = (p) => <S {...p}><path d="M6 6l12 12M18 6L6 18" /></S>
export const IconCheck = (p) => <S {...p}><path d="M5 13l4 4L19 7" /></S>
export const IconUser = (p) => <S {...p}><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /></S>
export const IconExternal = (p) => <S {...p}><path d="M14 5h5v5M19 5l-8 8M19 13v4a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2h4" /></S>
export const IconMenu = (p) => <S {...p}><path d="M4 7h16M4 12h16M4 17h16" /></S>
export const IconLogout = (p) => <S {...p}><path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3" /><path d="M10 12H3m0 0l3-3m-3 3l3 3" /></S>
export const IconKey = (p) => <S {...p}><circle cx="8" cy="15" r="4" /><path d="M11 12l8-8m-2 2l2 2m-4 0l2 2" /></S>
