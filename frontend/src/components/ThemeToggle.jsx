import { useEffect, useState } from 'react';

function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  localStorage.setItem('theme', theme);
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'));

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  const isDark = theme === 'dark';

  return (
    <div
      className="theme-toggle"
      id="theme-toggle"
      role="button"
      tabIndex={0}
      aria-label="Cambiar tema"
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <span className="theme-toggle__icon" id="theme-icon">{isDark ? '🌙' : '☀️'}</span>
      <div className="theme-toggle__track">
        <div className="theme-toggle__thumb" />
      </div>
      <span className="theme-toggle__label" id="theme-label">{isDark ? 'Oscuro' : 'Claro'}</span>
    </div>
  );
}
