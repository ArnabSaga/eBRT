document.addEventListener('DOMContentLoaded', function () {
    const nextBtn = document.getElementById('nextButton');
    if (!nextBtn) return;

    // Initialize all functionality
    initializeApp();
});

function initializeApp() {
    // Initialize validation for all input fields
    initializeInputValidation();
    
    // Initialize form interactions
    initializeFormInteractions();
    
    // Initialize sliders
    initializeSliders();
    
    // Initialize button interactions
    initializeButtonInteractions();
    
    // Setup keyboard navigation
    setupKeyboardNavigation();

    // Setup next button
    const nextBtn = document.getElementById('nextButton');
    if (nextBtn) {
        nextBtn.addEventListener('click', function () {
            if (validateAllFields()) {
                try {
                    const data = collectFormData();
                    localStorage.setItem('environmentVehicleParams', JSON.stringify(data));
                    
                    // Show success message and redirect
                    showNotification('Form submitted successfully! Redirecting...', 'success');
                    setTimeout(() => {
                        window.location.href = 'parameter.html';
                    }, 1500);
                } catch (e) {
                    console.warn('Failed to save environment/vehicle params', e);
                    showNotification('Failed to save data. Please try again.', 'error');
                }
            }
        });
    }
}

function initializeInputValidation() {
    // Humidity validation (-5 to 35)
    const humidityInput = document.getElementById('humidity');
    if (humidityInput) {
        humidityInput.addEventListener('input', function() {
            validateHumidity(this);
        });
        humidityInput.addEventListener('blur', function() {
            validateHumidity(this);
        });
    }

    // Daylight validation (0 to 24)
    const daylightInput = document.getElementById('daylight');
    if (daylightInput) {
        daylightInput.addEventListener('input', function() {
            validateDaylight(this);
        });
        daylightInput.addEventListener('blur', function() {
            validateDaylight(this);
        });
    }

    // Vehicle parameter validations (positive numbers only)
    const vehicleFields = [
        'rolling-resistance',
        'wheel-radius', 
        'cross-section',
        'vehicle-mass',
        'drag-coefficient'
    ];

    vehicleFields.forEach(fieldId => {
        const input = document.getElementById(fieldId);
        if (input) {
            input.addEventListener('input', function() {
                validatePositiveNumber(this);
            });
            input.addEventListener('blur', function() {
                validatePositiveNumber(this);
            });
        }
    });
}

function validateHumidity(input) {
    const value = parseFloat(input.value);
    const min = -5;
    const max = 35;
    
    if (input.value === '') {
        setInputValid(input, 'Please enter humidity value');
        return false;
    }
    
    if (isNaN(value)) {
        setInputInvalid(input, 'Please enter a valid number');
        return false;
    }
    
    if (value < min || value > max) {
        setInputInvalid(input, `Humidity must be between ${min} and ${max}`);
        return false;
    }
    
    setInputValid(input);
    return true;
}

function validateDaylight(input) {
    const value = parseFloat(input.value);
    const min = 0;
    const max = 24;
    
    if (input.value === '') {
        setInputValid(input, 'Please enter daylight hours');
        return false;
    }
    
    if (isNaN(value)) {
        setInputInvalid(input, 'Please enter a valid number');
        return false;
    }
    
    if (value < min || value > max) {
        setInputInvalid(input, `Daylight hours must be between ${min} and ${max}`);
        return false;
    }
    
    setInputValid(input);
    return true;
}

function validatePositiveNumber(input) {
    const value = parseFloat(input.value);
    
    if (input.value === '') {
        setInputValid(input, `Please enter ${input.placeholder.toLowerCase()}`);
        return false;
    }
    
    if (isNaN(value)) {
        setInputInvalid(input, 'Please enter a valid number');
        return false;
    }
    
    if (value < 0) {
        setInputInvalid(input, 'Value must be positive');
        return false;
    }
    
    setInputValid(input);
    return true;
}

function setInputValid(input, message = '') {
    input.classList.remove('invalid');
    input.classList.add('valid');
    input.style.borderColor = '#2AB88F';
    input.style.boxShadow = '0 0 0 2px rgba(42, 184, 143, 0.2)';
    
    // Remove any existing error message
    removeErrorMessage(input);
}

function setInputInvalid(input, message) {
    input.classList.remove('valid');
    input.classList.add('invalid');
    input.style.borderColor = '#e74c3c';
    input.style.boxShadow = '0 0 0 2px rgba(231, 76, 60, 0.2)';
    
    // Remove any existing success indicator
    removeSuccessIndicator(input);
    
    // Add error message
    addErrorMessage(input, message);
}

function addErrorMessage(input, message) {
    // Remove existing error message first
    removeErrorMessage(input);
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    errorDiv.style.cssText = `
        color: #e74c3c;
        font-size: 0.8em;
        margin-top: 5px;
        font-weight: 500;
        animation: fadeIn 0.3s ease;
    `;
    
    const fieldGroup = input.closest('.field-group');
    if (fieldGroup) {
        fieldGroup.appendChild(errorDiv);
    }
}

function removeErrorMessage(input) {
    const fieldGroup = input.closest('.field-group');
    if (fieldGroup) {
        const existingError = fieldGroup.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }
    }
}

// Success indicator functions removed - no longer needed

function validateAllFields() {
    let isValid = true;
    const errorMessages = [];
    
    // Validate humidity
    const humidityInput = document.getElementById('humidity');
    if (humidityInput && !validateHumidity(humidityInput)) {
        isValid = false;
        errorMessages.push('Humidity: Invalid value');
    }
    
    // Validate daylight
    const daylightInput = document.getElementById('daylight');
    if (daylightInput && !validateDaylight(daylightInput)) {
        isValid = false;
        errorMessages.push('Daylight: Invalid value');
    }
    
    // Validate vehicle parameters
    const vehicleFields = [
        'rolling-resistance',
        'wheel-radius', 
        'cross-section',
        'vehicle-mass',
        'drag-coefficient'
    ];
    
    vehicleFields.forEach(fieldId => {
        const input = document.getElementById(fieldId);
        if (input && !validatePositiveNumber(input)) {
            isValid = false;
            const fieldName = input.id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            errorMessages.push(`${fieldName}: Invalid value`);
        }
    });
    
    if (!isValid) {
        showNotification(`Please fix the following errors:\n${errorMessages.join('\n')}`, 'error');
    }
    
    return isValid;
}

function collectFormData() {
    const data = {};
    
    // Collect slider values
    const sliders = document.querySelectorAll('.slider');
    sliders.forEach(slider => {
        data[slider.id] = slider.value;
    });
    
    // Collect number input values
    const numberInputs = document.querySelectorAll('.number-input');
    numberInputs.forEach(input => {
        data[input.id] = input.value;
    });
    
    return data;
}

function initializeFormInteractions() {
    const numberInputs = document.querySelectorAll('.number-input');
    
    numberInputs.forEach(input => {
        // Focus effects
        input.addEventListener('focus', function() {
            if (!this.classList.contains('invalid')) {
                if (this.classList.contains('number-input-vehicle')) {
                    this.style.borderColor = '#F4A63B';
                    this.style.boxShadow = '0 0 0 2px rgba(189, 130, 42, 0.2)';
                } else {
                    this.style.borderColor = '#2AB88F';
                    this.style.boxShadow = '0 0 0 2px rgba(42, 184, 143, 0.2)';
                }
            }
        });
        
        // Blur effects
        input.addEventListener('blur', function() {
            if (!this.classList.contains('invalid') && !this.classList.contains('valid')) {
                if (this.classList.contains('number-input-vehicle')) {
                    this.style.borderColor = '#F4A63B';
                    this.style.boxShadow = '0 0 0 2px rgba(189, 130, 42, 0.2)';
                } else {
                    this.style.borderColor = '#2AB88F';
                    this.style.boxShadow = 'none';
                }
            }
        });
        
        // Real-time validation on input
        input.addEventListener('input', function() {
            // Remove validation classes on new input
            this.classList.remove('valid', 'invalid');
            
            if (this.classList.contains('number-input-vehicle')) {
                this.style.borderColor = '#F4A63B';
                this.style.boxShadow = '0 0 0 2px rgba(189, 130, 42, 0.2)';
            } else {
                this.style.borderColor = '#2AB88F';
                this.style.boxShadow = '0 0 0 2px rgba(42, 184, 143, 0.2)';
            }
            
            // Remove any existing messages
            removeErrorMessage(this);
        });
        
        // Active state for Vehicle Parameters inputs
        if (input.classList.contains('number-input-vehicle')) {
            input.addEventListener('mousedown', function() {
                this.style.borderColor = '#F4A63B';
                this.style.boxShadow = '0 0 0 2px rgba(189, 130, 42, 0.2)';
            });
        }
    });
}

function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => {
        notification.remove();
    });
    
    // Create notification
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 1000;
        transform: translateX(100%);
        transition: transform 0.3s ease;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        font-family: 'Segoe UI', sans-serif;
        max-width: 400px;
        white-space: pre-line;
    `;
    
    // Set background color based on type
    switch (type) {
        case 'success':
            notification.style.backgroundColor = '#2AB88F';
            break;
        case 'error':
            notification.style.backgroundColor = '#e74c3c';
            break;
        default:
            notification.style.backgroundColor = '#3498db';
    }
    
    // Add to page
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Remove after 5 seconds for errors, 3 seconds for others
    const duration = type === 'error' ? 5000 : 3000;
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, duration);
}

// Initialize sliders functionality
function initializeSliders() {
    const sliders = document.querySelectorAll('.slider');

    sliders.forEach(slider => {
        // Create value display
        const valueDisplay = createValueDisplay(slider);

        // Update slider background based on value
        updateSliderBackground(slider);

        // Add event listeners
        slider.addEventListener('input', function () {
            updateSliderBackground(this);
            updateValueDisplay(valueDisplay, this.value);
        });

        slider.addEventListener('blur', function () {
            setTimeout(() => {
                valueDisplay.style.opacity = '0';
            }, 1000);
        });
    });
}

function createValueDisplay(slider) {
    const display = document.createElement('div');
    display.className = 'slider-value';
    display.textContent = slider.value;
    display.style.cssText = `
        position: absolute;
        top: -25px;
        right: 0;
        background: #2AB88F;
        color: white;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 0.8em;
        font-weight: 500;
        opacity: 0;
        transition: opacity 0.2s ease;
        pointer-events: none;
        z-index: 10;
    `;

    const container = slider.closest('.slider-wrapper');
    container.style.position = 'relative';
    container.appendChild(display);

    return display;
}

function updateSliderBackground(slider) {
    const value = slider.value;
    const max = slider.max || 100;
    const percentage = (value / max) * 100;

    if (slider.classList.contains('battery-slider')) {
        slider.style.background = `linear-gradient(to right, #F7931E 0%, #F7931E ${percentage}%, #DDDDDD ${percentage}%, #DDDDDD 100%)`;
    } else {
        slider.style.background = `linear-gradient(to right, #2AB88F 0%, #2AB88F ${percentage}%, #DDDDDD ${percentage}%, #DDDDDD 100%)`;
    }
}

function updateValueDisplay(display, value) {
    display.textContent = value;
    display.style.opacity = '1';
}

// Initialize button interactions
function initializeButtonInteractions() {
    // Navigation buttons
    const homeBtn = document.querySelector('.home-btn');
    const logoutBtn = document.querySelector('.logout-btn');

    if (homeBtn) {
        homeBtn.addEventListener('click', handleHomeButton);
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogoutButton);
    }
}

function handleHomeButton() {
    showNotification('Navigating to Home...', 'info');
}

function handleLogoutButton() {
    showNotification('Logging out...', 'info');
}

// Setup keyboard navigation
function setupKeyboardNavigation() {
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
            const nextInput = event.target.parentElement.nextElementSibling?.querySelector('input');
            if (nextInput) {
                nextInput.focus();
            } else {
                document.querySelector('.action-btn').click();
            }
        }
    });
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    
    .number-input-environment.valid {
        border-color: #2AB88F !important;
        box-shadow: 0 0 0 2px rgba(42, 184, 143, 0.2) !important;
    }
    
    .number-input-environment.invalid {
        border-color: #e74c3c !important;
        box-shadow: 0 0 0 2px rgba(231, 76, 60, 0.2) !important;
    }

    .number-input-vehicle.valid {
        border-color: #F4A63B !important;
        box-shadow: 0 0 0 2px rgba(189, 130, 42, 0.2) !important;
    }
    
    .number-input-vehicle.invalid {
        border-color: #e74c3c !important;
        box-shadow: 0 0 0 2px rgba(231, 76, 60, 0.2) !important;
    }
    
    .field-group {
        position: relative;
    }
    
    .error-message {
        color: #e74c3c;
        font-size: 0.8em;
        margin-top: 5px;
        font-weight: 500;
        animation: fadeIn 0.3s ease;
    }
    
    /* Success indicator styles removed - no longer needed */
    
    .slider-value {
        position: absolute;
        top: -25px;
        right: 0;
        background: #2AB88F;
        color: white;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 0.8em;
        font-weight: 500;
        opacity: 0;
        transition: opacity 0.2s ease;
        pointer-events: none;
        z-index: 10;
    }
`;
document.head.appendChild(style);
