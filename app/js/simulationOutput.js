// simulationOutput.js — loads /simulationOutput/<id>.json if present, otherwise falls back to demo data.
// It retains your chart UX: synced zoom, moving shadow, TZ popup, and ECharts gauges.

document.addEventListener('DOMContentLoaded', async () => {
    initNavigation();

    const resultId = getQueryParam('id');
    let loaded = null;
    if (resultId) {
        loaded = await tryLoad(`/simulationOutput/${encodeURIComponent(resultId)}.json`);
    }

    // Transform validated payload into series/metrics if possible
    const model = coerceToViewModel(loaded);

    const ctx = initChartsContinuous(model);  // time axis + zoom + shadow + pointer
    initGaugesECharts(model);                  // fuel/load/torque & temps via ECharts
    echarts.connect([ctx.speedChart, ctx.msgChart]); // sync charts
    paintTiles(model);
});

/* ------------------ Navigation ------------------ */
function initNavigation() {
    const homeBtn = document.querySelector('.home-btn');
    const logoutBtn = document.querySelector('.logout-btn');
    if (homeBtn) homeBtn.addEventListener('click', e => { /* normal link */ });
    if (logoutBtn) logoutBtn.addEventListener('click', e => { e.preventDefault(); console.log('Logout clicked'); });
}

/* ------------------ Helpers ------------------ */
function getQueryParam(k) {
    const url = new URL(window.location.href);
    return url.searchParams.get(k);
}
async function tryLoad(url) {
    try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        console.warn('Could not load result JSON:', e);
        return null;
    }
}

/**
 * Try to understand your validatedResponse shape defensively.
 * Expected possibilities (examples):
 *  - { timeseries: { time_s:[], speed_ms:[] , rpm:[], fuel_rate_lph:[], load_pct:[], torque_pct:[], ...}, metrics: {...} }
 *  - or a flat object with arrays: { Time_s:[], Speed_mps:[] }
 * Fallback: generate a 24h demo curve.
 */
function coerceToViewModel(payload) {
    // Defaults
    const baseDate = '2024-09-07';
    const STEP_MS = 60_000;

    // Fallback generator (demo)
    function build24hSeries() {
        const start = new Date(`${baseDate}T00:00:00`).getTime();
        const end = new Date(`${baseDate}T23:59:59`).getTime();
        const speedSeries = [];
        const msgSeries = [];
        for (let t = start, i = 0; t <= end; t += STEP_MS, i++) {
            const dayFrac = (t - start) / (24 * 3600 * 1000);
            const speedVal = Math.max(0, 80 * Math.sin((dayFrac - 0.5) * Math.PI) + 15 + 10 * Math.sin(i / 40));
            const msgVal = Math.max(0, 85 * Math.sin((dayFrac - 0.45) * Math.PI) + 12 + 8 * Math.cos(i / 35));
            speedSeries.push([t, speedVal]);
            msgSeries.push([t, msgVal]);
        }
        return { speedSeries, msgSeries, start, end };
    }

    if (!payload || typeof payload !== 'object') {
        const demo = build24hSeries();
        return {
            baseDate, ...demo,
            fuelRateLph: 2, fuelPct: 32, loadPct: 22, torquePct: 16,
            dtc: 6, coolantC: 76.1, intakeC: 28.9, ambientC: 19.7,
            speedNow: 54, distanceKm: 28, rpmNow: 1128
        };
    }

    // Try discover arrays
    const ts = payload?.timeseries || payload?.validatedResponse?.timeseries || payload; // flexible
    const time_s = ts.time_s || ts.Time_s || ts.timeS || [];
    const speed_ms = ts.speed_ms || ts.Speed_mps || ts.speedMps || [];
    const rpm = ts.rpm || ts.RPM || [];
    const fuel_lph = ts.fuel_rate_lph || ts.fuelRateLph || [];
    const load_pct = ts.load_pct || ts.Load_pct || [];
    const torque_pct = ts.torque_pct || ts.Torque_pct || [];

    // Convert into [ms,value] pairs for ECharts time series
    let speedSeries = [];
    let msgSeries = [];
    if (Array.isArray(time_s) && Array.isArray(speed_ms) && time_s.length === speed_ms.length && time_s.length > 1) {
        const t0 = time_s[0];
        const startMs = new Date(`${baseDate}T00:00:00`).getTime(); // anchor on a day (no TZ headaches)
        for (let i = 0; i < time_s.length; i++) {
            const ms = startMs + (time_s[i] - t0) * 1000;
            const kmh = Number(speed_ms[i]) * 3.6;
            speedSeries.push([ms, kmh]);
            msgSeries.push([ms, kmh]); // if you have a separate message speed, map it similarly
        }
    } else {
        // fallback demo
        const demo = build24hSeries();
        speedSeries = demo.speedSeries;
        msgSeries = demo.msgSeries;
    }

    // Metrics (defensive extraction)
    const m = payload.metrics || payload;
    const first = (arr, d) => (Array.isArray(arr) && arr.length ? Number(arr[arr.length - 1]) : d);

    const model = {
        baseDate,
        speedSeries,
        msgSeries,
        start: speedSeries.length ? speedSeries[0][0] : new Date(`${baseDate}T00:00:00`).getTime(),
        end: speedSeries.length ? speedSeries[speedSeries.length - 1][0] : new Date(`${baseDate}T23:59:59`).getTime(),
        fuelRateLph: Number(m.fuel_rate_lph ?? first(fuel_lph, 2)),
        fuelPct: Number(m.fuel_pct ?? 32),
        loadPct: Number(m.load_pct ?? first(load_pct, 22)),
        torquePct: Number(m.torque_pct ?? first(torque_pct, 16)),
        dtc: Number(m.dtc_count ?? 6),
        coolantC: Number(m.coolant_c ?? 76.1),
        intakeC: Number(m.intake_c ?? 28.9),
        ambientC: Number(m.ambient_c ?? 19.7),
        speedNow: Number(m.speed_kmh ?? (speedSeries.length ? speedSeries[speedSeries.length - 1][1] : 54)),
        distanceKm: Number(m.distance_km ?? 28),
        rpmNow: Number(m.rpm ?? first(rpm, 1128)),
    };

    return model;
}

const mean = series => (series.length ? series.reduce((a, [, v]) => a + v, 0) / series.length : 0);
function findNearest(series, target) {
    let lo = 0, hi = series.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (series[mid][0] < target) lo = mid + 1; else hi = mid;
    }
    const cand1 = series[lo];
    const cand0 = series[Math.max(0, lo - 1)];
    return !cand0 ? cand1 : (Math.abs(cand0[0] - target) <= Math.abs(cand1[0] - target) ? cand0 : cand1);
}

/* ------------------ TZ popup helpers ------------------ */
const USER_TZ = 'Asia/Dhaka';
function fmtTZ(ts, tz) {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, year: 'numeric', month: 'short', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(ts);
}
function getOrCreatePopup() {
    let el = document.getElementById('tzPopup');
    if (!el) {
        el = document.createElement('div');
        el.id = 'tzPopup';
        Object.assign(el.style, {
            position: 'fixed', zIndex: '9999', pointerEvents: 'none',
            background: 'rgba(0,0,0,0.8)', color: '#fff',
            font: '12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial',
            padding: '8px 10px', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,.25)'
        });
        document.body.appendChild(el);
    }
    return el;
}
function showTZPopup(x, y, ts) {
    const el = getOrCreatePopup();
    const localTZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
    el.innerHTML = `
      <div><b>${echarts.format.formatTime('hh:mm:ss', ts)}</b></div>
      <div>${USER_TZ}: ${fmtTZ(ts, USER_TZ)}</div>
      <div>${localTZ}: ${fmtTZ(ts, localTZ)}</div>
      <div>UTC: ${fmtTZ(ts, 'UTC')}</div>
    `;
    el.style.left = (x + 12) + 'px';
    el.style.top = (y - 12) + 'px';
    el.style.display = 'block';
    clearTimeout(showTZPopup._timer);
    showTZPopup._timer = setTimeout(() => el.style.display = 'none', 3000);
}

/* ------------------ ECharts mount helpers ------------------ */
function ensureChartMount(id, kind = 'chart') {
    let el = document.getElementById(id);
    if (!el) return null;

    const wantH = kind === 'gauge-big' ? '70px' : kind === 'gauge-small' ? '50px' : kind === 'mini' ? '40px' : '100%';

    if (el.tagName === 'CANVAS') {
        const div = document.createElement('div');
        div.id = id;
        div.style.width = '100%';
        div.style.height = wantH;
        el.parentNode.replaceChild(div, el);
        el = div;
    } else if (!el.style.height) {
        el.style.height = wantH;
    }

    const gv = el.parentElement?.querySelector('.gauge-value');
    if (gv) gv.style.display = 'none';

    return el;
}

function mountChart(id, option, kind = 'chart') {
    const el = ensureChartMount(id, kind);
    if (!el) return null;
    const chart = echarts.init(el, null, { renderer: 'canvas' });
    chart.setOption(option);
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => chart.resize());
        ro.observe(el);
    } else {
        window.addEventListener('resize', () => chart.resize());
    }
    return chart;
}

/* ------------------ Charts (time axis) ------------------ */
function initChartsContinuous(model) {
    const speedSeries = model.speedSeries;
    const msgSeries = model.msgSeries;
    const xMin = model.start;
    const xMax = model.end;

    const baseGrid = { top: 26, right: 18, bottom: 36, left: 46, containLabel: false };

    const xTime = {
        type: 'time',
        boundaryGap: false,
        min: xMin, max: xMax, minInterval: 1,
        axisLine: { lineStyle: { color: '#d6d6d6' } },
        axisTick: { show: false },
        axisLabel: { color: '#6b6b6b', formatter: (v) => echarts.format.formatTime('hh:mm:ss', v) },
        minorTick: { show: true },
        minorSplitLine: { show: true, lineStyle: { color: '#f5f6f7' } }
    };
    const yVal = (min, max) => ({
        type: 'value', min, max,
        splitLine: { lineStyle: { color: '#eef0f2' } },
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: '#6b6b6b' }
    });
    const zoom = [
        { type: 'inside', xAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: true, moveOnMouseMove: true, moveOnMouseWheel: true, preventDefaultMouseMove: true, realtime: true, throttle: 0, minSpan: 1 },
        { type: 'slider', xAxisIndex: 0, filterMode: 'none', bottom: 6, height: 16, labelFormatter: v => echarts.format.formatTime('hh:mm:ss', v) }
    ];

    // Initial focus mid-window
    let focusTime = (xMin + xMax) / 2;

    function computeShadowSpanMs(visStart, visEnd) {
        const span = Math.max((visEnd - visStart) * 0.2, 60_000 * 2);
        return Math.min(span, 30 * 60 * 1000);
    }

    const speedOpt = {
        grid: baseGrid,
        tooltip: { trigger: 'axis', axisPointer: { type: 'line' } },
        xAxis: xTime,
        yAxis: yVal(0, 100),
        dataZoom: zoom,
        series: [{
            id: 'speed', name: 'AVG_speedkmh', type: 'line', data: speedSeries, smooth: true, symbol: 'none', sampling: 'lttb',
            lineStyle: { width: 2, color: '#4a90e2' },
            areaStyle: { opacity: 1, color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(74,144,226,0.25)' }, { offset: 1, color: 'rgba(74,144,226,0.04)' }]) }
        }]
    };

    const msgOpt = {
        grid: baseGrid,
        tooltip: { trigger: 'axis', axisPointer: { type: 'line' } },
        xAxis: xTime,
        yAxis: yVal(0, 100),
        dataZoom: zoom,
        series: [{
            id: 'msg', name: 'AVG_s01pid0d_vehiclespeed', type: 'line', data: msgSeries, smooth: true, symbol: 'none', sampling: 'lttb',
            lineStyle: { width: 2, color: '#27ae60' },
            areaStyle: { opacity: 1, color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(39,174,96,0.25)' }, { offset: 1, color: 'rgba(39,174,96,0.04)' }]) }
        }]
    };

    const speedChart = mountChart('speedChart', speedOpt);
    const msgChart = mountChart('messageChart', msgOpt);

    function currentVisibleRange(chart) {
        const opt = chart.getOption();
        const dz = (opt.dataZoom && (opt.dataZoom[0] || opt.dataZoom[1])) || {};
        let start = dz.startValue ?? (xMin + (xMax - xMin) * ((dz.start ?? 0) / 100));
        let end = dz.endValue ?? (xMin + (xMax - xMin) * ((dz.end ?? 100) / 100));
        start = Math.max(xMin, Math.min(start, xMax));
        end = Math.max(xMin, Math.min(end, xMax));
        if (end < start) [start, end] = [end, start];
        return [start, end];
    }

    function updateFocus(centerTs, visStart, visEnd) {
        focusTime = centerTs;
        const nearest = findNearest(speedSeries, focusTime);
        const shadowSpan = computeShadowSpanMs(visStart, visEnd);
        const areaStart = Math.max(xMin, centerTs - shadowSpan / 2);
        const areaEnd = Math.min(xMax, centerTs + shadowSpan / 2);

        speedChart.setOption({
            series: [{
                id: 'speed',
                markLine: {
                    symbol: 'none', label: { show: false },
                    data: [
                        { xAxis: centerTs, lineStyle: { color: '#ffb400', type: 'dashed', width: 2 } },
                        { yAxis: mean(speedSeries), lineStyle: { color: '#9aa4af', type: 'dashed' } }
                    ]
                },
                markPoint: { data: [{ coord: [nearest[0], nearest[1]] }], symbol: 'circle', symbolSize: 10, itemStyle: { color: '#ffb400', borderColor: '#fff', borderWidth: 2 } },
                markArea: { itemStyle: { color: 'rgba(60,60,60,0.22)' }, data: [[{ xAxis: areaStart }, { xAxis: areaEnd }]] }
            }]
        }, { replaceMerge: ['series'] });

        msgChart.setOption({
            series: [{ id: 'msg', markArea: { itemStyle: { color: 'rgba(60,60,60,0.18)' }, data: [[{ xAxis: areaStart }, { xAxis: areaEnd }]] } }]
        }, { replaceMerge: ['series'] });
    }

    {
        const [vs, ve] = currentVisibleRange(speedChart);
        updateFocus((vs + ve) / 2, vs, ve);
    }

    function onZoom() {
        const [vs, ve] = currentVisibleRange(speedChart);
        const mid = (vs + ve) / 2;
        updateFocus(mid, vs, ve);
    }
    speedChart.on('dataZoom', onZoom);
    msgChart.on('dataZoom', onZoom);

    function attachClicks(chart) {
        chart.getZr().on('click', (zrEvt) => {
            const pixel = [zrEvt.offsetX, zrEvt.offsetY];
            const coord = chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, pixel);
            const ts = Array.isArray(coord) ? coord[0] : coord;
            if (!ts || isNaN(ts)) return;
            const [vs, ve] = currentVisibleRange(speedChart);
            updateFocus(ts, vs, ve);
            showTZPopup(zrEvt.event.clientX, zrEvt.event.clientY, ts);
        });
        chart.getZr().on('dblclick', () => {
            [speedChart, msgChart].forEach(c => c.dispatchAction({ type: 'dataZoom', startValue: xMin, endValue: xMax }));
            updateFocus((xMin + xMax) / 2, xMin, xMax);
        });
    }
    attachClicks(speedChart);
    attachClicks(msgChart);

    return { speedChart, msgChart };
}

/* ------------------ ECharts Gauges ------------------ */
function gaugeOption(value, max, color, small = false) {
    return {
        series: [{
            type: 'gauge', startAngle: 210, endAngle: -30, min: 0, max,
            center: ['50%', '65%'], radius: '95%',
            pointer: { show: false }, anchor: { show: false },
            progress: { show: true, roundCap: true, width: 6, itemStyle: { color } },
            axisLine: { lineStyle: { width: 6, color: [[1, '#e0e0e0']] } },
            splitLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false },
            detail: { valueAnimation: true, fontSize: small ? 12 : 14, color, offsetCenter: [0, '0%'], formatter: val => small ? Number(val).toFixed(1) : Math.round(val) },
            data: [{ value }]
        }]
    };
}

function initGaugesECharts(model) {
    mountChart('fuelGauge', gaugeOption(Number(model.fuelPct || 0), 100, '#ff8c00', false), 'gauge-big');
    mountChart('loadGauge', gaugeOption(Number(model.loadPct || 0), 100, '#3498db', false), 'gauge-big');
    mountChart('torqueGauge', gaugeOption(Number(model.torquePct || 0), 100, '#3498db', false), 'gauge-big');

    mountChart('coolantGauge', gaugeOption(Number(model.coolantC || 0), 100, '#27ae60', true), 'gauge-small');
    mountChart('intakeGauge', gaugeOption(Number(model.intakeC || 0), 100, '#27ae60', true), 'gauge-small');
    mountChart('ambientGauge', gaugeOption(Number(model.ambientC || 0), 100, '#3498db', true), 'gauge-small');

    // Update overlay text (so mobile/screen readers still see numbers)
    updateGaugeOverlay('fuelGauge', model.fuelPct);
    updateGaugeOverlay('loadGauge', model.loadPct);
    updateGaugeOverlay('torqueGauge', model.torquePct);
    updateGaugeOverlay('coolantGauge', model.coolantC);
    updateGaugeOverlay('intakeGauge', model.intakeC);
    updateGaugeOverlay('ambientGauge', model.ambientC);
}

function updateGaugeOverlay(canvasOrDivId, value) {
    const el = document.getElementById(canvasOrDivId);
    const overlay = el?.parentElement?.querySelector('.gauge-value');
    if (overlay) overlay.textContent = (value ?? '--').toString();
}

/* ------------------ Tiles ------------------ */
function paintTiles(model) {
    const safe = (v, d = '--') => (v == null || isNaN(v) ? d : String(v));
    const byId = id => document.getElementById(id);

    const fuelRateVal = document.getElementById('fuelRateVal');
    if (fuelRateVal) fuelRateVal.textContent = safe(model.fuelRateLph);

    const dtcVal = byId('dtcVal'); if (dtcVal) dtcVal.textContent = safe(model.dtc, '--');
    const perfSpeed = byId('perfSpeed'); if (perfSpeed) perfSpeed.textContent = safe(Math.round(model.speedNow));
    const perfDistance = byId('perfDistance'); if (perfDistance) perfDistance.textContent = safe(model.distanceKm);
    const perfRPM = byId('perfRPM'); if (perfRPM) perfRPM.textContent = safe(Math.round(model.rpmNow));
}
