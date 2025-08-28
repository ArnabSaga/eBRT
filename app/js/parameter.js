// parameter.js — updated to consume new JSON and store backend ids

document.addEventListener('DOMContentLoaded', async function () {
    // ===== Try to load any previously saved config (safe log only) =====
    try {
        const raw = localStorage.getItem('simulationConfig');
        if (raw) console.log('Loaded simulation config:', JSON.parse(raw));
    } catch (e) {
        console.warn('Could not parse saved simulation config', e);
    }

    // ===== Elements =====
    const homeBtn = document.querySelector('.home-btn');
    const logoutBtn = document.querySelector('.logout-btn');
    const runSimulationBtn = document.querySelector('[data-testid="button-run-simulation"]');
    const motorTypeSelect = document.querySelector('[data-testid="select-motor-type"]');
    const batteryTypeSelect = document.querySelector('[data-testid="select-battery-type"]');
    const motorTableBody = document.querySelector('.motor-section .table-body');
    const batteryTableBody = document.querySelector('.battery-section .table-body');

    // ===== Data for parameter tables (examples; adjust as needed) =====
    const MOTOR_PARAMS = {
        'Induction Motor': {
            'Power Rating (kW)': '150',
            'Efficiency (%)': '92',
            'Rated Torque (Nm)': '900',
            'Max RPM': '8000',
            'Cooling': 'Liquid'
        },
        'Synchronous Motor': {
            'Power Rating (kW)': '160',
            'Efficiency (%)': '94',
            'Rated Torque (Nm)': '950',
            'Max RPM': '9000',
            'Cooling': 'Liquid'
        },
        'Permanent Magnet Synchronous Motor': {
            'Power Rating (kW)': '180',
            'Efficiency (%)': '96',
            'Rated Torque (Nm)': '1000',
            'Max RPM': '10000',
            'Cooling': 'Liquid'
        }
    };

    const BATTERY_PARAMS = {
        'NMC Battery': {
            'Capacity (kWh)': '75',
            'Nominal Voltage (V)': '400',
            'Max Discharge (C)': '3',
            'Peak Discharge (C, 10s)': '5',
            'Cycle Life (80% SoH)': '1500'
        },
        'LFP Battery': {
            'Capacity (kWh)': '70',
            'Nominal Voltage (V)': '355',
            'Max Discharge (C)': '2',
            'Peak Discharge (C, 10s)': '4',
            'Cycle Life (80% SoH)': '3000'
        },
        'LTO Battery': {
            'Capacity (kWh)': '55',
            'Nominal Voltage (V)': '320',
            'Max Discharge (C)': '5',
            'Peak Discharge (C, 10s)': '8',
            'Cycle Life (80% SoH)': '7000'
        }
    };

    // ===== Pull enums from JSON and populate dropdowns =====
    let enumsFromSpec = { motor_types: [], battery_chemistry: [] };

    try {
        const res = await fetch('/json/driveCycleOption.json', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const spec = await res.json();
        enumsFromSpec.motor_types = spec?.enums?.motor_types || [];
        enumsFromSpec.battery_chemistry = spec?.enums?.battery_chemistry || [];
    } catch (e) {
        console.warn('Could not load enums from spec; falling back to static options', e);
        // If the JSON could not be loaded, we still let the user pick from the hardcoded HTML options.
    }

    // Helper to (re)build a select from enums (id = backend id, name = label)
    function buildSelect(selectEl, items) {
        if (!selectEl || !Array.isArray(items) || !items.length) return;
        // Preserve the first placeholder option if present
        const firstOption = selectEl.querySelector('option[disabled][selected]')?.outerHTML || '';
        selectEl.innerHTML = firstOption || '<option value="" disabled selected>Select</option>';
        items.forEach(({ id, name }) => {
            const opt = document.createElement('option');
            // Store BACKEND ID in value, and show label in UI
            opt.value = String(id);
            opt.textContent = name;
            // Also keep label in data-label for table rendering
            opt.dataset.label = name;
            selectEl.appendChild(opt);
        });
    }

    // Populate selects from spec if available
    if (enumsFromSpec.motor_types.length) buildSelect(motorTypeSelect, enumsFromSpec.motor_types);
    if (enumsFromSpec.battery_chemistry.length) buildSelect(batteryTypeSelect, enumsFromSpec.battery_chemistry);

    // ===== Helpers =====
    function clearTable(sectionBodyEl) {
        if (!sectionBodyEl) return;
        sectionBodyEl.innerHTML = '';
    }

    function renderParams(sectionBodyEl, paramsObj) {
        clearTable(sectionBodyEl);
        if (!paramsObj || !sectionBodyEl) return;
        Object.entries(paramsObj).forEach(([key, val]) => {
            const k = document.createElement('div');
            k.className = 'table-cell';
            k.textContent = key;
            const v = document.createElement('div');
            v.className = 'table-cell';
            v.textContent = val;
            sectionBodyEl.appendChild(k);
            sectionBodyEl.appendChild(v);
        });
    }

    function isFormComplete() {
        return !!(motorTypeSelect?.value && batteryTypeSelect?.value);
    }

    function showNotification(message, type = 'info') {
        const n = document.createElement('div');
        n.className = `notification notification-${type}`;
        n.textContent = message;
        n.style.cssText = `
            position: fixed; top: 20px; right: 20px; padding: 12px 20px; border-radius: 6px;
            color: #fff; font-size: 14px; font-weight: 500; z-index: 1000;
            transform: translateX(100%); transition: transform .3s ease;
            box-shadow: 0 4px 12px rgba(0,0,0,.15);
        `;
        const colors = { success: '#10b981', warning: '#f59e0b', error: '#ef4444', info: '#14b8a6' };
        n.style.backgroundColor = colors[type] || colors.info;
        document.body.appendChild(n);
        setTimeout(() => { n.style.transform = 'translateX(0)'; }, 80);
        setTimeout(() => {
            n.style.transform = 'translateX(100%)';
            setTimeout(() => n.remove(), 280);
        }, 3000);
    }

    // ===== Event Handlers =====
    homeBtn?.addEventListener('click', () => {
        showNotification('Navigating to home...', 'info');
        // window.location.href = "index.html";
    });

    logoutBtn?.addEventListener('click', () => {
        showNotification('Logging out...', 'warning');
        // window.location.href = "login.html";
    });

    runSimulationBtn?.addEventListener('click', async function () {
        if (!isFormComplete()) {
            showNotification('Please fill all required information', 'error');
            return;
        }

        showNotification('Preparing simulation...', 'success');
        this.disabled = true;
        this.textContent = 'RUNNING...';
        this.style.opacity = '0.7';

        try {
            const configRaw = localStorage.getItem('simulationConfig');
            const envVehRaw = localStorage.getItem('environmentVehicleParams');
            const simulationConfig = configRaw ? JSON.parse(configRaw) : {};
            const environmentVehicleParams = envVehRaw ? JSON.parse(envVehRaw) : {};

            // Store both id (backend) and label (for UI/readability)
            const motorOpt = motorTypeSelect.options[motorTypeSelect.selectedIndex];
            const batteryOpt = batteryTypeSelect.options[batteryTypeSelect.selectedIndex];

            const selections = {
                motorTypeId: motorTypeSelect.value ? Number(motorTypeSelect.value) : null,
                motorTypeLabel: motorOpt?.dataset?.label || motorOpt?.textContent || null,
                batteryTypeId: batteryTypeSelect.value ? Number(batteryTypeSelect.value) : null,
                batteryTypeLabel: batteryOpt?.dataset?.label || batteryOpt?.textContent || null
            };

            const inputData = {
                simulationConfig,
                environmentVehicleParams,
                selections
            };

            const resp = await fetch('/api/save-input', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: null, inputData })
            });

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to save input');
            }

            const data = await resp.json();
            if (data && data.id) {
                try { sessionStorage.setItem('lastSimulationId', data.id); } catch { }
                
                // Show success message and redirect to output page
                showNotification('Simulation started successfully! Redirecting to results...', 'success');
                
                // Wait a moment for user to see the message, then redirect
                setTimeout(() => {
                    window.location.href = 'simulationOutput.html?id=' + encodeURIComponent(data.id);
                }, 1500);
            } else {
                throw new Error('Invalid response from server');
            }
        } catch (e) {
            console.error(e);
            showNotification('Error: ' + (e.message || 'Unable to start simulation'), 'error');
            this.disabled = false;
            this.textContent = 'RUN SIMULATION';
            this.style.opacity = '1';
        }
    });

    // Update tables when selects change (use label to look up pretty table)
    motorTypeSelect?.addEventListener('change', function () {
        const opt = this.options[this.selectedIndex];
        const label = opt?.dataset?.label || opt?.textContent || '';
        renderParams(motorTableBody, MOTOR_PARAMS[label] || null);
    });

    batteryTypeSelect?.addEventListener('change', function () {
        const opt = this.options[this.selectedIndex];
        const label = opt?.dataset?.label || opt?.textContent || '';
        renderParams(batteryTableBody, BATTERY_PARAMS[label] || null);
    });

    // Micro-interactions
    document.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('mouseenter', function () { if (!this.disabled) this.style.transform = 'translateY(-1px)'; });
        btn.addEventListener('mouseleave', function () { this.style.transform = 'translateY(0)'; });
    });

    document.querySelectorAll('.dropdown').forEach(dd => {
        dd.addEventListener('focus', function () { this.parentElement.style.transform = 'scale(1.02)'; });
        dd.addEventListener('blur', function () { this.parentElement.style.transform = 'scale(1)'; });
    });

    console.log('eBRT 2030 Simulation Interface loaded');
});
