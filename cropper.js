// Predefined RHTER grid coordinates (reference frame: 2000x1124px)
const REF_WIDTH = 2000;
const REF_HEIGHT = 1124;

const COLUMN_CENTERS = [
    105, 174, 242, 311, 380, 449, 517, 586, 655, 724,
    792, 861, 930, 998, 1067, 1136, 1205, 1273, 1342, 1411,
    1480, 1548, 1617, 1686
];
const COLUMN_HALF_WIDTH = 34;

const ROWS = [
    { y: 102, height: 323 },  // Row 1: y=102 to y=425 (legend cropped out)
    { y: 428, height: 334 },  // Row 2: y=428 to y=762
    { y: 765, height: 335 },  // Row 3: y=765 to y=1100
];

const UPSCALE_FACTOR = 3;

let uploadedImage = null;
let crops = [];

function getCrops() {
    return crops;
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

function initCropper(container) {
    const section = document.createElement('section');

    // Upload area
    const uploadArea = document.createElement('div');
    uploadArea.className = 'upload-area';
    uploadArea.textContent = 'Click or drag to upload RHTER screenshot';

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
    const scaleX = img.width / REF_WIDTH;
    const scaleY = img.height / REF_HEIGHT;
    drawGrid(overlay, scaleX, scaleY);

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

function drawGrid(overlay, scaleX, scaleY) {
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.strokeStyle = 'rgba(233, 69, 96, 0.6)';
    ctx.lineWidth = 1;

    const topY = ROWS[0].y * scaleY;
    const bottomY = (ROWS[2].y + ROWS[2].height) * scaleY;

    // Draw column boundaries
    for (const cx of COLUMN_CENTERS) {
        const left = (cx - COLUMN_HALF_WIDTH) * scaleX;
        const right = (cx + COLUMN_HALF_WIDTH) * scaleX;
        ctx.beginPath();
        ctx.moveTo(left, topY);
        ctx.lineTo(left, bottomY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(right, topY);
        ctx.lineTo(right, bottomY);
        ctx.stroke();
    }

    const leftX = (COLUMN_CENTERS[0] - COLUMN_HALF_WIDTH) * scaleX;
    const rightX = (COLUMN_CENTERS[COLUMN_CENTERS.length - 1] + COLUMN_HALF_WIDTH) * scaleX;

    // Draw row boundaries
    for (const row of ROWS) {
        const y1 = row.y * scaleY;
        const y2 = (row.y + row.height) * scaleY;
        ctx.beginPath();
        ctx.moveTo(leftX, y1);
        ctx.lineTo(rightX, y1);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(leftX, y2);
        ctx.lineTo(rightX, y2);
        ctx.stroke();
    }
}

function sliceImage(img) {
    crops = [];
    const scaleX = img.width / REF_WIDTH;
    const scaleY = img.height / REF_HEIGHT;
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    const upscaleCanvas = document.createElement('canvas');
    const upscaleCtx = upscaleCanvas.getContext('2d');

    for (let rowIdx = 0; rowIdx < ROWS.length; rowIdx++) {
        const row = ROWS[rowIdx];
        for (let colIdx = 0; colIdx < COLUMN_CENTERS.length; colIdx++) {
            const cx = COLUMN_CENTERS[colIdx];
            const x = (cx - COLUMN_HALF_WIDTH) * scaleX;
            const w = (COLUMN_HALF_WIDTH * 2) * scaleX;
            const y = row.y * scaleY;
            const h = row.height * scaleY;

            // Crop at native resolution
            tempCanvas.width = w;
            tempCanvas.height = h;
            tempCtx.drawImage(img, x, y, w, h, 0, 0, w, h);

            // Upscale for better text readability
            const upW = Math.round(w * UPSCALE_FACTOR);
            const upH = Math.round(h * UPSCALE_FACTOR);
            upscaleCanvas.width = upW;
            upscaleCanvas.height = upH;
            upscaleCtx.imageSmoothingEnabled = true;
            upscaleCtx.imageSmoothingQuality = 'high';
            upscaleCtx.drawImage(tempCanvas, 0, 0, w, h, 0, 0, upW, upH);

            crops.push({
                row: rowIdx + 1,
                col: colIdx + 1,
                width: upW,
                height: upH,
                dataUrl: upscaleCanvas.toDataURL('image/png'),
            });
        }
    }
}

async function getRowStrips() {
    if (!crops.length) return [];

    const strips = [];
    const labelHeight = 20;
    const borderWidth = 2;

    for (let rowIdx = 0; rowIdx < 3; rowIdx++) {
        const rowCrops = crops.filter(c => c.row === rowIdx + 1);
        if (!rowCrops.length) continue;

        const cropW = rowCrops[0].width;
        const cropH = rowCrops[0].height;

        const stripW = rowCrops.length * (cropW + borderWidth) + borderWidth;
        const stripH = labelHeight + cropH + borderWidth;

        const canvas = document.createElement('canvas');
        canvas.width = stripW;
        canvas.height = stripH;
        const ctx = canvas.getContext('2d');

        // Dark background
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, stripW, stripH);

        // Draw each crop with label
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';

        for (let i = 0; i < rowCrops.length; i++) {
            const x = borderWidth + i * (cropW + borderWidth);
            // Column label
            ctx.fillStyle = '#ffffff';
            ctx.fillText(String(i + 1), x + cropW / 2, labelHeight - 4);
            // Draw crop image
            const img = await loadImage(rowCrops[i].dataUrl);
            ctx.drawImage(img, x, labelHeight);
            // White border
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = borderWidth;
            ctx.strokeRect(x, labelHeight, cropW, cropH);
        }

        strips.push({
            row: rowIdx + 1,
            dataUrl: canvas.toDataURL('image/png'),
        });
    }

    return strips;
}

function showCropPreview(section) {
    const existing = section.querySelector('.crop-preview');
    if (existing) existing.remove();

    const preview = document.createElement('div');
    preview.className = 'crop-preview';

    const heading = document.createElement('h3');
    heading.textContent = `${crops.length} crops generated (${UPSCALE_FACTOR}x upscaled)`;
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

async function getBatchStrips(batchSize = 3) {
    if (!crops.length) return [];

    const strips = [];
    const labelHeight = 20;
    const borderWidth = 2;

    for (let rowIdx = 0; rowIdx < 3; rowIdx++) {
        const rowCrops = crops.filter(c => c.row === rowIdx + 1);
        if (!rowCrops.length) continue;

        for (let batchStart = 0; batchStart < rowCrops.length; batchStart += batchSize) {
            const batch = rowCrops.slice(batchStart, batchStart + batchSize);

            const cropW = batch[0].width;
            const cropH = batch[0].height;

            const stripW = batch.length * (cropW + borderWidth) + borderWidth;
            const stripH = labelHeight + cropH + borderWidth;

            const canvas = document.createElement('canvas');
            canvas.width = stripW;
            canvas.height = stripH;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#0a0a1a';
            ctx.fillRect(0, 0, stripW, stripH);

            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';

            for (let i = 0; i < batch.length; i++) {
                const x = borderWidth + i * (cropW + borderWidth);
                ctx.fillStyle = '#ffffff';
                ctx.fillText(String(batch[i].col), x + cropW / 2, labelHeight - 4);
                const img = await loadImage(batch[i].dataUrl);
                ctx.drawImage(img, x, labelHeight);
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = borderWidth;
                ctx.strokeRect(x, labelHeight, cropW, cropH);
            }

            strips.push({
                row: rowIdx + 1,
                colStart: batch[0].col,
                colEnd: batch[batch.length - 1].col,
                count: batch.length,
                dataUrl: canvas.toDataURL('image/png'),
            });
        }
    }

    return strips;
}

export { initCropper, getCrops, getRowStrips, getBatchStrips, COLUMN_CENTERS, COLUMN_HALF_WIDTH, ROWS };
