// Global variables
let currentDriveCycle = 'WLTC';
let uploadedFile = null;

// Drive cycle configurations with images
const driveCycleConfigs = {
    'WLTC': {
        image: './assets/img/drive-cycle-option-wltc.png',
        template: './templates/wltc-template.csv'
    },
    'NEDC': {
        image: './assets/img/drive-cycle-option-nedc.png',
        template: './templates/nedc-template.csv'
    },
    'SORT': {
        image: './assets/img/drive-cycle-option-sort.png',
        template: './templates/sort-template.csv'
    },
    'VECTO': {
        image: './assets/img/drive-cycle-option-vecto.png',
        template: './templates/vecto-template.csv'
    },
    'FTP': {
        image: './assets/img/drive-cycle-option-ftp.png',
        template: './templates/ftp-template.csv'
    },
    'Custom': {
        image: null,
        template: './templates/custom-template.csv'
    }
};

// Initialize page functionality
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/json/driveCycleOption.json');
        const spec = await res.json();
        buildUiFromSpec(spec);
        initializePage();
        setupEventListeners();
    } catch (e) {
        console.error('Failed to load drive cycle spec', e);
        // Fallback initialization if JSON fails
        initializePage();
        setupEventListeners();
    }
});

function buildUiFromSpec(spec) {
    const cfg = spec?.configuration?.Driving_Cycle || {};
    const cycleTypeSelect = document.getElementById('cycleTypeSelect');
    
    if (cycleTypeSelect) {
        // Clear existing options
        cycleTypeSelect.innerHTML = '';
        
        // Add options from the spec
        const specOptions = cfg.Cycle_Type?.user_input?.options || [];
        
        specOptions.forEach(opt => {
        const o = document.createElement('option');
        o.value = String(opt.value);
        o.textContent = opt.label;
            cycleTypeSelect.appendChild(o);
        });
        
        // Set WLTC as default if available
        const wltcOption = specOptions.find(opt => opt.label === 'WLTC');
        if (wltcOption) {
            cycleTypeSelect.value = String(wltcOption.value);
            currentDriveCycle = 'WLTC';
        }
    }
}

function initializePage() {
    // Update image based on current selection
    updateDriveCycleImage(currentDriveCycle);
    
    // Initialize form state
    updateUploadButtonState();
    setupDragAndDrop();
    
    // Set initial dropzone state
    const dropzone = document.querySelector('.dropzone');
    if (dropzone) {
        dropzone.classList.add('disabled');
    }
}

function setupEventListeners() {
    // Drive cycle selection change
    const cycleTypeSelect = document.getElementById('cycleTypeSelect');
    if (cycleTypeSelect) {
        cycleTypeSelect.addEventListener('change', handleDriveCycleChange);
    }
    
    // Custom drive cycle checkbox
    const customDriveCheckbox = document.getElementById('customDrive');
    if (customDriveCheckbox) {
        customDriveCheckbox.addEventListener('change', handleCustomDriveChange);
    }
    
    // Simulation time validation
    const simTimeInput = document.getElementById('simTime');
    if (simTimeInput) {
        simTimeInput.addEventListener('input', validateSimulationTime);
        simTimeInput.addEventListener('blur', validateSimulationTime);
    }
    
    // Keyboard navigation support
    document.addEventListener('keydown', handleKeyboardNavigation);
    
    // Form submission on Enter key
    const form = document.querySelector('.form-left');
    if (form) {
        form.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                submitForm();
            }
        });
    }
}

function handleKeyboardNavigation(e) {
    // Tab navigation enhancement
    if (e.key === 'Tab') {
        const focusableElements = document.querySelectorAll(
            'input, select, button, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        
        if (e.shiftKey && document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
        }
    }
}

function handleDriveCycleChange(event) {
    const selectedValue = event.target.value;
    const selectedOption = event.target.options[event.target.selectedIndex];
    const selectedLabel = selectedOption.textContent;
    
    currentDriveCycle = selectedLabel;
    
    // Update image
    updateDriveCycleImage(selectedLabel);
    
    // Update upload button state
    updateUploadButtonState();
    
    // Reset custom drive cycle checkbox if not custom
    if (selectedLabel !== 'Custom') {
        const customDriveCheckbox = document.getElementById('customDrive');
        if (customDriveCheckbox) {
            customDriveCheckbox.checked = false;
            handleCustomDriveChange();
        }
    }
}

function updateDriveCycleImage(driveCycle) {
    const formRight = document.querySelector('.form-right');
    if (!formRight) return;
    
    const config = driveCycleConfigs[driveCycle];
    if (config && config.image) {
        // Check if image exists, if not show placeholder
        const img = new Image();
        img.onload = function() {
            formRight.innerHTML = `<img src="${config.image}" alt="Drive Cycle Chart - ${driveCycle}" />`;
        };
        img.onerror = function() {
            showDriveCyclePlaceholder(driveCycle);
        };
        img.src = config.image;
    } else if (driveCycle === 'Custom') {
        showDriveCyclePlaceholder(driveCycle);
    } else {
        showDriveCyclePlaceholder(driveCycle);
    }
}

function showDriveCyclePlaceholder(driveCycle) {
    const formRight = document.querySelector('.form-right');
    if (!formRight) return;
    
    if (driveCycle === 'Custom') {
        formRight.innerHTML = `
            <div class="custom-placeholder">
                <div class="custom-icon">📁</div>
                <h3>Custom Drive Cycle</h3>
                <p>Upload your custom drive cycle file to see it displayed here</p>
            </div>
        `;
    } else {
        formRight.innerHTML = `
            <div class="drive-cycle-placeholder">
                <div class="placeholder-icon">📊</div>
                <h3>${driveCycle} Drive Cycle</h3>
                <p>Drive cycle visualization for ${driveCycle}</p>
                <p class="placeholder-note">Image not available</p>
            </div>
        `;
    }
}

function handleCustomDriveChange() {
    const customDriveCheckbox = document.getElementById('customDrive');
    const uploadButton = document.querySelector('.upload');
    const templateButton = document.querySelector('.template');
    const dropzone = document.querySelector('.dropzone');
    
    if (customDriveCheckbox && uploadButton && templateButton) {
        if (customDriveCheckbox.checked) {
            uploadButton.disabled = false;
            uploadButton.style.opacity = '1';
            uploadButton.style.cursor = 'pointer';
            
            // Enable dropzone for file uploads
            if (dropzone) {
                dropzone.classList.add('enabled');
                dropzone.classList.remove('disabled');
            }
        } else {
            uploadButton.disabled = true;
            uploadButton.style.opacity = '0.6';
            uploadButton.style.cursor = 'not-allowed';
            
            // Disable dropzone and clear any uploaded files
            if (dropzone) {
                dropzone.classList.remove('enabled');
                dropzone.classList.add('disabled');
                // Reset dropzone to original state
                dropzone.innerHTML = 'Drag & Drop Here';
            }
            
            // Clear uploaded file
            uploadedFile = null;
        }
    }
}

function updateUploadButtonState() {
    const customDriveCheckbox = document.getElementById('customDrive');
    const uploadButton = document.querySelector('.upload');
    const dropzone = document.querySelector('.dropzone');
    
    if (customDriveCheckbox && uploadButton) {
        if (currentDriveCycle === 'Custom' && customDriveCheckbox.checked) {
            uploadButton.disabled = false;
            uploadButton.style.opacity = '1';
            uploadButton.style.cursor = 'pointer';
            
            // Enable dropzone
            if (dropzone) {
                dropzone.classList.add('enabled');
                dropzone.classList.remove('disabled');
            }
        } else {
            uploadButton.disabled = true;
            uploadButton.style.opacity = '0.6';
            uploadButton.style.cursor = 'not-allowed';
            
            // Disable dropzone
            if (dropzone) {
                dropzone.classList.remove('enabled');
                dropzone.classList.add('disabled');
            }
        }
    }
}

function setupDragAndDrop() {
    const dropzone = document.querySelector('.dropzone');
    if (!dropzone) return;
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    // Highlight drop zone when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, unhighlight, false);
    });
    
    // Handle dropped files
    dropzone.addEventListener('drop', handleDrop, false);
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    function highlight(e) {
        // Only highlight if custom drive cycle is enabled
        const customDriveCheckbox = document.getElementById('customDrive');
        if (customDriveCheckbox && customDriveCheckbox.checked) {
            dropzone.classList.add('drag-over');
        }
    }
    
    function unhighlight(e) {
        dropzone.classList.remove('drag-over');
    }
    
    function handleDrop(e) {
        const customDriveCheckbox = document.getElementById('customDrive');
        
        // Only process files if custom drive cycle is checked
        if (!customDriveCheckbox || !customDriveCheckbox.checked) {
            // Show message that custom drive cycle must be enabled
            showTemporaryMessage('Please check "CUSTOM DRIVE CYCLE" to upload files', 'warning');
            return;
        }
        
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            handleFileUpload(files[0]);
        }
    }
}

function uploadFile() {
    if (currentDriveCycle !== 'Custom') {
        alert('Please select "Custom" drive cycle to upload files.');
        return;
    }
    
    const uploadButton = document.querySelector('.upload');
    if (uploadButton) {
        uploadButton.classList.add('loading');
        uploadButton.disabled = true;
    }
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.txt,.xlsx,.xls';
    input.onchange = function(e) {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
        
        // Remove loading state
        if (uploadButton) {
            uploadButton.classList.remove('loading');
            uploadButton.disabled = false;
        }
    };
    input.click();
}

function handleFileUpload(file) {
    // Validate file type
    const allowedTypes = [
        'text/csv',
        'text/plain',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel'
    ];
    
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(csv|txt|xlsx|xls)$/i)) {
        alert('Please select a valid file type (.csv, .txt, .xlsx, .xls)');
        return;
    }
    
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        return;
    }
    
    // Store uploaded file
    uploadedFile = file;
    
    // Update dropzone to show uploaded file
    const dropzone = document.querySelector('.dropzone');
    if (dropzone) {
        dropzone.innerHTML = `
            <div class="upload-success">
                <div class="file-info">
                    <span class="file-icon">📄</span>
                    <span class="file-name">${file.name}</span>
                </div>
                <button class="remove-file" onclick="removeUploadedFile()">✕</button>
            </div>
        `;
    }
    
    // Show success message
    showSuccessMessage('Your custom drive cycle has been successfully uploaded.');
    
    // Update form state
    updateUploadButtonState();
}

function removeUploadedFile() {
    uploadedFile = null;
    const dropzone = document.querySelector('.dropzone');
    if (dropzone) {
        dropzone.innerHTML = 'Drag & Drop Here';
    }
    updateUploadButtonState();
}

function downloadTemplate() {
    const config = driveCycleConfigs[currentDriveCycle];
    if (!config || !config.template) {
        alert('Template not available for this drive cycle type.');
        return;
    }
    
    const templateButton = document.querySelector('.template');
    if (templateButton) {
        templateButton.classList.add('loading');
        templateButton.disabled = true;
    }
    
    // Create a temporary link element to trigger download
    const link = document.createElement('a');
    link.href = config.template;
    link.download = `${currentDriveCycle.toLowerCase()}-template.csv`;
    
    // Try to download the file
    try {
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Show success message
        showSuccessMessage('Template downloaded successfully!');
    } catch (error) {
        // Fallback: create a simple CSV template
        downloadCSVTemplate();
        showSuccessMessage('Template generated and downloaded!');
    }
    
    // Remove loading state
    setTimeout(() => {
        if (templateButton) {
            templateButton.classList.remove('loading');
            templateButton.disabled = false;
        }
    }, 1000);
}

function downloadCSVTemplate() {
    const templateContent = `Time(s),Speed(km/h),Acceleration(m/s²)
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
    
    const blob = new Blob([templateContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentDriveCycle.toLowerCase()}-template.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
}

function validateSimulationTime() {
    const simTimeInput = document.getElementById('simTime');
    if (!simTimeInput) return;
    
    const value = simTimeInput.value.trim();
    
    if (!value) {
        simTimeInput.style.borderColor = '#009688';
        return;
    }
    
    if (isNaN(value) || Number(value) <= 0) {
        simTimeInput.style.borderColor = '#ff0000';
        simTimeInput.setCustomValidity('Please enter a valid positive number');
    } else {
        simTimeInput.style.borderColor = '#009688';
        simTimeInput.setCustomValidity('');
    }
}

function showSuccessMessage(message) {
    // Create success message element
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    
    // Add to page
    document.body.appendChild(successDiv);
    
    // Remove after 3 seconds
    setTimeout(() => {
        if (successDiv.parentNode) {
            successDiv.parentNode.removeChild(successDiv);
        }
    }, 3000);
}

function showTemporaryMessage(message, type = 'info') {
    // Create message element
    const messageDiv = document.createElement('div');
    messageDiv.className = `temporary-message ${type}`;
    messageDiv.textContent = message;
    
    // Add to page
    document.body.appendChild(messageDiv);
    
    // Remove after 2 seconds
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.parentNode.removeChild(messageDiv);
        }
    }, 2000);
}

function submitForm() {
    const simTime = document.getElementById('simTime').value.trim();
    const cycleTypeSelect = document.getElementById('cycleTypeSelect');
    const cycleType = cycleTypeSelect ? cycleTypeSelect.options[cycleTypeSelect.selectedIndex]?.textContent : '';

    // Validate simulation time
    if (!simTime || isNaN(simTime) || Number(simTime) <= 0) {
        alert('Please enter a valid positive number for simulation time.');
        document.getElementById('simTime').focus();
        return;
    }

    if (!cycleType) {
        alert('Please select a drive cycle type.');
        document.getElementById('cycleTypeSelect').focus();
        return;
    }
    
    // Validate custom drive cycle upload if Custom is selected
    if (cycleType === 'Custom') {
        const customDriveCheckbox = document.getElementById('customDrive');
        if (customDriveCheckbox && customDriveCheckbox.checked && !uploadedFile) {
            alert('Please upload a custom drive cycle file.');
            return;
        }
    }

    // Gather form data
    const formData = {
        simulationTime: Number(simTime),
        driveCycleType: cycleType,
        driveCycleValue: cycleTypeSelect ? Number(cycleTypeSelect.value) : null,
        customFile: uploadedFile ? uploadedFile.name : null
    };

    try {
        // Store in localStorage
        localStorage.setItem('driveCycleConfig', JSON.stringify(formData));
        
        // Show success message
        showSuccessMessage('Form submitted successfully! Redirecting...');
        
        // Redirect after a short delay
        setTimeout(() => {
            window.location.href = 'environmentVehicleParameters.html';
        }, 1500);
        
    } catch (e) {
        console.warn('Unable to persist config to localStorage', e);
        // Continue with redirect even if localStorage fails
        window.location.href = 'environmentVehicleParameters.html';
    }
}