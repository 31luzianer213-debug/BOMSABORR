import { useTheme } from '../../contexts/ThemeContext';
import { Sun, Moon } from 'lucide-react';
import styles from './ThemeToggle.module.css';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={styles['toggle']}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      <span className={`${styles['icon']} ${theme === 'light' ? styles['active'] : ''}`}>
        <Sun size={20} />
      </span>
      <span className={`${styles['icon']} ${theme === 'dark' ? styles['active'] : ''}`}>
        <Moon size={20} />
      </span>
      <span className={`${styles['slider']} ${theme === 'dark' ? styles['sliderDark'] : ''}`} />
    </button>
  );
}
