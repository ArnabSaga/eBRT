// ===== Drive Cycle Options (updated for new JSON) =====

// Global UI state
let currentDriveCycle = 'WLTC';
let currentDriveCycleId = 1; // matches enums.cycle_types.id for WLTC
let uploadedFile = null;

// Map drive-cycle -> preview image & template
const driveCycleConfigs = {
    WLTC: { image: './assets/img/drive-cycle-option-wltc.png', template: './templates/wltc-template.csv' },
    NEDC: { image: './assets/img/drive-cycle-option-nedc.png', template: './templates/nedc-template.csv' },
    SORT: { image: './assets/img/drive-cycle-option-sort.png', template: './templates/sort-template.csv' },
    VECTO: { image: './assets/img/drive-cycle-option-vecto.png', template: './templates/vecto-template.csv' },
    FTP: { image: './assets/img/drive-cycle-option-ftp.png', template: './templates/ftp-template.csv' },
    Custom: { image: null, template: './templates/custom-template.csv' },
};

// Fallback options if JSON is missing
const DEFAULT_CYCLE_OPTIONS = [
    { id: 1, name: 'WLTC' },
    { id: 2, name: 'NEDC' },
    { id: 3, name: 'SORT' },
    { id: 4, name: 'VECTO' },
    { id: 5, name: 'FTP' },
    { id: 6, name: 'Custom' },
];

// ---- Boot ----
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/json/driveCycleOption.json', { cache: 'no-store' });
        if (!res.ok) throw new Error(`Spec fetch failed: ${res.status}`);
        const spec = await res.json();
        buildUiFromSpec(spec);
    } catch (err) {
        console.warn('Using DEFAULT_CYCLE_OPTIONS. Reason:', err?.message || err);
        fillCycleOptions(DEFAULT_CYCLE_OPTIONS);
    }

    initializePage();
    setupEventListeners();
});

// ---- Build UI from spec (new JSON format) ----
function buildUiFromSpec(spec) {
    const allCycles = Array.isArray(spec?.enums?.cycle_types) ? spec.enums.cycle_types : [];
    // Filter to cycles this screen supports
    const filtered = allCycles.filter(c => ['WLTC', 'NEDC', 'SORT', 'VECTO', 'FTP', 'Custom'].includes(c.name));
    if (filtered.length) {
        fillCycleOptions(filtered);
    } else {
        fillCycleOptions(DEFAULT_CYCLE_OPTIONS);
    }
}

function fillCycleOptions(options) {
    const sel = document.getElementById('cycleTypeSelect');
    if (!sel) return;

    sel.innerHTML = `<option value="" disabled selected>Select a cycle type</option>`;

    options.forEach(opt => {
        const o = document.createElement('option');
        o.value = String(opt.id ?? opt.name);
        o.textContent = opt.name;
        sel.appendChild(o);
    });

    // Default to WLTC if present
    const wltc = options.find(o => o.name === 'WLTC');
    if (wltc) {
        sel.value = String(wltc.id ?? 1);
        currentDriveCycle = 'WLTC';
        currentDriveCycleId = Number(sel.value);
    }
}

// ---- Init & listeners ----
function initializePage() {
    updateDriveCycleImage(currentDriveCycle);
    updateUploadButtonState();

    const dropzone = document.querySelector('.dropzone');
    if (dropzone) dropzone.classList.add('disabled');
    setupDragAndDrop();
}

function setupEventListeners() {
    const cycleTypeSelect = document.getElementById('cycleTypeSelect');
    if (cycleTypeSelect) {
        cycleTypeSelect.addEventListener('change', handleDriveCycleChange);
    }

    const customDriveCheckbox = document.getElementById('customDrive');
    if (customDriveCheckbox) {
        customDriveCheckbox.addEventListener('change', handleCustomDriveChange);
    }

    const simTimeInput = document.getElementById('simTime');
    if (simTimeInput) {
        simTimeInput.addEventListener('input', validateSimulationTime);
        simTimeInput.addEventListener('blur', validateSimulationTime);
    }

    // Submit on Enter (not inside textarea)
    const form = document.querySelector('.form-left');
    if (form) {
        form.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                submitForm();
            }
        });
    }
}

// ---- Handlers ----
function handleDriveCycleChange(event) {
    const id = Number(event.target.value);
    const label = event.target.options[event.target.selectedIndex]?.textContent || '';

    currentDriveCycleId = id;
    currentDriveCycle = label;

    updateDriveCycleImage(label);
    updateUploadButtonState();

    // If not Custom, uncheck & disable custom UI
    if (label !== 'Custom') {
        const cb = document.getElementById('customDrive');
        if (cb) {
            cb.checked = false;
            handleCustomDriveChange();
        }
    }
}

function updateDriveCycleImage(label) {
    const right = document.querySelector('.form-right');
    if (!right) return;

    const cfg = driveCycleConfigs[label];
    if (cfg?.image) {
        const img = new Image();
        img.onload = () => { right.innerHTML = `<img src="${cfg.image}" alt="Drive Cycle Chart - ${label}" />`; };
        img.onerror = () => showDriveCyclePlaceholder(label);
        img.src = cfg.image;
    } else {
        showDriveCyclePlaceholder(label);
    }
}

function showDriveCyclePlaceholder(label) {
    const right = document.querySelector('.form-right');
    if (!right) return;

    if (label === 'Custom') {
        right.innerHTML = `
      <div class="custom-placeholder">
        <div class="custom-icon">📁</div>
        <h3>Custom Drive Cycle</h3>
        <p>Upload your custom drive cycle file to see it displayed here</p>
      </div>`;
    } else {
        right.innerHTML = `
      <div class="drive-cycle-placeholder">
        <div class="placeholder-icon">📊</div>
        <h3>${label} Drive Cycle</h3>
        <p>Drive cycle visualization for ${label}</p>
        <p class="placeholder-note">Image not available</p>
      </div>`;
    }
}

function handleCustomDriveChange() {
    const cb = document.getElementById('customDrive');
    const uploadBtn = document.querySelector('.upload');
    const dropzone = document.querySelector('.dropzone');

    if (!uploadBtn || !cb) return;

    if (cb.checked && currentDriveCycle === 'Custom') {
        uploadBtn.disabled = false;
        uploadBtn.style.opacity = '1';
        uploadBtn.style.cursor = 'pointer';
        if (dropzone) {
            dropzone.classList.add('enabled');
            dropzone.classList.remove('disabled');
        }
    } else {
        uploadBtn.disabled = true;
        uploadBtn.style.opacity = '0.6';
        uploadBtn.style.cursor = 'not-allowed';
        if (dropzone) {
            dropzone.classList.remove('enabled');
            dropzone.classList.add('disabled');
            dropzone.innerHTML = 'Drag & Drop Here';
        }
        uploadedFile = null;
    }
}

function updateUploadButtonState() {
    const cb = document.getElementById('customDrive');
    const uploadBtn = document.querySelector('.upload');
    const dropzone = document.querySelector('.dropzone');

    if (!uploadBtn) return;

    const enable = currentDriveCycle === 'Custom' && cb?.checked;
    uploadBtn.disabled = !enable;
    uploadBtn.style.opacity = enable ? '1' : '0.6';
    uploadBtn.style.cursor = enable ? 'pointer' : 'not-allowed';

    if (dropzone) {
        dropzone.classList.toggle('enabled', enable);
        dropzone.classList.toggle('disabled', !enable);
    }
}

// ---- Drag & Drop + Upload ----
function setupDragAndDrop() {
    const dz = document.querySelector('.dropzone');
    if (!dz) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => {
        dz.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
        document.body.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
    });

    ['dragenter', 'dragover'].forEach(ev => {
        dz.addEventListener(ev, () => {
            const cb = document.getElementById('customDrive');
            if (cb?.checked) dz.classList.add('drag-over');
        }, false);
    });

    ['dragleave', 'drop'].forEach(ev => {
        dz.addEventListener(ev, () => dz.classList.remove('drag-over'), false);
    });

    dz.addEventListener('drop', (e) => {
        const cb = document.getElementById('customDrive');
        if (!cb || !cb.checked) {
            showTemporaryMessage('Please check "CUSTOM DRIVE CYCLE" to upload files', 'warning');
            return;
        }
        const files = e.dataTransfer?.files || [];
        if (files.length) handleFileUpload(files[0]);
    }, false);
}

function uploadFile() {
    if (currentDriveCycle !== 'Custom') {
        alert('Please select "Custom" drive cycle to upload files.');
        return;
    }
    const btn = document.querySelector('.upload');
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.txt,.xlsx,.xls';
    input.onchange = (e) => {
        const f = e.target.files?.[0];
        if (f) handleFileUpload(f);
        if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
    };
    input.click();
}

function handleFileUpload(file) {
    const allowed = [
        'text/csv', 'text/plain',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel'
    ];
    if (!allowed.includes(file.type) && !/\.(csv|txt|xlsx|xls)$/i.test(file.name)) {
        alert('Please select a valid file type (.csv, .txt, .xlsx, .xls)');
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        return;
    }

    uploadedFile = file;

    const dz = document.querySelector('.dropzone');
    if (dz) {
        dz.innerHTML = `
      <div class="upload-success">
        <div class="file-info">
          <span class="file-icon">📄</span>
          <span class="file-name">${file.name}</span>
        </div>
        <button class="remove-file" onclick="removeUploadedFile()">✕</button>
      </div>`;
    }
    showSuccessMessage('Your custom drive cycle has been successfully uploaded.');
    updateUploadButtonState();
}

function removeUploadedFile() {
    uploadedFile = null;
    const dz = document.querySelector('.dropzone');
    if (dz) dz.innerHTML = 'Drag & Drop Here';
    updateUploadButtonState();
}

// ---- Template download ----
function downloadTemplate() {
    const cfg = driveCycleConfigs[currentDriveCycle];
    if (!cfg?.template) {
        alert('Template not available for this drive cycle type.');
        return;
    }
    const btn = document.querySelector('.template');
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }

    const link = document.createElement('a');
    link.href = cfg.template;
    link.download = `${currentDriveCycle.toLowerCase()}-template.csv`;
    try {
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showSuccessMessage('Template downloaded successfully!');
    } catch {
        downloadCSVTemplate();
        showSuccessMessage('Template generated and downloaded!');
    } finally {
        setTimeout(() => {
            if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
        }, 800);
    }
}

function downloadCSVTemplate() {
    const csv = `Time(s),Speed(km/h),Acceleration(m/s²)
0,0,0
10,20,2
20,40,2
30,60,2
40,80,2
50,100,2
60,80,-2
70,60,-2
80,40,-2
90,20,-2
100,0,-2`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentDriveCycle.toLowerCase()}-template.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ---- Validation ----
function validateSimulationTime() {
    const el = document.getElementById('simTime');
    if (!el) return;
    const v = el.value.trim();
    if (!v) { el.style.borderColor = '#01A79D'; el.setCustomValidity(''); return; }
    if (isNaN(v) || Number(v) <= 0) {
        el.style.borderColor = '#ff0000';
        el.setCustomValidity('Please enter a valid positive number');
    } else {
        el.style.borderColor = '#01A79D';
        el.setCustomValidity('');
    }
}

// ---- Messages ----
function showSuccessMessage(message) {
    const div = document.createElement('div');
    div.className = 'success-message';
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

function showTemporaryMessage(message, type = 'info') {
    const div = document.createElement('div');
    div.className = `temporary-message ${type}`;
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 2000);
}

// ---- Submit ----
function submitForm() {
    const simTimeEl = document.getElementById('simTime');
    const sel = document.getElementById('cycleTypeSelect');

    const simTime = simTimeEl?.value.trim();
    if (!simTime || isNaN(simTime) || Number(simTime) <= 0) {
        alert('Please enter a valid positive number for simulation time.');
        simTimeEl?.focus();
        return;
    }
    if (!sel?.value) {
        alert('Please select a drive cycle type.');
        sel?.focus();
        return;
    }

    // Determine Cycle_Type id & label
    const cycleId = Number(sel.value);
    const cycleLabel = sel.options[sel.selectedIndex]?.textContent || '';

    // ---- Rules engine (subset relevant to this page) ----
    // AltitudeRule:
    //  - Standard (1..5): Altitude_m = 0
    //  - Custom (6): if not provided (we don't collect it here) -> Altitude_m = 0 (scalar)
    //  - City_Specific (0): not handled on this page (omit later in the final payload builder)
    let altitudeForPayload = 0; // scalar 0 by default

    // We don’t expose altitude UI here, so Custom also becomes 0 if user doesn’t add altitude elsewhere.
    // City_Specific is not selectable on this screen, so nothing to do.

    // Scenario visibility (inform next screen): visible only for standard cycles (1..5)
    const isStandardCycle = cycleId >= 1 && cycleId <= 5;

    // Build a compact object for the next step/page to merge
    const driveCycleConfig = {
        simulationTime: Number(simTime),
        driveCycleTypeId: cycleId,     // matches enums.cycle_types.id
        driveCycleType: cycleLabel,    // human label
        customFile: uploadedFile ? uploadedFile.name : null,
        rules: {
            altitude_m: altitudeForPayload,
            scenario_visible: isStandardCycle
        }
    };

    try {
        localStorage.setItem('driveCycleConfig', JSON.stringify(driveCycleConfig));
        showSuccessMessage('Form submitted successfully! Redirecting...');
        setTimeout(() => { window.location.href = 'environmentVehicleParameters.html'; }, 1200);
    } catch (e) {
        console.warn('Unable to persist config to localStorage', e);
        window.location.href = 'environmentVehicleParameters.html';
    }
}

// Expose a few functions to inline handlers
window.uploadFile = uploadFile;
window.removeUploadedFile = removeUploadedFile;
window.downloadTemplate = downloadTemplate;
window.submitForm = submitForm;
