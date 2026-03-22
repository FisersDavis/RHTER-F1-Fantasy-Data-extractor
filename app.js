import { initCropper } from './cropper.js';
import { initExtractor } from './extractor.js';
import { initDataStore } from './dataStore.js';
import { initAnalysis } from './analysis.js';

const VIEWS = ['cropper', 'extractor', 'data', 'analysis'];

const state = {
    currentView: localStorage.getItem('currentView') || 'cropper',
    apiKey: sessionStorage.getItem('geminiApiKey') || '',
};

function saveState() {
    localStorage.setItem('currentView', state.currentView);
}

function renderNav() {
    const nav = document.getElementById('main-nav');
    nav.innerHTML = '';
    for (const view of VIEWS) {
        const btn = document.createElement('button');
        btn.textContent = view.charAt(0).toUpperCase() + view.slice(1);
        if (view === state.currentView) btn.classList.add('active');
        btn.addEventListener('click', () => {
            state.currentView = view;
            saveState();
            render();
        });
        nav.appendChild(btn);
    }
}

function render() {
    const app = document.getElementById('app');
    app.innerHTML = '';
    renderNav();

    switch (state.currentView) {
        case 'cropper':
            initCropper(app);
            break;
        case 'extractor':
            initExtractor(app);
            break;
        case 'data':
            initDataStore(app);
            break;
        case 'analysis':
            initAnalysis(app);
            break;
    }
}

render();

export { state };
