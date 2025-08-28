// environmentVehicleParameters.js (updated for new JSON)

// ---------- CONFIG ----------
const SPEC_URL = '/json/driveCycleOption.json';

// Map DOM ids -> backend keys (Environment & Vehicle)
const FIELD_MAP = {
    // Environment_data
    'windspeed': { group: 'Environment_data', key: 'WindSpeed_ms', type: 'slider' },
    'humidity': { group: 'Environment_data', key: 'Humidity_pct', type: 'slider' },
    'avg-temp': { group: 'Environment_data', key: 'AvgTemp_C', type: 'slider' },
    'cabin-temp': { group: 'Environment_data', key: 'CabinTempRef_C', type: 'slider' },

    // Vehicle_data
    'vehicle-mass': { group: 'Vehicle_data', key: 'VehicleMass_kg', type: 'number' },
    'wheel-radius': { group: 'Vehicle_data', key: 'WheelRadius_m', type: 'number' },
    'drag-coefficient': { group: 'Vehicle_data', key: 'AirDragCoeff', type: 'number' },
    'rolling-resistance': { group: 'Vehicle_data', key: 'RollResist', type: 'number' },

};

// Friendly labels for error messages
const LABELS = {
    'windspeed': 'Wind Speed (m/s)',
    'humidity': 'Humidity (%)',
    'avg-temp': 'Average Temp (°C)',
    'cabin-temp': 'Cabin Temp Ref (°C)',
    'vehicle-mass': 'Vehicle Mass (kg)',
    'wheel-radius': 'Wheel Radius (m)',
    'drag-coefficient': 'Air Drag Coefficient',
    'rolling-resistance': 'Rolling Resistance Coeff.',
};

// Will hold spec + ranges/defaults
let SPEC = null;
let RANGES = {};   // backendKey -> {min,max,step}
let DEFAULTS = {}; // backendKey -> default value (from backend_payload_template)

// ----------------------------------------------------

document.addEventListener('DOMContentLoaded', async function () {
    const nextBtn = document.getElementById('nextButton');
    if (!nextBtn) return;

    await loadSpecAndPrepare();

    initializeInputValidation();
    initializeFormInteractions();
    initializeSliders();
    initializeButtonInteractions();
    setupKeyboardNavigation();

    nextBtn.addEventListener('click', function () {
        if (!validateAllFields()) return;

        try {
            const data = collectFormData(); // returns { Environment_data:{...}, Vehicle_data:{...} }
            localStorage.setItem('environmentVehicleParams', JSON.stringify(data));
            showNotification('Form submitted successfully! Redirecting...', 'success');
            setTimeout(() => { window.location.href = 'parameter.html'; }, 1200);
        } catch (e) {
            console.warn('Failed to save environment/vehicle params', e);
            showNotification('Failed to save data. Please try again.', 'error');
        }
    });
});

// ---------- Load spec, build ranges & defaults, seed inputs ----------
async function loadSpecAndPrepare() {
    try {
        const res = await fetch(SPEC_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error(`spec ${res.status}`);
        SPEC = await res.json();
    } catch (e) {
        console.warn('Could not fetch spec; proceeding with hardcoded fallbacks', e);
        SPEC = null;
    }

    // Build RANGES from ui_schema
    const envFields = SPEC?.ui_schema?.Environment_data?.fields || [];
    const vehFields = SPEC?.ui_schema?.Vehicle_data?.fields || [];

    const addRange = (field) => {
        if (!field?.backend_key) return;
        if (field.type === 'slider') {
            RANGES[field.backend_key] = { min: field.min ?? null, max: field.max ?? null, step: field.step ?? null };
        }
    };
    envFields.forEach(addRange);
    vehFields.forEach(addRange);

    // Collect defaults from backend_payload_template
    const tpl = SPEC?.backend_payload_template || {};
    DEFAULTS = {
        ...(tpl.Environment_data || {}),
        ...(tpl.Vehicle_data || {}),
    };

    // Seed UI inputs with defaults if empty
    Object.entries(FIELD_MAP).forEach(([id, meta]) => {
        const el = document.getElementById(id);
        if (!el) return;

        const backendKey = meta.key;
        const def = DEFAULTS[backendKey];

        // Set min/max/step for sliders when in spec
        if (meta.type === 'slider' && RANGES[backendKey]) {
            const { min, max, step } = RANGES[backendKey];
            if (min != null) el.min = min;
            if (max != null) el.max = max;
            if (step != null) el.step = step;
        }

        // If empty, seed default
        if (el.value === '' || el.value == null) {
            if (def != null) el.value = def;
        }
    });
}

// ---------- Validation ----------
function initializeInputValidation() {
    // Hook up validation based on RANGES for environment sliders
    bindRangeValidation('windspeed', 'WindSpeed_ms');
    bindRangeValidation('humidity', 'Humidity_pct');
    bindRangeValidation('avg-temp', 'AvgTemp_C');
    bindRangeValidation('cabin-temp', 'CabinTempRef_C');

    // Vehicle numbers must be >= 0
    ['vehicle-mass', 'wheel-radius', 'drag-coefficient', 'rolling-resistance'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => validatePositiveNumber(el, LABELS[id]));
        el.addEventListener('blur', () => validatePositiveNumber(el, LABELS[id]));
    });
}

function bindRangeValidation(inputId, backendKey) {
    const el = document.getElementById(inputId);
    if (!el) return;

    const range = RANGES[backendKey] || {};
    const min = (range.min != null) ? Number(range.min) : (backendKey === 'Humidity_pct' ? 0 : 0);
    const max = (range.max != null) ? Number(range.max) : (backendKey === 'Humidity_pct' ? 100 : 100);

    const handler = () => validateRange(el, LABELS[inputId], min, max);
    el.addEventListener('input', handler);
    el.addEventListener('blur', handler);
}

function validateRange(input, label, min, max) {
    const v = parseFloat(input.value);
    if (input.value === '') {
        setInputInvalid(input, `Please enter ${label}`);
        return false;
    }
    if (isNaN(v)) {
        setInputInvalid(input, 'Please enter a valid number');
        return false;
    }
    if (v < min || v > max) {
        setInputInvalid(input, `${label} must be between ${min} and ${max}`);
        return false;
    }
    setInputValid(input);
    return true;
}

function validatePositiveNumber(input, label) {
    const v = parseFloat(input.value);
    if (input.value === '') {
        setInputInvalid(input, `Please enter ${label}`);
        return false;
    }
    if (isNaN(v)) {
        setInputInvalid(input, 'Please enter a valid number');
        return false;
    }
    if (v < 0) {
        setInputInvalid(input, `${label} must be positive`);
        return false;
    }
    setInputValid(input);
    return true;
}

function setInputValid(input) {
    input.classList.remove('invalid'); input.classList.add('valid');
    input.style.borderColor = input.classList.contains('number-input-vehicle') ? '#F4A63B' : '#01A79D';
    input.style.boxShadow = input.classList.contains('number-input-vehicle')
        ? '0 0 0 2px rgba(189,130,42,0.2)'
        : '0 0 0 2px rgba(42,184,143,0.2)';
    removeErrorMessage(input);
}

function setInputInvalid(input, message) {
    input.classList.remove('valid'); input.classList.add('invalid');
    input.style.borderColor = '#e74c3c';
    input.style.boxShadow = '0 0 0 2px rgba(231,76,60,0.2)';
    removeErrorMessage(input);
    addErrorMessage(input, message);
}

function addErrorMessage(input, message) {
    const fieldGroup = input.closest('.field-group') || input.parentElement;
    if (!fieldGroup) return;
    removeErrorMessage(input);
    const div = document.createElement('div');
    div.className = 'error-message';
    div.textContent = message;
    div.style.cssText = 'color:#e74c3c;font-size:.8em;margin-top:5px;font-weight:500;animation:fadeIn .3s ease;';
    fieldGroup.appendChild(div);
}

function removeErrorMessage(input) {
    const fieldGroup = input.closest('.field-group') || input.parentElement;
    if (!fieldGroup) return;
    const node = fieldGroup.querySelector('.error-message');
    if (node) node.remove();
}

function validateAllFields() {
    let ok = true; const errs = [];

    // Environment with ranges
    ok &= validateRangeById('windspeed', 'WindSpeed_ms', errs);
    ok &= validateRangeById('humidity', 'Humidity_pct', errs);
    ok &= validateRangeById('avg-temp', 'AvgTemp_C', errs);
    ok &= validateRangeById('cabin-temp', 'CabinTempRef_C', errs);

    // Vehicle numbers
    ['vehicle-mass', 'wheel-radius', 'drag-coefficient', 'rolling-resistance'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (!validatePositiveNumber(el, LABELS[id])) { ok = false; errs.push(`${LABELS[id]}: Invalid value`); }
    });

    if (!ok) showNotification(`Please fix the following errors:\n${errs.filter(Boolean).join('\n')}`, 'error');
    return !!ok;
}

function validateRangeById(id, backendKey, errs) {
    const el = document.getElementById(id);
    if (!el) return true;
    const range = RANGES[backendKey] || {};
    const min = (range.min != null) ? Number(range.min) : 0;
    const max = (range.max != null) ? Number(range.max) : 100;
    const ok = validateRange(el, LABELS[id], min, max);
    if (!ok) errs.push(`${LABELS[id]}: Invalid value`);
    return ok;
}

// ---------- Collect & shape data (backend keys) ----------
function collectFormData() {
    const env = {};
    const veh = {};

    // Start with backend defaults (so unspecified fields inherit)
    Object.assign(env, SPEC?.backend_payload_template?.Environment_data || {});
    Object.assign(veh, SPEC?.backend_payload_template?.Vehicle_data || {});

    // Overwrite with current UI values (only mapped fields)
    Object.entries(FIELD_MAP).forEach(([id, meta]) => {
        const el = document.getElementById(id);
        if (!el) return;
        const val = el.value === '' ? null : Number(el.value);
        if (val == null || Number.isNaN(val)) return;

        if (meta.group === 'Environment_data') env[meta.key] = val;
        else if (meta.group === 'Vehicle_data') veh[meta.key] = val;
    });

    // Ensure constants required by backend exist (if not in UI)
    // They were seeded from backend_payload_template above.

    return {
        Environment_data: env,
        Vehicle_data: veh
    };
}

// ---------- UI niceties (unchanged behaviors) ----------
function initializeFormInteractions() {
    const inputs = document.querySelectorAll('.number-input');
    inputs.forEach(input => {
        input.addEventListener('focus', function () {
            if (!this.classList.contains('invalid')) {
                if (this.classList.contains('number-input-vehicle')) {
                    this.style.borderColor = '#F4A63B';
                    this.style.boxShadow = '0 0 0 2px rgba(189,130,42,0.2)';
                } else {
                    this.style.borderColor = '#01A79D';
                    this.style.boxShadow = '0 0 0 2px rgba(42,184,143,0.2)';
                }
            }
        });
        input.addEventListener('blur', function () {
            if (!this.classList.contains('invalid') && !this.classList.contains('valid')) {
                this.style.boxShadow = 'none';
                this.style.borderColor = this.classList.contains('number-input-vehicle') ? '#F4A63B' : '#01A79D';
            }
        });
        input.addEventListener('input', function () {
            this.classList.remove('valid', 'invalid');
            this.style.boxShadow = this.classList.contains('number-input-vehicle')
                ? '0 0 0 2px rgba(189,130,42,0.2)'
                : '0 0 0 2px rgba(42,184,143,0.2)';
            removeErrorMessage(this);
        });
    });
}

function showNotification(message, type = 'info') {
    document.querySelectorAll('.notification').forEach(n => n.remove());
    const el = document.createElement('div');
    el.className = `notification notification-${type}`;
    el.textContent = message;
    el.style.cssText = `
    position:fixed;top:20px;right:20px;padding:15px 20px;border-radius:8px;color:#fff;
    font-weight:500;z-index:1000;transform:translateX(100%);transition:transform .3s ease;
    box-shadow:0 4px 12px rgba(0,0,0,.15);font-family:'Segoe UI',sans-serif;max-width:420px;white-space:pre-line;`;
    el.style.backgroundColor = (type === 'success') ? '#01A79D' : (type === 'error' ? '#e74c3c' : '#3498db');
    document.body.appendChild(el);
    setTimeout(() => { el.style.transform = 'translateX(0)'; }, 80);
    setTimeout(() => {
        el.style.transform = 'translateX(100%)';
        setTimeout(() => el.remove(), 300);
    }, type === 'error' ? 5000 : 3000);
}

function initializeSliders() {
    const sliders = document.querySelectorAll('.slider');
    sliders.forEach(slider => {
        const valueDisplay = createValueDisplay(slider);
        updateSliderBackground(slider);
        slider.addEventListener('input', function () {
            updateSliderBackground(this);
            updateValueDisplay(valueDisplay, this.value);
        });
        slider.addEventListener('blur', function () {
            setTimeout(() => { valueDisplay.style.opacity = '0'; }, 800);
        });
    });
}

function createValueDisplay(slider) {
    const display = document.createElement('div');
    display.className = 'slider-value';
    display.textContent = slider.value;
    display.style.cssText = `
    position:absolute;top:-25px;right:0;background:#01A79D;color:#fff;padding:2px 6px;border-radius:3px;
    font-size:.8em;font-weight:500;opacity:0;transition:opacity .2s ease;pointer-events:none;z-index:10;`;
    const container = slider.closest('.slider-wrapper') || slider.parentElement;
    container.style.position = 'relative';
    container.appendChild(display);
    return display;
}

function updateSliderBackground(slider) {
    const value = Number(slider.value || 0);
    const max = Number(slider.max || 100);
    const pct = Math.max(0, Math.min(100, (value / max) * 100));
    const color = slider.classList.contains('battery-slider') ? '#FBB040' : '#01A79D';
    slider.style.background = `linear-gradient(to right, ${color} 0%, ${color} ${pct}%, #DDDDDD ${pct}%, #DDDDDD 100%)`;
}

function updateValueDisplay(display, value) {
    display.textContent = value;
    display.style.opacity = '1';
}

function initializeButtonInteractions() {
    const homeBtn = document.querySelector('.home-btn');
    const logoutBtn = document.querySelector('.logout-btn');
    if (homeBtn) homeBtn.addEventListener('click', () => showNotification('Navigating to Home...', 'info'));
    if (logoutBtn) logoutBtn.addEventListener('click', () => showNotification('Logging out...', 'info'));
}

function setupKeyboardNavigation() {
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
            const nextInput = event.target.closest('.field-group')?.nextElementSibling?.querySelector('input,select,button');
            if (nextInput) nextInput.focus();
            else document.getElementById('nextButton')?.click();
        }
    });
}

// Inject minimal CSS used by this script
const style = document.createElement('style');
style.textContent = `
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.number-input-environment.valid{border-color:#01A79D!important;box-shadow:0 0 0 2px rgba(42,184,143,.2)!important}
.number-input-environment.invalid{border-color:#e74c3c!important;box-shadow:0 0 0 2px rgba(231,76,60,.2)!important}
.number-input-vehicle.valid{border-color:#F4A63B!important;box-shadow:0 0 0 2px rgba(189,130,42,.2)!important}
.number-input-vehicle.invalid{border-color:#e74c3c!important;box-shadow:0 0 0 2px rgba(231,76,60,.2)!important}
.field-group{position:relative}
.error-message{color:#e74c3c;font-size:.8em;margin-top:5px;font-weight:500;animation:fadeIn .3s ease}
.slider-value{position:absolute;top:-25px;right:0;background:#01A79D;color:#fff;padding:2px 6px;border-radius:3px;font-size:.8em;font-weight:500;opacity:0;transition:opacity .2s ease;pointer-events:none;z-index:10}
`;
document.head.appendChild(style);
