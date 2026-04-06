import { initCropper } from './cropper.js';
import { initDataStore } from './dataStore.js';
import { initReview } from './review.js';
import { initAnalysis } from './analysis.js';

const VIEWS = ['cropper', 'review', 'analysis', 'data'];

const NAV_LABELS = {
    cropper: 'Cropper',
    review: 'Review',
    analysis: 'Analysis',
    data: 'Data',
};

const state = {
    currentView: localStorage.getItem('currentView') || 'cropper',
};

function saveState() {
    localStorage.setItem('currentView', state.currentView);
}

function renderNav() {
    const nav = document.getElementById('main-nav');
    nav.innerHTML = '';
    for (const view of VIEWS) {
        const btn = document.createElement('button');
        btn.textContent = NAV_LABELS[view] || view;
        if (view === state.currentView) btn.classList.add('active');
        btn.addEventListener('click', () => {
            state.currentView = view;
            saveState();
            render();
        });
        nav.appendChild(btn);
    }
}

function navigateTo(view) {
    state.currentView = view;
    saveState();
    render();
}

function render() {
    const app = document.getElementById('app');
    app.innerHTML = '';
    renderNav();

    switch (state.currentView) {
        case 'cropper':
            initCropper(app);
            break;
        case 'review':
            initReview(app, () => navigateTo('analysis'));
            break;
        case 'analysis':
            initAnalysis(app);
            break;
        case 'data':
            initDataStore(app);
            break;
    }
}

// Allow other modules to trigger navigation via custom event
window.addEventListener('navigate', (e) => navigateTo(e.detail));

render();

export { state };
