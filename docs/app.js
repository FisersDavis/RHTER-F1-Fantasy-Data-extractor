import { initDataStore } from './dataStore.js';
import { initReview } from './review.js';
import { initAnalysis } from './analysis.js';

const VIEWS = ['review', 'analysis', 'data'];

const state = {
    currentView: localStorage.getItem('currentView') || 'review',
};

// Guard against a stale 'cropper' value in localStorage
if (!VIEWS.includes(state.currentView)) state.currentView = 'review';

function saveState() {
    localStorage.setItem('currentView', state.currentView);
}

function navigateTo(view) {
    state.currentView = view;
    saveState();
    render();
}

function renderNav() {
    const nav = document.getElementById('main-nav');
    nav.innerHTML = '';
    const labels = { review: 'REVIEW', analysis: 'ANALYSIS', data: 'DATA' };
    for (const view of VIEWS) {
        const btn = document.createElement('button');
        btn.textContent = labels[view];
        if (view === state.currentView) btn.classList.add('active');
        btn.addEventListener('click', () => navigateTo(view));
        nav.appendChild(btn);
    }
}

function render() {
    const app = document.getElementById('app');
    app.innerHTML = '';
    renderNav();

    switch (state.currentView) {
        case 'review':
            initReview(app);
            break;
        case 'analysis':
            initAnalysis(app);
            break;
        case 'data':
            initDataStore(app);
            break;
    }
}

document.addEventListener('navigate', (e) => navigateTo(e.detail));

render();

export { state };
