import { createTheme } from '@mui/material/styles';

// Create a custom theme that integrates with VS Code CSS variables
// This ensures Material UI components match the VS Code theme (light/dark)
export const createVSCodeTheme = () => {
  // Get computed styles to read VS Code CSS variables
  const style = getComputedStyle(document.documentElement);
  
  const getColor = (varName) => style.getPropertyValue(varName).trim() || '#cccccc';
  
  return createTheme({
    palette: {
      mode: 'dark', // VS Code uses dark mode by default, but colors come from CSS vars
      primary: {
        main: getColor('--vscode-button-background') || '#0e639c',
        contrastText: getColor('--vscode-button-foreground') || '#ffffff',
      },
      secondary: {
        main: getColor('--vscode-button-secondaryBackground') || '#3a3d41',
        contrastText: getColor('--vscode-button-secondaryForeground') || '#ffffff',
      },
      error: {
        main: getColor('--vscode-charts-red') || '#f48771',
      },
      warning: {
        main: getColor('--vscode-charts-orange') || '#cca700',
      },
      info: {
        main: getColor('--vscode-charts-blue') || '#75beff',
      },
      success: {
        main: getColor('--vscode-charts-green') || '#89d185',
      },
      background: {
        default: getColor('--vscode-editor-background') || '#1e1e1e',
        paper: getColor('--vscode-editor-background') || '#1e1e1e',
      },
      text: {
        primary: getColor('--vscode-foreground') || '#cccccc',
        secondary: getColor('--vscode-descriptionForeground') || '#cccccc99',
      },
      divider: getColor('--vscode-panel-border') || '#3a3d41',
    },
    typography: {
      fontFamily: getColor('--vscode-font-family') || 'system-ui, -apple-system, sans-serif',
      fontSize: parseInt(getColor('--vscode-font-size')) || 13,
      button: {
        textTransform: 'none', // VS Code doesn't use uppercase buttons
      },
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            minWidth: 'auto',
            padding: '4px 8px',
            fontSize: '13px',
          },
          text: {
            padding: '2px 6px',
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            padding: '4px',
            color: getColor('--vscode-foreground'),
            '&:hover': {
              backgroundColor: getColor('--vscode-list-hoverBackground'),
            },
          },
          sizeSmall: {
            padding: '2px',
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: getColor('--vscode-editorWidget-background') || '#252526',
            color: getColor('--vscode-editorWidget-foreground') || '#cccccc',
            border: `1px solid ${getColor('--vscode-editorWidget-border') || '#454545'}`,
            fontSize: '12px',
          },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: {
            backgroundColor: getColor('--vscode-progressBar-background') || '#0e70c0',
            '& .MuiLinearProgress-bar': {
              backgroundColor: getColor('--vscode-progressBar-background') || '#0e70c0',
            },
          },
        },
      },
    },
  });
};
