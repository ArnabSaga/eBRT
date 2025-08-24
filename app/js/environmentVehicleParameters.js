document.addEventListener('DOMContentLoaded', function () {
    const nextBtn = document.getElementById('nextButton');
    if (!nextBtn) return;

    nextBtn.addEventListener('click', function () {
        try {
            const data = {};
            const sliders = document.querySelectorAll('.slider');
            sliders.forEach(function (slider) {
                data[slider.id] = slider.value;
            });

            const textInputs = document.querySelectorAll('.text-input');
            textInputs.forEach(function (input) {
                data[input.id] = input.value;
            });

            localStorage.setItem('environmentVehicleParams', JSON.stringify(data));
        } catch (e) {
            console.warn('Failed to save environment/vehicle params', e);
        }
    });
});


