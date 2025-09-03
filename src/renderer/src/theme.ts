import { createTheme } from '@mui/material/styles'
import { themeColors } from './themeColors'
import { CSSObject } from '@mui/system'

const commonLayout = {
  'html, body, #root': {
    margin: 0,
    padding: 0,
    height: '100%',
    width: '100%',
    overflow: 'hidden',
    backgroundColor: 'inherit',
  },
  '::-webkit-scrollbar': { display: 'none' },
  '.App': { backgroundColor: 'inherit' },
  '.app-wrapper, #main, #videoContainer, .PhoneContent, .InfoContent, .CarplayContent': {
    backgroundColor: 'inherit',
  },
}

const tabRootBase = {
  position: 'sticky',
  top: 0,
  zIndex: 1200,
  width: '100%',
  boxSizing: 'border-box',
  color: 'inherit',
  cursor: 'default',
}
const tabItemBase = {
  minHeight: 64,
  color: 'inherit',
  cursor: 'default',
  '& svg': { color: 'inherit', fontSize: '36px' },
  '&.Mui-selected svg': { color: 'inherit' },
}
const buttonBaseRoot = { cursor: 'default' }
const svgIconRoot = { cursor: 'default' }

function buildTheme(mode: 'light' | 'dark') {
  const isLight = mode === 'light'
  return createTheme({
    palette: {
      mode,
      background: {
        default: isLight ? themeColors.light : themeColors.dark,
        paper: isLight ? themeColors.light : themeColors.dark,
      },
      text: {
        primary: isLight ? themeColors.textPrimaryLight : themeColors.textPrimaryDark,
        secondary: isLight ? themeColors.textSecondaryLight : themeColors.textSecondaryDark,
      },
      primary: { main: isLight ? themeColors.highlightLight : themeColors.highlightDark },
      divider: isLight ? themeColors.dividerLight : themeColors.dividerDark,
      success: { main: themeColors.successMain },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ...commonLayout,
          body: { backgroundColor: isLight ? themeColors.light : themeColors.dark },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: {
            ...(tabRootBase as CSSObject),
            backgroundColor: isLight ? themeColors.light : themeColors.dark,
          },
          indicator: {
            backgroundColor: isLight ? themeColors.highlightLight : themeColors.highlightDark,
            height: 4,
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: tabItemBase,
        },
      },
      MuiButtonBase: {
        styleOverrides: {
          root: buttonBaseRoot,
        },
      },
      MuiSvgIcon: {
        styleOverrides: {
          root: svgIconRoot,
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: isLight ? themeColors.highlightLight : themeColors.highlightDark,
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: isLight ? themeColors.highlightLight : themeColors.highlightDark,
            },
          },
          notchedOutline: {
            borderColor: isLight ? themeColors.dividerLight : themeColors.dividerDark,
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            '&.Mui-focused': {
              color: isLight ? themeColors.highlightLight : themeColors.highlightDark,
            },
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          containedPrimary: {
            backgroundColor: isLight ? themeColors.highlightLight : themeColors.highlightDark,
            '&:hover': {
              backgroundColor: isLight ? themeColors.highlightAlphaLight : themeColors.highlightAlphaDark,
            },
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: isLight ? themeColors.light : themeColors.dark,
            boxShadow: 'none',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            boxShadow: isLight
              ? '0 2px 8px rgba(0,0,0,0.1)'
              : '0 2px 8px rgba(0,0,0,0.3)',
          },
        },
      },
    },
  })
}

export const lightTheme = buildTheme('light')
export const darkTheme = buildTheme('dark')

export function initCursorHider(inactivityMs: number = 5000) {
  let timer: ReturnType<typeof setTimeout>
  const setCursor = (value: string) => {
    const elems = [
      document.body,
      document.getElementById('main'),
      ...Array.from(
        document.querySelectorAll<HTMLElement>(
          '.MuiTabs-root, .MuiTab-root, .MuiButtonBase-root, .MuiSvgIcon-root'
        )
      ),
    ].filter((el): el is HTMLElement => el !== null)
    elems.forEach(el => el.style.setProperty('cursor', value, 'important'))
  }
  function reset() {
    clearTimeout(timer)
    setCursor('default')
    timer = setTimeout(() => setCursor('none'), inactivityMs)
  }
  document.addEventListener('mousemove', reset)
  reset()
}
