document.addEventListener('DOMContentLoaded', function () {
    const progressLine = document.querySelector('.progress-line');
    const busIcon = document.querySelector('.bus-icon');

    // Read id from URL ?id=... or session storage
    const params = new URLSearchParams(window.location.search);
    const id =
        params.get('id') ||
        (function () { try { return sessionStorage.getItem('lastSimulationId'); } catch (e) { return null; } })();

    if (!id) {
        window.location.href = 'parameter.html';
        return;
    }

    // Keep id handy for reloads
    try { sessionStorage.setItem('lastSimulationId', id); } catch {}

    // ===== Visual progress (10 minutes total unless overridden) =====
    // You can override via: <body data-progress-ms="600000">
    const totalTime =
        Number(document.body?.dataset?.progressMs) > 0
            ? Number(document.body.dataset.progressMs)
            :  60 * 1000; // 10 minutes in ms

    let startTime = performance.now();
    let serverProgress = 0;      // 0..1 from backend if available
    let visualProgress = 0;      // 0..1 visual (stays slightly under 1 until redirect)
    const VISUAL_CAP = 0.985;    // don't show 100% until we navigate

    function applyProgress(p) {
        if (progressLine) progressLine.style.width = (p * 100) + '%';
        if (busIcon)      busIcon.style.left  = (p * 100) + '%';
    }

    function updateProgress(now) {
        // Time-based progress (linear)
        const elapsed = now - startTime;
        const timeProgress = Math.min(elapsed / totalTime, VISUAL_CAP);

        // Combine with server progress if higher
        visualProgress = Math.min(Math.max(timeProgress, serverProgress), VISUAL_CAP);

        applyProgress(visualProgress);
        requestAnimationFrame(updateProgress);
    }
    requestAnimationFrame(updateProgress);

    // ===== Kick the validator (non-fatal if it fails) =====
    fetchJSON('/api/send-to-validator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    }).catch(() => { /* ignore; we still poll */ });

    // ===== Poll results =====
    pollResults(id, {
        // Align max attempts to the visual timer, 1 request/sec
        maxAttempts: Math.ceil(totalTime / 1000),
        intervalMs: 1000,
        perRequestTimeoutMs: 8000
    });

    async function pollResults(simId, { maxAttempts = 600, intervalMs = 1000, perRequestTimeoutMs = 8000 } = {}) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const data = await fetchJSON(`/api/results/${encodeURIComponent(simId)}`, {}, perRequestTimeoutMs);

                // If backend sends progress (0..1), reflect it visually (but still cap)
                if (typeof data?.progress === 'number' && isFinite(data.progress)) {
                    serverProgress = Math.max(0, Math.min(1, data.progress));
                }

                // Success conditions: validatedResponse present OR status indicates completion
                if (data?.validatedResponse || data?.status === 'done' || data?.status === 'ready' || data?.status === 'completed') {
                    // Fill the bar to 100% visually before leaving
                    applyProgress(1);
                    window.location.href = 'simulationOutput.html?id=' + encodeURIComponent(simId);
                    return;
                }
            } catch (e) {
                // swallow and keep polling until timeout
            }

            // Wait between attempts
            await sleep(intervalMs);
        }

        // Timed out: go show whatever is available
        applyProgress(1);
        window.location.href = 'simulationOutput.html?id=' + encodeURIComponent(simId);
    }

    // ===== Helpers =====
    function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

    function fetchJSON(url, options = {}, timeoutMs = 8000) {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);
        return fetch(url, { ...options, signal: controller.signal })
            .then(r => {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .finally(() => clearTimeout(t));
    }
});
