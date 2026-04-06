import { initDataStore } from './dataStore.js';
import { initReview } from './review.js';
import { initAnalysis } from './analysis.js';
import { initSettingsPanel } from './settingsPanel.js';

const VIEWS = ['review', 'analysis', 'data', 'settings'] as const;
type View = typeof VIEWS[number];

const LABELS: Record<View, string> = {
  review: 'REVIEW',
  analysis: 'ANALYSIS',
  data: 'DATA',
  settings: 'SETTINGS',
};

const storedView = localStorage.getItem('currentView') as View | null;
const state = {
  currentView: (storedView && (VIEWS as readonly string[]).includes(storedView) ? storedView : 'review') as View,
};

function saveState(): void {
  localStorage.setItem('currentView', state.currentView);
}

function navigateTo(view: View): void {
  state.currentView = view;
  saveState();
  render();
}

function renderNav(): void {
  const nav = document.getElementById('main-nav');
  if (!nav) return;
  nav.innerHTML = '';
  for (const view of VIEWS) {
    const btn = document.createElement('button');
    btn.textContent = LABELS[view];
    if (view === state.currentView) btn.classList.add('active');
    btn.addEventListener('click', () => navigateTo(view));
    nav.appendChild(btn);
  }
}

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = '';
  renderNav();

  switch (state.currentView) {
    case 'review':    initReview(app);         break;
    case 'analysis':  initAnalysis(app);        break;
    case 'data':      initDataStore(app);       break;
    case 'settings':  initSettingsPanel(app);   break;
  }
}

document.addEventListener('navigate', (e) => navigateTo((e as CustomEvent<View>).detail));

render();

export { state };
