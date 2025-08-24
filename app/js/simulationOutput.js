document.addEventListener('DOMContentLoaded', function () {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || (function () { try { return sessionStorage.getItem('lastSimulationId'); } catch (e) { return null; } })();

    const container = document.createElement('div');
    container.style.padding = '20px';
    const title = document.createElement('h2');
    title.textContent = 'Simulation Output';
    const pre = document.createElement('pre');
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.background = '#f5f5f5';
    pre.style.padding = '12px';
    pre.style.borderRadius = '8px';
    document.body.appendChild(container);
    container.appendChild(title);
    container.appendChild(pre);

    if (!id) {
        pre.textContent = 'No simulation id provided.';
        return;
    }

    // Try to load the file written by backend for easy static serving
    fetch('./simulationOutput/' + encodeURIComponent(id) + '.json')
        .then(function (r) {
            if (!r.ok) throw new Error('File not ready');
            return r.json();
        })
        .then(function (data) {
            pre.textContent = JSON.stringify(data, null, 2);
        })
        .catch(function () {
            // Fallback to API
            fetch('/api/results/' + encodeURIComponent(id))
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    pre.textContent = JSON.stringify(data.validatedResponse || data, null, 2);
                })
                .catch(function (e) {
                    pre.textContent = 'Failed to load output: ' + (e.message || 'unknown error');
                });
        });
});


