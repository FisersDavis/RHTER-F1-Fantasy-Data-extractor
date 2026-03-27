import { getDatasets, getUnifiedTable } from './dataStore.js';

function initAnalysis(container) {
    const section = document.createElement('section');

    const heading = document.createElement('h2');
    heading.textContent = 'Analysis';
    section.appendChild(heading);

    const datasets = getDatasets();
    if (!datasets.length) {
        const msg = document.createElement('p');
        msg.className = 'status-msg';
        msg.textContent = 'No datasets available. Extract data first.';
        section.appendChild(msg);
        container.appendChild(section);
        return;
    }

    const msg = document.createElement('p');
    msg.className = 'status-msg';
    msg.textContent = 'Analysis features will be built after the extraction pipeline is complete.';
    section.appendChild(msg);

    container.appendChild(section);
}

export { initAnalysis };
