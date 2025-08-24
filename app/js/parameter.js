// eBRT 2030 Simulation Interface
document.addEventListener('DOMContentLoaded', function () {
    // Load config saved from driveCycleOption
    try {
        const raw = localStorage.getItem('simulationConfig');
        if (raw) {
            const saved = JSON.parse(raw);
            console.log('Loaded simulation config:', saved);
        }
    } catch (e) {
        console.warn('Could not parse saved simulation config', e);
    }

    // Button event handlers
    const homeBtn = document.querySelector('.home-btn');
    const logoutBtn = document.querySelector('.logout-btn');
    const runSimulationBtn = document.querySelector('[data-testid="button-run-simulation"]');
    const motorTypeSelect = document.querySelector('[data-testid="select-motor-type"]');
    const batteryTypeSelect = document.querySelector('[data-testid="select-battery-type"]');

    // Home button click handler
    homeBtn.addEventListener('click', function () {
        console.log('Home button clicked');
        showNotification('Navigating to home...', 'info');
        // Redirect to home page if needed
        // window.location.href = "index.html";
    });

    // Logout button click handler
    logoutBtn.addEventListener('click', function () {
        console.log('Logout button clicked');
        showNotification('Logging out...', 'warning');
        // Add logout functionality here
        // window.location.href = "login.html";
    });

    // Run simulation button click handler
    runSimulationBtn.addEventListener('click', async function () {
        console.log('Run simulation button clicked');

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

            const inputData = {
                simulationConfig: simulationConfig,
                environmentVehicleParams: environmentVehicleParams,
                selections: {
                    motorType: motorTypeSelect ? motorTypeSelect.value : null,
                    batteryType: batteryTypeSelect ? batteryTypeSelect.value : null
                }
            };

            const resp = await fetch('/api/save-input', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: null, inputData: inputData })
            });

            if (!resp.ok) {
                const err = await resp.json().catch(function () { return {}; });
                throw new Error(err.error || 'Failed to save input');
            }

            const data = await resp.json();
            if (data && data.id) {
                try { sessionStorage.setItem('lastSimulationId', data.id); } catch (e) {}
                window.location.href = 'simulationInterface.html?id=' + encodeURIComponent(data.id);
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

    // Function to check if form is complete
    function isFormComplete() {
        // Check if motor type is selected
        if (motorTypeSelect.value === "") {
            return false;
        }

        // Check if battery type is selected
        if (batteryTypeSelect.value === "") {
            return false;
        }

        // Add any other required fields checks here

        return true;
    }

    // Motor type selection handler
    motorTypeSelect.addEventListener('change', function () {
        console.log('Motor type changed to:', this.value);
        updateMotorParameters(this.value);
    });

    // Battery type selection handler
    batteryTypeSelect.addEventListener('change', function () {
        console.log('Battery type changed to:', this.value);
        updateBatteryParameters(this.value);
    });

    // Add hover effects for buttons
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
        button.addEventListener('mouseenter', function () {
            if (!this.disabled) {
                this.style.transform = 'translateY(-1px)';
            }
        });

        button.addEventListener('mouseleave', function () {
            this.style.transform = 'translateY(0)';
        });
    });

    // Add focus effects for dropdowns
    const dropdowns = document.querySelectorAll('.dropdown');
    dropdowns.forEach(dropdown => {
        dropdown.addEventListener('focus', function () {
            this.parentElement.style.transform = 'scale(1.02)';
        });

        dropdown.addEventListener('blur', function () {
            this.parentElement.style.transform = 'scale(1)';
        });
    });

    // Function to update motor parameters based on selection
    function updateMotorParameters(motorType) {
        const motorTable = document.querySelector('.motor-section .table-body');
        // This would typically fetch parameters from a backend
        console.log(`Updating motor parameters for: ${motorType}`);
    }

    // Function to update battery parameters based on selection
    function updateBatteryParameters(batteryType) {
        const batteryTable = document.querySelector('.battery-section .table-body');
        // This would typically fetch parameters from a backend
        console.log(`Updating battery parameters for: ${batteryType}`);
    }

    // Function to show notifications
    function showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        // Style the notification
        notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 20px;
                border-radius: 6px;
                color: white;
                font-size: 14px;
                font-weight: 500;
                z-index: 1000;
                transform: translateX(100%);
                transition: transform 0.3s ease;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            `;

        // Set background color based on type
        const colors = {
            success: '#10b981',
            warning: '#f59e0b',
            error: '#ef4444',
            info: '#14b8a6'
        };
        notification.style.backgroundColor = colors[type] || colors.info;

        // Add to page
        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    // Initialize the interface
    console.log('eBRT 2030 Simulation Interface loaded');

    // Add some sample data to tables
    setTimeout(() => {
        const motorCells = document.querySelectorAll('.motor-section .table-cell');
        const batteryCells = document.querySelectorAll('.battery-section .table-cell');

        if (motorCells.length >= 2) {
            motorCells[0].textContent = 'Power Rating';
            motorCells[1].textContent = '150 kW';
        }

        if (batteryCells.length >= 2) {
            batteryCells[0].textContent = 'Capacity';
            batteryCells[1].textContent = '75 kWh';
        }
    }, 500);
});