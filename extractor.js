import { getCrops } from './cropper.js';

function initExtractor(container) {
    const section = document.createElement('section');

    const crops = getCrops();
    const status = document.createElement('p');
    status.className = 'status-msg';
    status.textContent = crops.length
        ? `${crops.length} crops ready for extraction`
        : 'No crops available. Go to Cropper tab first.';
    section.appendChild(status);

    const placeholder = document.createElement('p');
    placeholder.className = 'status-msg';
    placeholder.style.fontStyle = 'italic';
    placeholder.textContent = 'Extraction method not yet configured.';
    section.appendChild(placeholder);

    container.appendChild(section);
}

export { initExtractor };
