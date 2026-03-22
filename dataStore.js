function getDatasets() {
    return JSON.parse(localStorage.getItem('datasetIndex') || '[]');
}

function getDataset(key) {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
}

function deleteDataset(key) {
    localStorage.removeItem(key);
    const index = getDatasets().filter(d => d.key !== key);
    localStorage.setItem('datasetIndex', JSON.stringify(index));
}

function getUnifiedTable(key) {
    const dataset = getDataset(key);
    if (!dataset) return [];
    return dataset.results.map(r => ({
        row: r.row,
        col: r.col,
        ...r.parsed,
    }));
}

function initDataStore(container) {
    const section = document.createElement('section');

    const heading = document.createElement('h2');
    heading.textContent = 'Extracted Datasets';
    section.appendChild(heading);

    const datasets = getDatasets();

    if (!datasets.length) {
        const msg = document.createElement('p');
        msg.className = 'status-msg';
        msg.textContent = 'No datasets yet. Extract data from the Extractor tab.';
        section.appendChild(msg);
        container.appendChild(section);
        return;
    }

    for (const ds of datasets) {
        const card = document.createElement('div');
        card.className = 'config-section';

        const title = document.createElement('strong');
        title.textContent = new Date(ds.date).toLocaleString();
        card.appendChild(title);

        const info = document.createElement('p');
        info.className = 'status-msg';
        info.textContent = `${ds.count} results, ${ds.errors} errors`;
        card.appendChild(info);

        const viewBtn = document.createElement('button');
        viewBtn.className = 'btn';
        viewBtn.textContent = 'View Table';
        viewBtn.addEventListener('click', () => {
            showTable(section, ds.key);
        });
        card.appendChild(viewBtn);

        const delBtn = document.createElement('button');
        delBtn.className = 'btn';
        delBtn.textContent = 'Delete';
        delBtn.style.marginLeft = '0.5rem';
        delBtn.addEventListener('click', () => {
            deleteDataset(ds.key);
            container.innerHTML = '';
            initDataStore(container);
        });
        card.appendChild(delBtn);

        section.appendChild(card);
    }

    container.appendChild(section);
}

function showTable(section, key) {
    const existing = section.querySelector('.data-table-container');
    if (existing) existing.remove();

    const rows = getUnifiedTable(key);
    if (!rows.length) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'data-table-container';

    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.marginTop = '1rem';
    table.style.fontSize = '0.8rem';

    const headers = Object.keys(rows[0]);
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const h of headers) {
        const th = document.createElement('th');
        th.textContent = h;
        th.style.borderBottom = '1px solid #0f3460';
        th.style.padding = '0.3rem';
        th.style.textAlign = 'left';
        headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const row of rows) {
        const tr = document.createElement('tr');
        for (const h of headers) {
            const td = document.createElement('td');
            const val = row[h];
            td.textContent = Array.isArray(val) ? val.join(', ') : (val ?? '');
            td.style.padding = '0.3rem';
            td.style.borderBottom = '1px solid #1a1a2e';
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    wrapper.appendChild(table);
    section.appendChild(wrapper);
}

export { initDataStore, getDatasets, getDataset, getUnifiedTable, deleteDataset };
