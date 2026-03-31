const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileListContainer = document.getElementById('file-list-container');
const fileList = document.getElementById('file-list');
const btnMerge = document.getElementById('btn-merge');

const sectionUpload = document.getElementById('upload-section');
const sectionLoading = document.getElementById('loading-section');
const sectionPreview = document.getElementById('preview-section');

const step1 = document.getElementById('step-1');
const step2 = document.getElementById('step-2');
const step3 = document.getElementById('step-3');

const ficStatus = document.getElementById('fic-status');
const btnLogin = document.getElementById('btn-login');

let selectedFiles = [];
let mergedInvoiceData = null;

// Check FIC Connection
async function checkFICStatus() {
    try {
        // Also check if URL has ?connected=true
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('connected') === 'true') {
            window.history.replaceState({}, document.title, "/");
            setConnectedState();
            return;
        }

        const res = await fetch('/api/fic/status');
        const data = await res.json();
        if (data.connected) {
            setConnectedState();
        } else {
            setDisconnectedState();
        }
    } catch(e) {
        setDisconnectedState();
    }
}

function setConnectedState() {
    ficStatus.className = 'status-badge connected';
    ficStatus.innerHTML = '<i class="fa-solid fa-cloud-bolt"></i> Connesso a FIC';
    btnLogin.style.display = 'none';
}

function setDisconnectedState() {
    ficStatus.className = 'status-badge disconnected';
    ficStatus.innerHTML = '<i class="fa-solid fa-cloud-bolt"></i> Non connesso a FIC';
    btnLogin.style.display = 'inline-flex';
}

// Drag & Drop Handlers
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
});

dropZone.addEventListener('drop', handleDrop, false);
fileInput.addEventListener('change', handleFilesSelect, false);

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    addFiles(files);
}

function handleFilesSelect(e) {
    const files = e.target.files;
    addFiles(files);
}

function addFiles(files) {
    for (let i = 0; i < files.length; i++) {
        selectedFiles.push(files[i]);
    }
    updateFileList();
}

function updateFileList() {
    fileList.innerHTML = '';
    
    if (selectedFiles.length > 0) {
        fileListContainer.style.display = 'block';
        selectedFiles.forEach((file, index) => {
            const li = document.createElement('li');
            const isZip = file.name.toLowerCase().endsWith('.zip');
            const icon = isZip ? 'fa-regular fa-file-zipper' : 'fa-regular fa-file-pdf';
            li.innerHTML = `
                <i class="${icon}"></i>
                <span style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${file.name}</span>
                <i class="fa-solid fa-times" style="cursor:pointer; color: var(--danger); margin-left: auto;" onclick="removeFile(${index})"></i>
            `;
            fileList.appendChild(li);
        });
    } else {
        fileListContainer.style.display = 'none';
    }
}

window.removeFile = function(index) {
    selectedFiles.splice(index, 1);
    updateFileList();
};

// Merge Process
btnMerge.addEventListener('click', async () => {
    if (selectedFiles.length === 0) return;

    // Show Loading
    sectionUpload.style.display = 'none';
    sectionLoading.style.display = 'block';
    step1.classList.remove('active');
    step2.classList.add('active');

    const formData = new FormData();
    selectedFiles.forEach(file => {
        formData.append('invoices', file);
    });

    try {
        const response = await fetch('/api/merge-invoices', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            mergedInvoiceData = result.data;
            localStorage.setItem('mergedInvoiceData', JSON.stringify(mergedInvoiceData));
            renderPreview(mergedInvoiceData);
        } else {
            alert('Errore: ' + (result.error || 'Errore sconosciuto'));
            resetView();
        }
    } catch (e) {
        alert('Errore di connessione: ' + e.message);
        resetView();
    }
});

function renderPreview(data) {
    sectionLoading.style.display = 'none';
    sectionPreview.style.display = 'block';
    step2.classList.remove('active');
    step3.classList.add('active');

    document.getElementById('prev-supplier-name').textContent = data.entity?.name || 'Sconosciuto';
    document.getElementById('prev-supplier-vat').textContent = 'P.IVA/C.F.: ' + (data.entity?.vat_number || '-');
    document.getElementById('prev-date').textContent = data.date || '-';

    const tbody = document.getElementById('prev-articles');
    tbody.innerHTML = '';
    
    let total = 0;

    data.articles.forEach(art => {
        const tr = document.createElement('tr');
        const rigaNetto = art.qty * art.net_price;
        total += rigaNetto;
        
        tr.innerHTML = `
            <td><span class="text-muted" style="font-size: 0.85em;">${art.code || '-'}</span></td>
            <td>${art.name}</td>
            <td class="text-right">${art.qty}</td>
            <td class="text-right">€ ${art.net_price.toFixed(2)}</td>
            <td class="text-right">${art.vat?.value ?? 22}%</td>
            <td class="text-right"><strong>€ ${rigaNetto.toFixed(2)}</strong></td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('prev-total').textContent = `€ ${total.toFixed(2)}`;
}

document.getElementById('btn-reset').addEventListener('click', resetView);

function resetView() {
    selectedFiles = [];
    mergedInvoiceData = null;
    localStorage.removeItem('mergedInvoiceData');
    updateFileList();
    
    sectionUpload.style.display = 'block';
    sectionLoading.style.display = 'none';
    sectionPreview.style.display = 'none';
    document.getElementById('upload-status').style.display = 'none';
    
    step1.classList.add('active');
    step2.classList.remove('active');
    step3.classList.remove('active');
    
    document.getElementById('file-input').value = '';
}

// Upload to FIC
document.getElementById('btn-upload-fic').addEventListener('click', async () => {
    if (!mergedInvoiceData) return;
    
    const statusDiv = document.getElementById('upload-status');
    statusDiv.style.display = 'block';
    statusDiv.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Caricamento in corso...';
    statusDiv.className = 'mt-2 text-center text-muted';
    
    try {
        const response = await fetch('/api/upload-fic', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invoiceData: mergedInvoiceData })
        });
        
        const result = await response.json();
        
        if (result.success) {
            localStorage.removeItem('mergedInvoiceData');
            statusDiv.innerHTML = '<i class="fa-solid fa-check-circle"></i> Fattura caricata con successo su Fatture in Cloud!';
            statusDiv.className = 'mt-4 text-center';
            statusDiv.style.color = 'var(--success)';
            document.getElementById('btn-upload-fic').style.display = 'none';
        } else {
            statusDiv.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Errore: ' + (result.error.error?.message || result.error || 'Errore sconosciuto');
            statusDiv.className = 'mt-4 text-center';
            statusDiv.style.color = 'var(--danger)';
        }
    } catch (e) {
        statusDiv.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Errore di rete: ' + e.message;
        statusDiv.className = 'mt-4 text-center';
        statusDiv.style.color = 'var(--danger)';
    }
});

// Init
checkFICStatus();

// Restore cached preview if available
const cached = localStorage.getItem('mergedInvoiceData');
if (cached) {
    try {
        mergedInvoiceData = JSON.parse(cached);
        sectionUpload.style.display = 'none';
        renderPreview(mergedInvoiceData);
    } catch(e) {
        localStorage.removeItem('mergedInvoiceData');
    }
}
