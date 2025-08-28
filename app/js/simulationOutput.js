// script.js — time-axis zoom + moving shadow tied to orange pointer + TZ click popup + ECharts gauges

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    const ctx = initChartsContinuous();  // time axis + precise zoom + moving shadow + click TZ popup
    initGaugesECharts();                  // all gauges via ECharts
    echarts.connect([ctx.speedChart, ctx.msgChart]); // keep both charts in sync
});

/* ------------------ Navigation ------------------ */
function initNavigation() {
    const homeBtn = document.querySelector('.home-btn');
    const logoutBtn = document.querySelector('.logout-btn');
    if (homeBtn) homeBtn.addEventListener('click', e => { e.preventDefault(); console.log('Navigate to Home'); });
    if (logoutBtn) logoutBtn.addEventListener('click', e => { e.preventDefault(); console.log('Logout clicked'); });
}

/* ------------- ECharts mount helpers ------------- */
function ensureChartMount(id, kind = 'chart') {
    let el = document.getElementById(id);
    if (!el) return null;

    const wantH =
        kind === 'gauge-big' ? '70px' :
            kind === 'gauge-small' ? '50px' :
                kind === 'mini' ? '40px' : '100%';

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

    // Hide legacy overlays from canvas gauges
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

/* ---------- Data helpers ---------- */
function build24hSeries(stepMs = 60_000) {
    const baseDate = '2024-09-07';
    const start = new Date(`${baseDate}T00:00:00`).getTime();
    const end = new Date(`${baseDate}T23:59:59`).getTime();
    const speedSeries = [];
    const msgSeries = [];
    for (let t = start, i = 0; t <= end; t += stepMs, i++) {
        const dayFrac = (t - start) / (24 * 3600 * 1000);
        // demo curves; replace with your real values
        const speedVal = Math.max(0, 80 * Math.sin((dayFrac - 0.5) * Math.PI) + 15 + 10 * Math.sin(i / 40));
        const msgVal = Math.max(0, 85 * Math.sin((dayFrac - 0.45) * Math.PI) + 12 + 8 * Math.cos(i / 35));
        speedSeries.push([t, speedVal]);
        msgSeries.push([t, msgVal]);
    }
    return { baseDate, speedSeries, msgSeries };
}

const mean = series => series.reduce((a, [, v]) => a + v, 0) / series.length;

// nearest point in a sorted [time,value][] series
function findNearest(series, target) {
    let lo = 0, hi = series.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (series[mid][0] < target) lo = mid + 1; else hi = mid;
    }
    const cand1 = series[lo];
    const cand0 = series[Math.max(0, lo - 1)];
    return Math.abs(cand0[0] - target) <= Math.abs(cand1[0] - target) ? cand0 : cand1;
}

/* ---------- TZ popup helpers ---------- */
const USER_TZ = 'Asia/Dhaka'; // your requested time zone
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
        el.style.position = 'fixed';
        el.style.zIndex = '9999';
        el.style.pointerEvents = 'none';
        el.style.background = 'rgba(0,0,0,0.8)';
        el.style.color = '#fff';
        el.style.font = '12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial';
        el.style.padding = '8px 10px';
        el.style.borderRadius = '6px';
        el.style.boxShadow = '0 4px 12px rgba(0,0,0,.25)';
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

/* ------------------ Charts (time axis) ------------------ */
function initChartsContinuous() {
    const STEP_MS = 60_000; // 1-minute data (use 1000 for per-second)
    const { baseDate: DAY, speedSeries, msgSeries } = build24hSeries(STEP_MS);

    const baseGrid = { top: 26, right: 18, bottom: 36, left: 46, containLabel: false };

    const xMin = new Date(`${DAY}T00:00:00`).getTime();
    const xMax = new Date(`${DAY}T23:59:59`).getTime();

    const xTime = {
        type: 'time',
        boundaryGap: false,
        min: xMin,
        max: xMax,
        minInterval: 1,
        axisLine: { lineStyle: { color: '#d6d6d6' } },
        axisTick: { show: false },
        axisLabel: {
            color: '#6b6b6b',
            formatter: (v) => echarts.format.formatTime('hh:mm:ss', v)
        },
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
        {
            type: 'inside',
            xAxisIndex: 0,
            filterMode: 'none',
            zoomOnMouseWheel: true,
            moveOnMouseMove: true,
            moveOnMouseWheel: true,
            preventDefaultMouseMove: true,
            realtime: true,
            throttle: 0,
            minSpan: 1
        },
        {
            type: 'slider',
            xAxisIndex: 0,
            filterMode: 'none',
            bottom: 6,
            height: 16,
            labelFormatter: v => echarts.format.formatTime('hh:mm:ss', v)
        }
    ];

    // Initial focus at 14:00
    let focusTime = new Date(`${DAY}T14:00:00`).getTime();

    // Dynamic shadow span: 20% of current visible window, clamped (≥ 2 steps, ≤ 30 min)
    function computeShadowSpanMs(visStart, visEnd) {
        const span = Math.max((visEnd - visStart) * 0.2, STEP_MS * 2);
        return Math.min(span, 30 * 60 * 1000); // ≤ 30 minutes
        // tweak as you like
    }

    // --- Build chart options ---
    const speedOpt = {
        grid: baseGrid,
        tooltip: { trigger: 'axis', axisPointer: { type: 'line' } },
        xAxis: xTime,
        yAxis: yVal(0, 100),
        dataZoom: zoom,
        series: [{
            id: 'speed',
            name: 'AVG_speedkmh',
            type: 'line',
            data: speedSeries,
            smooth: true,
            symbol: 'none',
            sampling: 'lttb',
            lineStyle: { width: 2, color: '#4a90e2' },
            areaStyle: {
                opacity: 1,
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(74,144,226,0.25)' },
                    { offset: 1, color: 'rgba(74,144,226,0.04)' }
                ])
            },
            // markArea/markLine/markPoint are injected via updateFocus()
        }]
    };

    const msgOpt = {
        grid: baseGrid,
        tooltip: { trigger: 'axis', axisPointer: { type: 'line' } },
        xAxis: xTime,
        yAxis: yVal(0, 100),
        dataZoom: zoom,
        series: [{
            id: 'msg',
            name: 'AVG_s01pid0d_vehiclespeed',
            type: 'line',
            data: msgSeries,
            smooth: true,
            symbol: 'none',
            sampling: 'lttb',
            lineStyle: { width: 2, color: '#27ae60' },
            areaStyle: {
                opacity: 1,
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(39,174,96,0.25)' },
                    { offset: 1, color: 'rgba(39,174,96,0.04)' }
                ])
            }
        }]
    };

    const speedChart = mountChart('speedChart', speedOpt);
    const msgChart = mountChart('messageChart', msgOpt);

    // Reusable: compute current visible window (absolute start/end values)
    function currentVisibleRange(chart) {
        const opt = chart.getOption();
        // try to read absolute values from any dataZoom
        const dz = (opt.dataZoom && (opt.dataZoom[0] || opt.dataZoom[1])) || {};
        let start = dz.startValue ?? (xMin + (xMax - xMin) * ((dz.start ?? 0) / 100));
        let end = dz.endValue ?? (xMin + (xMax - xMin) * ((dz.end ?? 100) / 100));
        // sanity clamp
        start = Math.max(xMin, Math.min(start, xMax));
        end = Math.max(xMin, Math.min(end, xMax));
        if (end < start) [start, end] = [end, start];
        return [start, end];
    }

    // Update orange pointer + dashed vertical + moving shadow on BOTH charts
    function updateFocus(centerTs, visStart, visEnd) {
        focusTime = centerTs;
        const nearest = findNearest(speedSeries, focusTime);
        const shadowSpan = computeShadowSpanMs(visStart, visEnd);
        const areaStart = Math.max(xMin, centerTs - shadowSpan / 2);
        const areaEnd = Math.min(xMax, centerTs + shadowSpan / 2);

        // SPEED: vertical dashed line + orange dot + moving shadow + horizontal average
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
                markPoint: {
                    data: [{ coord: [nearest[0], nearest[1]] }],
                    symbol: 'circle', symbolSize: 10,
                    itemStyle: { color: '#ffb400', borderColor: '#fff', borderWidth: 2 }
                },
                markArea: {
                    itemStyle: { color: 'rgba(60,60,60,0.22)' },
                    data: [[{ xAxis: areaStart }, { xAxis: areaEnd }]]
                }
            }]
        }, { replaceMerge: ['series'] });

        // MESSAGE: moving shadow (same window)
        msgChart.setOption({
            series: [{
                id: 'msg',
                markArea: {
                    itemStyle: { color: 'rgba(60,60,60,0.18)' },
                    data: [[{ xAxis: areaStart }, { xAxis: areaEnd }]]
                }
            }]
        }, { replaceMerge: ['series'] });
    }

    // Initialize focus based on initial window center
    {
        const [vs, ve] = currentVisibleRange(speedChart);
        updateFocus((vs + ve) / 2, vs, ve);
    }

    // Keep focus & shadow updated when zoom changes on either chart
    function onZoom(params) {
        const chart = params && params.batch ? this : speedChart; // bound chart
        const [vs, ve] = currentVisibleRange(chart);
        const mid = (vs + ve) / 2;
        updateFocus(mid, vs, ve);
    }
    speedChart.on('dataZoom', onZoom);
    msgChart.on('dataZoom', onZoom);

    // Click anywhere: move focus there and show TZ popup
    function attachClicks(chart) {
        chart.getZr().on('click', (zrEvt) => {
            const pixel = [zrEvt.offsetX, zrEvt.offsetY];
            const coord = chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, pixel);
            const ts = Array.isArray(coord) ? coord[0] : coord; // time value in ms
            if (!ts || isNaN(ts)) return;

            // re-compute visible range from the "main" chart for shadow size
            const [vs, ve] = currentVisibleRange(speedChart);
            updateFocus(ts, vs, ve);

            // show TZ popup near cursor
            showTZPopup(zrEvt.event.clientX, zrEvt.event.clientY, ts);
        });

        // Double-click to reset zoom (full day)
        chart.getZr().on('dblclick', () => {
            [speedChart, msgChart].forEach(c => {
                c.dispatchAction({ type: 'dataZoom', startValue: xMin, endValue: xMax });
            });
            const mid = (xMin + xMax) / 2;
            updateFocus(mid, xMin, xMax);
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
            type: 'gauge',
            startAngle: 210, endAngle: -30,
            min: 0, max,
            center: ['50%', '65%'],
            radius: '95%',
            pointer: { show: false },
            anchor: { show: false },
            progress: { show: true, roundCap: true, width: 6, itemStyle: { color } },
            axisLine: { lineStyle: { width: 6, color: [[1, '#e0e0e0']] } },
            splitLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false },
            detail: {
                valueAnimation: true,
                fontSize: small ? 12 : 14,
                color,
                offsetCenter: [0, '0%'],
                formatter: val => small ? Number(val).toFixed(1) : Math.round(val)
            },
            data: [{ value }]
        }]
    };
}

function initGaugesECharts() {
    mountChart('fuelGauge', gaugeOption(32, 100, '#ff8c00', false), 'gauge-big');
    mountChart('loadGauge', gaugeOption(22, 100, '#3498db', false), 'gauge-big');
    mountChart('torqueGauge', gaugeOption(16, 100, '#3498db', false), 'gauge-big');

    mountChart('coolantGauge', gaugeOption(76.1, 100, '#27ae60', true), 'gauge-small');
    mountChart('intakeGauge', gaugeOption(28.9, 100, '#27ae60', true), 'gauge-small');
    mountChart('ambientGauge', gaugeOption(19.7, 100, '#3498db', true), 'gauge-small');
}
