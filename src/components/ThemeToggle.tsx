import { useTheme } from '../contexts/ThemeContext';
import './ThemeToggle.css';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
      <button className="theme-toggle" onClick={toggleTheme} aria-label={`Alternar para modo ${isDark ? 'claro' : 'escuro'}`} aria-pressed={isDark} title={isDark ? 'Modo claro' : 'Modo escuro'}>
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb">
          <span className="toggle-icon">{isDark ? '☀️' : '🌙'}</span>
        </span>
        <span className="toggle-labels">
          <span>☀️</span>
          <span>🌙</span>
        </span>
      </span>
      <span className="toggle-text">{isDark ? 'Escuro' : 'Claro'}</span>
    </button>
  );
}
