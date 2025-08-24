document.addEventListener('DOMContentLoaded', function () {
    const progressLine = document.querySelector('.progress-line');
    const busIcon = document.querySelector('.bus-icon');

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || (function () { try { return sessionStorage.getItem('lastSimulationId'); } catch (e) { return null; } })();
    if (!id) {
        window.location.href = 'parameter.html';
        return;
    }

    let startTime = Date.now();
    const totalTime = 25 * 1000; // 25s visual progress

    function updateProgress() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / totalTime, 0.99);
        progressLine.style.width = (progress * 100) + '%';
        busIcon.style.left = (progress * 100) + '%';
        requestAnimationFrame(updateProgress);
    }

    updateProgress();

    // Trigger validation
    fetch('/api/send-to-validator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
    }).then(function (resp) {
        if (!resp.ok) { throw new Error('Validator request failed'); }
        return resp.json();
    }).then(function () {
        pollResults(id);
    }).catch(function () {
        // Even if validator request fails, try polling in case it started
        pollResults(id);
    });

    function pollResults(simId) {
        var attempts = 0;
        var maxAttempts = 60; // up to 60 seconds
        var timer = setInterval(function () {
            attempts++;
            fetch('/api/results/' + encodeURIComponent(simId))
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (data && data.validatedResponse) {
                        clearInterval(timer);
                        window.location.href = 'simulationOutput.html?id=' + encodeURIComponent(simId);
                    } else if (attempts >= maxAttempts) {
                        clearInterval(timer);
                        window.location.href = 'simulationOutput.html?id=' + encodeURIComponent(simId);
                    }
                })
                .catch(function () {
                    if (attempts >= maxAttempts) {
                        clearInterval(timer);
                        window.location.href = 'simulationOutput.html?id=' + encodeURIComponent(simId);
                    }
                });
        }, 1000);
    }
});
