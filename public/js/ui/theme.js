/* ============================================
   CID Aprueba — Light / dark theme toggle
   ============================================ */

export function toggleTheme() {
  const html = document.documentElement;
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';

  if (next === 'dark') {
    html.setAttribute('data-theme', 'dark');
  } else {
    html.removeAttribute('data-theme');
  }
  localStorage.setItem('theme', next);
  updateThemeToggleUI();
}

export function updateThemeToggleUI() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const icon = document.getElementById('theme-icon');
  const label = document.getElementById('theme-label');
  if (icon) icon.textContent = isDark ? '🌙' : '☀️';
  if (label) label.textContent = isDark ? 'Oscuro' : 'Claro';
}

export function initTheme() {
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', toggleTheme);
    toggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleTheme();
      }
    });
  }
  updateThemeToggleUI();
}
