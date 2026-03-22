import { getCrops } from './cropper.js';

const EXTRACTION_PROMPT = `You are analyzing a cropped violin plot from an F1 Fantasy simulation tool.

Extract the following structured data from this image:
1. **entity_name**: The constructor or driver name shown at the top
2. **budget**: The budget/cost value if shown
3. **median**: The median score value
4. **p10**: 10th percentile score
5. **p25**: 25th percentile score
6. **p75**: 75th percentile score
7. **p90**: 90th percentile score
8. **cap**: The "capped to" value if shown
9. **cn_role**: If this is a constructor, is it CN1 or CN2? Look at the color coding.
10. **team_labels**: Any team composition labels shown at the bottom

Return ONLY valid JSON with these fields. Use null for any values you cannot determine.

Example response:
{
  "entity_name": "Red Bull",
  "budget": 28.5,
  "median": 42,
  "p10": 25,
  "p25": 33,
  "p75": 51,
  "p90": 62,
  "cap": 65,
  "cn_role": "CN1",
  "team_labels": ["VER", "PER"]
}`;

function getApiKey() {
    return localStorage.getItem('geminiApiKey') || '';
}

function setApiKey(key) {
    localStorage.setItem('geminiApiKey', key);
}

async function extractSingleCrop(crop, apiKey) {
    const base64 = crop.dataUrl.split(',')[1];

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: EXTRACTION_PROMPT },
                        {
                            inline_data: {
                                mime_type: 'image/png',
                                data: base64,
                            },
                        },
                    ],
                }],
                generationConfig: {
                    temperature: 0.1,
                    responseMimeType: 'application/json',
                },
            }),
        }
    );

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from API');

    return {
        row: crop.row,
        col: crop.col,
        raw: text,
        parsed: JSON.parse(text),
    };
}

function initExtractor(container) {
    const section = document.createElement('section');

    // API key config
    const configDiv = document.createElement('div');
    configDiv.className = 'config-section';

    const label = document.createElement('label');
    label.textContent = 'Gemini API Key';
    const input = document.createElement('input');
    input.type = 'password';
    input.value = getApiKey();
    input.placeholder = 'Enter your Gemini API key';
    input.addEventListener('input', () => setApiKey(input.value));

    configDiv.appendChild(label);
    configDiv.appendChild(input);
    section.appendChild(configDiv);

    // Extract button
    const crops = getCrops();
    const status = document.createElement('p');
    status.className = 'status-msg';
    status.textContent = crops.length
        ? `${crops.length} crops ready for extraction`
        : 'No crops available. Go to Cropper tab first.';
    section.appendChild(status);

    const extractBtn = document.createElement('button');
    extractBtn.className = 'btn';
    extractBtn.textContent = 'Extract All';
    extractBtn.disabled = !crops.length;

    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    progressBar.style.display = 'none';
    const fill = document.createElement('div');
    fill.className = 'fill';
    fill.style.width = '0%';
    progressBar.appendChild(fill);

    const resultStatus = document.createElement('p');
    resultStatus.className = 'status-msg';

    extractBtn.addEventListener('click', async () => {
        const apiKey = getApiKey();
        if (!apiKey) {
            input.classList.add('error');
            return;
        }
        input.classList.remove('error');

        extractBtn.disabled = true;
        progressBar.style.display = 'block';

        const results = [];
        const errors = [];

        for (let i = 0; i < crops.length; i++) {
            fill.style.width = `${((i + 1) / crops.length) * 100}%`;
            resultStatus.textContent = `Extracting ${i + 1}/${crops.length} (Row ${crops[i].row}, Col ${crops[i].col})...`;

            try {
                const result = await extractSingleCrop(crops[i], apiKey);
                results.push(result);
            } catch (err) {
                errors.push({ crop: crops[i], error: err.message });
            }
        }

        // Store raw results
        const datasetKey = `extraction_${Date.now()}`;
        localStorage.setItem(datasetKey, JSON.stringify({ results, errors }));

        // Update dataset index
        const index = JSON.parse(localStorage.getItem('datasetIndex') || '[]');
        index.push({ key: datasetKey, date: new Date().toISOString(), count: results.length, errors: errors.length });
        localStorage.setItem('datasetIndex', JSON.stringify(index));

        resultStatus.textContent = `Done: ${results.length} extracted, ${errors.length} errors.`;
        extractBtn.disabled = false;
    });

    section.appendChild(extractBtn);
    section.appendChild(progressBar);
    section.appendChild(resultStatus);
    container.appendChild(section);
}

export { initExtractor, extractSingleCrop, EXTRACTION_PROMPT };
