// Predefined RHTER grid coordinates (all images 2000x1124px)
const COLUMN_CENTERS = [
    105, 174, 242, 311, 380, 449, 517, 586, 655, 724,
    792, 861, 930, 998, 1067, 1136, 1205, 1273, 1342, 1411,
    1480, 1548, 1617, 1686
];
const COLUMN_HALF_WIDTH = 34;

const ROWS = [
    { y: 50, height: 375 },
    { y: 428, height: 334 },
    { y: 765, height: 335 },
];

let uploadedImage = null;
let crops = [];

function getCrops() {
    return crops;
}

function initCropper(container) {
    const section = document.createElement('section');

    // Upload area
    const uploadArea = document.createElement('div');
    uploadArea.className = 'upload-area';
    uploadArea.textContent = 'Click or drag to upload RHTER screenshot (2000×1124px)';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';

    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0], section);
    });
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) handleFile(fileInput.files[0], section);
    });

    section.appendChild(uploadArea);
    section.appendChild(fileInput);

    // If we already have an image loaded, show it
    if (uploadedImage) {
        showGridOverlay(section, uploadedImage);
    }

    container.appendChild(section);
}

function handleFile(file, section) {
    const img = new Image();
    img.onload = () => {
        uploadedImage = img;
        showGridOverlay(section, img);
    };
    img.src = URL.createObjectURL(file);
}

function showGridOverlay(section, img) {
    // Remove any existing preview
    const existing = section.querySelector('.canvas-container');
    if (existing) existing.remove();
    const existingControls = section.querySelector('.crop-controls');
    if (existingControls) existingControls.remove();

    const wrapper = document.createElement('div');
    wrapper.className = 'canvas-container';

    // Base image canvas
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // Grid overlay canvas
    const overlay = document.createElement('canvas');
    overlay.className = 'grid-overlay';
    overlay.width = img.width;
    overlay.height = img.height;
    drawGrid(overlay);

    wrapper.appendChild(canvas);
    wrapper.appendChild(overlay);
    section.appendChild(wrapper);

    // Controls
    const controls = document.createElement('div');
    controls.className = 'crop-controls';

    const sliceBtn = document.createElement('button');
    sliceBtn.className = 'btn';
    sliceBtn.textContent = 'Confirm Grid & Slice';
    sliceBtn.addEventListener('click', () => {
        sliceImage(img);
        showCropPreview(section);
    });
    controls.appendChild(sliceBtn);

    section.appendChild(controls);
}

function drawGrid(overlay) {
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.strokeStyle = 'rgba(233, 69, 96, 0.6)';
    ctx.lineWidth = 1;

    // Draw column boundaries
    for (const cx of COLUMN_CENTERS) {
        const left = cx - COLUMN_HALF_WIDTH;
        const right = cx + COLUMN_HALF_WIDTH;
        ctx.beginPath();
        ctx.moveTo(left, ROWS[0].y);
        ctx.lineTo(left, ROWS[2].y + ROWS[2].height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(right, ROWS[0].y);
        ctx.lineTo(right, ROWS[2].y + ROWS[2].height);
        ctx.stroke();
    }

    // Draw row boundaries
    for (const row of ROWS) {
        ctx.beginPath();
        ctx.moveTo(COLUMN_CENTERS[0] - COLUMN_HALF_WIDTH, row.y);
        ctx.lineTo(COLUMN_CENTERS[COLUMN_CENTERS.length - 1] + COLUMN_HALF_WIDTH, row.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(COLUMN_CENTERS[0] - COLUMN_HALF_WIDTH, row.y + row.height);
        ctx.lineTo(COLUMN_CENTERS[COLUMN_CENTERS.length - 1] + COLUMN_HALF_WIDTH, row.y + row.height);
        ctx.stroke();
    }
}

function sliceImage(img) {
    crops = [];
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    for (let rowIdx = 0; rowIdx < ROWS.length; rowIdx++) {
        const row = ROWS[rowIdx];
        for (let colIdx = 0; colIdx < COLUMN_CENTERS.length; colIdx++) {
            const cx = COLUMN_CENTERS[colIdx];
            const x = cx - COLUMN_HALF_WIDTH;
            const w = COLUMN_HALF_WIDTH * 2;

            tempCanvas.width = w;
            tempCanvas.height = row.height;
            tempCtx.drawImage(img, x, row.y, w, row.height, 0, 0, w, row.height);

            crops.push({
                row: rowIdx + 1,
                col: colIdx + 1,
                dataUrl: tempCanvas.toDataURL('image/png'),
            });
        }
    }
}

function showCropPreview(section) {
    const existing = section.querySelector('.crop-preview');
    if (existing) existing.remove();

    const preview = document.createElement('div');
    preview.className = 'crop-preview';

    const heading = document.createElement('h3');
    heading.textContent = `${crops.length} crops generated`;
    preview.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'crop-grid';
    for (const crop of crops) {
        const img = document.createElement('img');
        img.src = crop.dataUrl;
        img.title = `Row ${crop.row}, Col ${crop.col}`;
        grid.appendChild(img);
    }
    preview.appendChild(grid);

    section.appendChild(preview);
}

export { initCropper, getCrops, COLUMN_CENTERS, COLUMN_HALF_WIDTH, ROWS };
