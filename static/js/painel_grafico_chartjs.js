// Painel Gráfico - versão Chart.js
(function () {
  window.AppPanel = window.AppPanel || { charts: {}, mounted: false, tabsBound: false, mergeMounted: false };
  window.AppPanel.mergeMounted = window.AppPanel.mergeMounted || false;

  function readJson(id, fallback) {
    const el = document.getElementById(id);
    if (!el) return fallback;
    try {
      return JSON.parse(el.textContent || '');
    } catch (err) {
      console.warn(`Falha ao ler JSON de ${id}:`, err);
      return fallback;
    }
  }

  const SETOR_LABELS = readJson('data-setor-labels', []);
  const SETOR_SERIES = readJson('data-setor-series', []);
  const TIPO_LABELS = readJson('data-tipo-labels', []);
  const TIPO_SERIES = readJson('data-tipo-series', []);
  const TURNO_LABELS = readJson('data-turno-labels', []);
  const TURNO_SERIES = readJson('data-turno-series', []);
  const STACKED_CATEGORIES = readJson('data-stacked-categories', []);
  const STACKED_SERIES = readJson('data-stacked-series', []);
  const maxVal = Math.max(0, ...TIPO_SERIES);
  const maxIndex = TIPO_SERIES.findIndex((value) => value === maxVal);
  const TIMELINE = readJson('data-timeline', []);
  const MERGE_COLAB_PERCENT = readJson('data-merge-colab-percent', null);
  const AVAILABLE_SETORES = readJson('data-available-setores', []);
  const AVAILABLE_TIPOS = readJson('data-available-tipos', []);
  const AVAILABLE_SUPERVISORES = readJson('data-available-supervisores', []);
  const SELECTED_SETOR = readJson('data-selected-setor', 'all');
  const SELECTED_TIPO = readJson('data-selected-tipo', 'all');
  const SELECTED_SUPERVISOR = readJson('data-selected-supervisor', 'all');

  let chartDefaultsApplied = false;

  function ensureChartSetup() {
    if (typeof window.Chart === 'undefined') {
      console.error('Chart.js não foi carregado.');
      return false;
    }

    if (!chartDefaultsApplied) {
      const { Chart } = window;
      if (window.ChartDataLabels) {
        Chart.register(window.ChartDataLabels);
      }
      Chart.defaults.font.family = "'Segoe UI', system-ui, sans-serif";
      Chart.defaults.color = '#1f2937';
      Chart.defaults.plugins.legend.labels.usePointStyle = true;
      chartDefaultsApplied = true;
    }

    return true;
  }

  function getCssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name);
    return value ? value.trim() : fallback;
  }

  function getChartThemeConfig(mode) {
    const colors = [];
    for (let idx = 1; idx <= 8; idx += 1) {
      const value = getCssVar(`--chart-color-${idx}`, '').trim();
      if (value) {
        colors.push(value);
      }
    }
    if (!colors.length) {
      colors.push(getCssVar('--accent-color', mode === 'dark' ? '#60a5fa' : '#2563eb'));
    }

    const emphasis = getCssVar('--chart-color-emphasis', '#fbbf24');
    const neutral = getCssVar('--chart-neutral', mode === 'dark' ? '#94a3b8' : '#64748b');
    const gridColor = getCssVar('--chart-grid-color', mode === 'dark' ? 'rgba(148, 163, 184, 0.18)' : 'rgba(15, 23, 42, 0.08)');
    const gridDim = getCssVar('--chart-grid-dim', mode === 'dark' ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.06)');
    const tooltipBg = getCssVar('--chart-tooltip-bg', mode === 'dark' ? 'rgba(15, 23, 42, 0.94)' : 'rgba(248, 250, 252, 0.98)');
    const tooltipBorder = getCssVar('--chart-tooltip-border', mode === 'dark' ? '1px solid rgba(100, 116, 139, 0.35)' : '1px solid rgba(148, 163, 184, 0.45)');
    const tooltipText = getCssVar('--chart-tooltip-text', mode === 'dark' ? '#e2e8f0' : '#1f2937');
    const areaFill = getCssVar('--chart-area-fill', mode === 'dark' ? 'rgba(96, 165, 250, 0.22)' : 'rgba(52, 152, 219, 0.18)');
    const areaStrong = getCssVar('--chart-area-strong', mode === 'dark' ? 'rgba(56, 189, 248, 0.38)' : 'rgba(52, 152, 219, 0.45)');

    return {
      colors,
      emphasis,
      neutral,
      gridColor,
      gridDim,
      tooltipBg,
      tooltipBorder,
      tooltipText,
      areaFill,
      areaStrong
    };
  }

  function adjustColor(hex, factor) {
    if (!hex || !hex.startsWith('#')) return hex;
    const clean = hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;
    const num = parseInt(clean.slice(1), 16);
    const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + Math.round(255 * factor)));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + Math.round(255 * factor)));
    const b = Math.min(255, Math.max(0, (num & 0xff) + Math.round(255 * factor)));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  function hexToRgba(hex, alpha) {
    if (!hex || !hex.startsWith('#')) return hex;
    const clean = hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;
    const num = parseInt(clean.slice(1), 16);
    const r = (num >> 16) & 0xff;
    const g = (num >> 8) & 0xff;
    const b = num & 0xff;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function mixHexColors(colorA, colorB, factor) {
    if (!colorA || !colorB) return colorA || colorB;
    const normalize = (hex) => {
      if (!hex.startsWith('#')) return hex;
      if (hex.length === 4) {
        return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
      }
      return hex.slice(0, 7);
    };
    const clamp = (val, min = 0, max = 1) => Math.min(Math.max(val, min), max);
    const parse = (hex) => {
      if (!hex || !hex.startsWith('#')) return { r: 0, g: 0, b: 0 };
      const clean = normalize(hex);
      return {
        r: parseInt(clean.slice(1, 3), 16),
        g: parseInt(clean.slice(3, 5), 16),
        b: parseInt(clean.slice(5, 7), 16)
      };
    };
    const colA = parse(normalize(colorA));
    const colB = parse(normalize(colorB));
    const t = clamp(factor);
    const lerp = (a, b) => Math.round(a + (b - a) * t);
    const r = lerp(colA.r, colB.r).toString(16).padStart(2, '0');
    const g = lerp(colA.g, colB.g).toString(16).padStart(2, '0');
    const b = lerp(colA.b, colB.b).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  function getReadableTextColor(hex, fallback = '#f8fafc') {
    if (!hex || !hex.startsWith('#')) return fallback;
    const clean = hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex.slice(0, 7);
    const num = parseInt(clean.slice(1), 16);
    const r = (num >> 16) & 0xff;
    const g = (num >> 8) & 0xff;
    const b = num & 0xff;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#0f172a' : '#f8fafc';
  }

  function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') return null;
    const value = hex.trim();
    if (!value.startsWith('#')) return null;
    const clean = value.length === 4
      ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
      : value.slice(0, 7);
    const num = Number.parseInt(clean.slice(1), 16);
    if (Number.isNaN(num)) return null;
    return {
      r: (num >> 16) & 0xff,
      g: (num >> 8) & 0xff,
      b: num & 0xff
    };
  }

  function rgbToHex(r, g, b) {
    const clamp = (value) => Math.min(255, Math.max(0, Math.round(Number(value) || 0)));
    return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
  }

  function normalizeColor(color) {
    if (!color || typeof color !== 'string') return null;
    const value = color.trim();
    const hexMatch = value.match(/#([0-9a-f]{3,8})/i);
    if (hexMatch) {
      let hex = `#${hexMatch[1]}`;
      if (hex.length === 4) {
        hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
      } else if (hex.length === 5) {
        hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
      } else if (hex.length > 7) {
        hex = hex.slice(0, 7);
      }
      return hex.toLowerCase();
    }
    const rgbMatch = value.match(/rgba?\(([^)]+)\)/i);
    if (rgbMatch) {
      const parts = rgbMatch[1]
        .split(',')
        .map((part) => Number.parseFloat(part.trim()))
        .filter((part) => Number.isFinite(part));
      if (parts.length >= 3) {
        return rgbToHex(parts[0], parts[1], parts[2]).toLowerCase();
      }
    }
    return null;
  }

  function hexToHsl(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return { h: 0, s: 0, l: 0 };
    let { r, g, b } = rgb;
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        default:
          h = (r - g) / d + 4;
          break;
      }
      h /= 6;
    }
    return { h: h * 360, s, l };
  }

  function hslToHex(h, s, l) {
    const hue = (((h % 360) + 360) % 360) / 360;
    const sat = Math.min(1, Math.max(0, s));
    const lig = Math.min(1, Math.max(0, l));
    if (sat === 0) {
      const val = lig * 255;
      return rgbToHex(val, val, val);
    }
    const q = lig < 0.5 ? lig * (1 + sat) : lig + sat - lig * sat;
    const p = 2 * lig - q;
    const hue2rgb = (pVal, qVal, t) => {
      let temp = t;
      if (temp < 0) temp += 1;
      if (temp > 1) temp -= 1;
      if (temp < 1 / 6) return pVal + (qVal - pVal) * 6 * temp;
      if (temp < 1 / 2) return qVal;
      if (temp < 2 / 3) return pVal + (qVal - pVal) * (2 / 3 - temp) * 6;
      return pVal;
    };
    const r = hue2rgb(p, q, hue + 1 / 3);
    const g = hue2rgb(p, q, hue);
    const b = hue2rgb(p, q, hue - 1 / 3);
    return rgbToHex(r * 255, g * 255, b * 255);
  }

  function shiftColor(hex, shifts = {}) {
    if (!hex || typeof hex !== 'string') return hex;
    const normalized = normalizeColor(hex);
    if (!normalized) return hex;
    const { h = 0, s = 0, l = 0 } = shifts;
    const base = hexToHsl(normalized);
    const newH = ((base.h + h) % 360 + 360) % 360;
    const newS = Math.min(1, Math.max(0, base.s + s));
    const newL = Math.min(1, Math.max(0, base.l + l));
    return hslToHex(newH, newS, newL);
  }

  function createCuratedPalette(mode) {
    const curated = [
      normalizeColor(getCssVar('--accent-color', mode === 'dark' ? '#60a5fa' : '#2563eb')),
      normalizeColor(getCssVar('--accent-hover', mode === 'dark' ? '#3b82f6' : '#1d4ed8')),
      normalizeColor(getCssVar('--success-color', mode === 'dark' ? '#34d399' : '#16a34a')),
      normalizeColor(getCssVar('--warning-color', mode === 'dark' ? '#fbbf24' : '#f59e0b')),
      normalizeColor(getCssVar('--danger-color', mode === 'dark' ? '#f87171' : '#dc2626')),
      normalizeColor(getCssVar('--info-color', mode === 'dark' ? '#38bdf8' : '#0ea5e9')),
      mode === 'dark' ? '#a855f7' : '#7c3aed',
      mode === 'dark' ? '#f472b6' : '#db2777',
      mode === 'dark' ? '#2dd4bf' : '#0d9488',
      mode === 'dark' ? '#fde047' : '#facc15',
      mode === 'dark' ? '#fb923c' : '#f97316',
      mode === 'dark' ? '#60a5fa' : '#3b82f6'
    ];
    const fallback = mode === 'dark'
      ? ['#60a5fa', '#34d399', '#fb923c', '#a855f7', '#f472b6', '#38bdf8', '#fde047', '#2dd4bf', '#818cf8', '#fca5a5']
      : ['#2563eb', '#10b981', '#f97316', '#7c3aed', '#ec4899', '#0ea5e9', '#facc15', '#14b8a6', '#6366f1', '#f87171'];
    const combined = [...curated, ...fallback];
    const seen = new Set();
    return combined
      .map(normalizeColor)
      .filter((color) => {
        if (!color) return false;
        if (seen.has(color)) return false;
        seen.add(color);
        return true;
      });
  }

  function buildPalette(size, paletteBase, mode = 'light') {
    const curated = createCuratedPalette(mode);
    const baseList = Array.isArray(paletteBase) ? paletteBase.map(normalizeColor) : [];
    const baseColors = [...baseList, ...curated].filter(Boolean);
    if (!baseColors.length) {
      baseColors.push(mode === 'dark' ? '#60a5fa' : '#2563eb');
    }
    const steps = mode === 'dark' ? [0, 0.08, -0.12] : [0, -0.14, 0.12];
    const saturationDelta = mode === 'dark' ? -0.04 : 0.05;
    const palette = [];
    let index = 0;
    while (palette.length < size) {
      const baseColor = baseColors[index % baseColors.length];
      const cycle = Math.floor(index / baseColors.length);
      const lightnessShift = steps[cycle % steps.length];
      const saturationShift = cycle % 2 === 0 ? saturationDelta : -saturationDelta / 2;
      const hueShift = cycle % 3 === 0 ? 0 : cycle % 3 === 1 ? 4 : -6;
      const variant = shiftColor(baseColor, { l: lightnessShift, s: saturationShift, h: hueShift });
      palette.push(variant);
      index += 1;
    }
    return palette.slice(0, size);
  }

  function ensureTooltipEl(chart, options = {}) {
    if (!chart || !chart.canvas) return null;
    const {
      mode = document.documentElement.dataset.bsTheme === 'dark' ? 'dark' : 'light',
      textColor,
      minWidth = 220,
      background,
      border,
      boxShadow
    } = options;
    const parent = chart.canvas.parentNode;
    if (!parent) return null;
    if (window.getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }
    const selector = `.chart-tooltip[data-chart="${chart.canvas.id || 'chart'}"]`;
    let tooltipEl = parent.querySelector(selector);
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'chart-tooltip';
      tooltipEl.dataset.chart = chart.canvas.id || 'chart';
      Object.assign(tooltipEl.style, {
        position: 'absolute',
        pointerEvents: 'none',
        opacity: '0',
        transform: 'translate(-50%, calc(-100% - 18px))',
        transition: 'opacity 120ms ease, transform 120ms ease',
        borderRadius: '12px',
        padding: '14px 16px',
        zIndex: '20'
      });
      parent.appendChild(tooltipEl);
    }
    const resolvedMode = mode === 'dark' ? 'dark' : 'light';
    const computedBackground = background || (resolvedMode === 'dark'
      ? 'linear-gradient(135deg, rgba(15,23,42,0.94) 0%, rgba(15,23,42,0.88) 100%)'
      : 'linear-gradient(135deg, rgba(248,250,252,0.98) 0%, rgba(255,255,255,0.96) 100%)');
    const computedBorder = border || (resolvedMode === 'dark'
      ? '1px solid rgba(100, 116, 139, 0.35)'
      : '1px solid rgba(148, 163, 184, 0.45)');
    const computedBoxShadow = boxShadow || (resolvedMode === 'dark'
      ? '0 18px 48px rgba(15, 23, 42, 0.55)'
      : '0 18px 44px rgba(15, 23, 42, 0.15)');
    tooltipEl.style.background = computedBackground;
    tooltipEl.style.border = computedBorder;
    tooltipEl.style.boxShadow = computedBoxShadow;
    tooltipEl.style.minWidth = typeof minWidth === 'number' ? `${minWidth}px` : String(minWidth);
    tooltipEl.style.color = textColor || (resolvedMode === 'dark' ? '#e2e8f0' : '#1f2937');
    return tooltipEl;
  }

  function destroyExistingCharts() {
    if (!window.AppPanel.charts) return;
    Object.values(window.AppPanel.charts).forEach((chart) => {
      if (chart && typeof chart.destroy === 'function') {
        try {
          chart.destroy();
        } catch (err) {
          console.warn('Falha ao destruir gráfico Chart.js', err);
        }
      }
    });
    window.AppPanel.charts = {};
    window.AppPanel.mergeMounted = false;
  }

  function renderTipoChart(ctx, palette, mode) {
    const total = TIPO_SERIES.reduce((sum, value) => sum + (value || 0), 0);
    const maxVal = Math.max(0, ...TIPO_SERIES);
    const maxIndex = TIPO_SERIES.findIndex((value) => value === maxVal);
    const bars = TIPO_SERIES.map((value, idx) => {
      const base = palette[idx % palette.length];
      if (idx === maxIndex) {
        return adjustColor(base, mode === 'dark' ? 0.25 : 0.12);
      }
      return base;
    });
    const borderColors = TIPO_SERIES.map((_, idx) => adjustColor(palette[idx % palette.length], -0.15));
    const labelColor = mode === 'dark' ? '#e2e8f0' : '#1f2937';
    const subtleColor = mode === 'dark' ? '#94a3b8' : '#64748b';
    const rankingMap = TIPO_SERIES
      .map((value, idx) => ({ value, idx }))
      .sort((a, b) => (b.value || 0) - (a.value || 0))
      .reduce((acc, item, rank) => {
        acc[item.idx] = rank + 1;
        return acc;
      }, {});
    const dividerColor = mode === 'dark' ? 'rgba(100, 116, 139, 0.35)' : 'rgba(148, 163, 184, 0.35)';

    const externalTooltipHandler = (context) => {
      const { chart, tooltip } = context;
      const tooltipEl = ensureTooltipEl(chart, { mode, textColor: labelColor, minWidth: 240 });
      if (!tooltipEl) return;
      if (!tooltip || tooltip.opacity === 0 || !tooltip.dataPoints || !tooltip.dataPoints.length) {
        tooltipEl.style.opacity = '0';
        return;
      }

      const dataPoint = tooltip.dataPoints[0];
      const idx = dataPoint.dataIndex ?? 0;
      const label = dataPoint.label || TIPO_LABELS[idx] || '';
      const value = TIPO_SERIES[idx] || 0;
      const perc = total > 0 ? (value / total) * 100 : 0;
      const rank = rankingMap[idx] || 0;
      const leaderValue = maxVal || 0;
      const deltaLeader = leaderValue - value;
      const participationColor = adjustColor(palette[idx % palette.length] || palette[0] || '#2563eb', mode === 'dark' ? 0.18 : -0.05);
      const rankingColor = rank === 1 ? '#22c55e' : '#fbbf24';
      const deltaText = rank === 1 ? 'Líder da categoria' : `${deltaLeader > 0 ? '-' : ''}${Math.abs(deltaLeader).toLocaleString('pt-BR')}`;

      const subtle = mode === 'dark' ? 'rgba(148, 163, 184, 0.75)' : 'rgba(100, 116, 139, 0.85)';
      tooltipEl.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div style="display:flex; flex-direction:column; gap:4px;">
            <div style="font-weight:700; font-size:14px;">${label}</div>
            <div style="font-size:12px; color:${subtle};">Tipos • Matrículas</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:6px; font-size:13px;">
            <div style="display:flex; justify-content:space-between; gap:16px;">
              <span style="color:${subtle};">Volume</span>
              <strong style="font-weight:700;">${value.toLocaleString('pt-BR')}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; gap:16px; color:${participationColor};">
              <span>Participação</span>
              <strong>${perc.toFixed(1)}%</strong>
            </div>
            <div style="display:flex; justify-content:space-between; gap:16px; color:${rankingColor};">
              <span>Ranking</span>
              <strong>${rank}º lugar</strong>
            </div>
            <div style="display:flex; justify-content:space-between; gap:16px;">
              <span style="color:${subtle};">Distância p/ líder</span>
              <strong>${deltaText}</strong>
            </div>
          </div>
          <div style="border-top:1px solid ${dividerColor}; padding-top:6px; font-size:11px; color:${subtle};">
            Total geral: ${total.toLocaleString('pt-BR')} matrículas
          </div>
        </div>
      `;

      const { offsetLeft, offsetTop } = chart.canvas;
      tooltipEl.style.opacity = '1';
      tooltipEl.style.left = `${offsetLeft + tooltip.caretX}px`;
      tooltipEl.style.top = `${offsetTop + tooltip.caretY}px`;
      tooltipEl.style.transform = 'translate(-50%, calc(-100% - 18px))';
    };

    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels: TIPO_LABELS,
        datasets: [
          {
            label: 'Matrículas',
            data: TIPO_SERIES,
            backgroundColor: bars,
            borderColor: borderColors,
            borderWidth: 1,
            borderRadius: 8,
            borderSkipped: false,
            hoverBackgroundColor: (context) => {
              const color = bars[context.dataIndex] || palette[0];
              return adjustColor(color, mode === 'dark' ? 0.15 : -0.05);
            }
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: {
              color: subtleColor,
              maxRotation: 30,
              minRotation: 0,
              callback: function (value) {
                const label = this.getLabelForValue(value);
                return label && label.length > 16 ? `${label.slice(0, 14)}…` : label;
              }
            },
            grid: { display: false },
            border: { display: false }
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: subtleColor,
              precision: 0
            },
            title: {
              display: true,
              text: 'Matrículas',
              color: subtleColor,
              font: { weight: 600 }
            },
            grid: {
              color: mode === 'dark' ? 'rgba(148, 163, 184, 0.18)' : 'rgba(15, 23, 42, 0.08)'
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: externalTooltipHandler
          },
          datalabels: {
            anchor: 'end',
            align: 'end',
            offset: -12,
            clamp: true,
            padding: { top: 4, bottom: 4, left: 8, right: 8 },
            borderRadius: 8,
            backgroundColor: (context) => {
              const bg = Array.isArray(context.dataset.backgroundColor)
                ? context.dataset.backgroundColor[context.dataIndex]
                : context.dataset.backgroundColor;
              const baseColor = typeof bg === 'string' ? bg : '#1f2937';
              return hexToRgba(adjustColor(baseColor, -0.2), 0.65);
            },
            color: (context) => {
              const bg = Array.isArray(context.dataset.backgroundColor)
                ? context.dataset.backgroundColor[context.dataIndex]
                : context.dataset.backgroundColor;
              return getReadableTextColor(typeof bg === 'string' ? bg : '#1f2937');
            },
            font: { weight: '700', size: 12 },
            formatter: (value) => (value > 0 ? value.toLocaleString('pt-BR') : '')
          }
        }
      }
    });
  }

  function renderTurnoChart(ctx, palette, mode) {
    const total = TURNO_SERIES.reduce((sum, value) => sum + (value || 0), 0);
    const subtleColor = mode === 'dark' ? '#94a3b8' : '#64748b';
    const border = mode === 'dark' ? '#0f172a' : '#ffffff';
    const average = TURNO_SERIES.length ? total / TURNO_SERIES.length : 0;
    const baseTextColor = mode === 'dark' ? '#e2e8f0' : '#1f2937';
    const rankingMap = TURNO_SERIES
      .map((value, idx) => ({ value, idx }))
      .sort((a, b) => (b.value || 0) - (a.value || 0))
      .reduce((acc, item, rank) => {
        acc[item.idx] = rank + 1;
        return acc;
      }, {});
    const dividerColor = mode === 'dark' ? 'rgba(100, 116, 139, 0.35)' : 'rgba(148, 163, 184, 0.35)';

    const externalTooltipHandler = (context) => {
      const { chart, tooltip } = context;
      const tooltipEl = ensureTooltipEl(chart, { mode, textColor: baseTextColor, minWidth: 240 });
      if (!tooltipEl) return;
      if (!tooltip || tooltip.opacity === 0 || !tooltip.dataPoints || !tooltip.dataPoints.length) {
        tooltipEl.style.opacity = '0';
        return;
      }

      const dataPoint = tooltip.dataPoints[0];
      const idx = dataPoint.dataIndex ?? 0;
      const label = TURNO_LABELS[idx] || dataPoint.label || '';
      const value = TURNO_SERIES[idx] || 0;
      const perc = total > 0 ? (value / total) * 100 : 0;
      const rank = rankingMap[idx] || 0;
      const paletteColor = palette[idx % palette.length] || palette[0] || '#0ea5e9';
      const participationColor = adjustColor(paletteColor, mode === 'dark' ? 0.22 : -0.04);
      const deltaAverage = value - average;
      const averageColor = deltaAverage >= 0 ? '#22c55e' : '#ef4444';
      const subtle = mode === 'dark' ? 'rgba(148, 163, 184, 0.75)' : 'rgba(100, 116, 139, 0.85)';

      tooltipEl.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div style="display:flex; flex-direction:column; gap:4px;">
            <div style="font-weight:700; font-size:14px;">${label}</div>
            <div style="font-size:12px; color:${subtle};">Turnos • Distribuição</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:6px; font-size:13px;">
            <div style="display:flex; justify-content:space-between; gap:16px;">
              <span style="color:${subtle};">Volume</span>
              <strong style="font-weight:700;">${value.toLocaleString('pt-BR')}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; gap:16px; color:${participationColor};">
              <span>Participação</span>
              <strong>${perc.toFixed(1)}%</strong>
            </div>
            <div style="display:flex; justify-content:space-between; gap:16px; color:${rank === 1 ? '#22c55e' : '#fbbf24'};">
              <span>Ranking</span>
              <strong>${rank}º lugar</strong>
            </div>
            <div style="display:flex; justify-content:space-between; gap:16px; color:${averageColor};">
              <span>Vs. média</span>
              <strong>${deltaAverage >= 0 ? '+' : '-'}${Math.abs(deltaAverage).toLocaleString('pt-BR')}</strong>
            </div>
          </div>
          <div style="border-top:1px solid ${dividerColor}; padding-top:6px; font-size:11px; color:${subtle};">
            Total geral: ${total.toLocaleString('pt-BR')} matrículas
          </div>
        </div>
      `;

      const { offsetLeft, offsetTop } = chart.canvas;
      tooltipEl.style.opacity = '1';
      tooltipEl.style.left = `${offsetLeft + tooltip.caretX}px`;
      tooltipEl.style.top = `${offsetTop + tooltip.caretY}px`;
      tooltipEl.style.transform = 'translate(-50%, calc(-100% - 18px))';
    };

    return new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: TURNO_LABELS,
        datasets: [
          {
            label: 'Turnos',
            data: TURNO_SERIES,
            backgroundColor: TURNO_SERIES.map((_, idx) => palette[idx % palette.length]),
            borderColor: border,
            borderWidth: 2,
            hoverOffset: 8
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: subtleColor,
              font: { size: 12 }
            }
          },
          tooltip: {
            enabled: false,
            external: externalTooltipHandler
          },
          datalabels: {
            align: 'start',
            anchor: 'end',
            clamp: true,
            offset: 12,
            formatter: (value, context) => {
              const perc = total > 0 ? (value / total) * 100 : 0;
              if (perc < 6) return '';
              const valueLabel = value.toLocaleString('pt-BR');
              return `${valueLabel}\n${perc.toFixed(1)}%`;
            },
            backgroundColor: (context) => {
              const color = palette[context.dataIndex % palette.length];
              return hexToRgba(adjustColor(color, -0.15), 0.8);
            },
            color: (context) => getReadableTextColor(palette[context.dataIndex % palette.length]),
            borderRadius: 8,
            padding: { left: 8, right: 8, top: 6, bottom: 6 },
            font: { weight: '700', size: 11 },
            lineHeight: 1.1
          }
        }
      }
    });
  }

  function renderSetorChart(ctx, palette, mode) {
    const total = STACKED_SERIES.reduce((sum, value) => sum + (value || 0), 0);
    const subtleColor = mode === 'dark' ? '#94a3b8' : '#64748b';
    const labelColor = mode === 'dark' ? '#e2e8f0' : '#0f172a';
    const maxVal = Math.max(0, ...STACKED_SERIES);
    const maxIndex = STACKED_SERIES.findIndex((value) => value === maxVal);
    const average = STACKED_SERIES.length ? total / STACKED_SERIES.length : 0;
    const rankingMap = STACKED_SERIES
      .map((value, idx) => ({ value, idx }))
      .sort((a, b) => (b.value || 0) - (a.value || 0))
      .reduce((acc, item, rank) => {
        acc[item.idx] = rank + 1;
        return acc;
      }, {});
    const dividerColor = mode === 'dark' ? 'rgba(100, 116, 139, 0.35)' : 'rgba(148, 163, 184, 0.35)';

    const fills = STACKED_SERIES.map((value, idx) => {
      const base = palette[idx % palette.length];
      if (idx === maxIndex) {
        return adjustColor(base, mode === 'dark' ? 0.25 : 0.12);
      }
      return base;
    });

    const externalTooltipHandler = (context) => {
      const { chart, tooltip } = context;
      const tooltipEl = ensureTooltipEl(chart, { mode, textColor: labelColor, minWidth: 260 });
      if (!tooltipEl) return;
      if (!tooltip || tooltip.opacity === 0 || !tooltip.dataPoints || !tooltip.dataPoints.length) {
        tooltipEl.style.opacity = '0';
        return;
      }

      const dataPoint = tooltip.dataPoints[0];
      const idx = dataPoint.dataIndex ?? 0;
      const label = STACKED_CATEGORIES[idx] || dataPoint.label || '';
      const value = STACKED_SERIES[idx] || 0;
      const perc = total > 0 ? (value / total) * 100 : 0;
      const rank = rankingMap[idx] || 0;
      const paletteColor = palette[idx % palette.length] || palette[0] || '#2563eb';
      const participationColor = adjustColor(paletteColor, mode === 'dark' ? 0.18 : -0.04);
      const deltaAverage = value - average;
      const averageColor = deltaAverage >= 0 ? '#22c55e' : '#ef4444';
      const leaderDelta = maxVal - value;
      const leaderColor = rank === 1 ? '#22c55e' : '#fbbf24';
      const subtle = mode === 'dark' ? 'rgba(148, 163, 184, 0.75)' : 'rgba(100, 116, 139, 0.85)';
      const leaderText = rank === 1 ? 'Líder absoluto' : `${leaderDelta > 0 ? '-' : ''}${Math.abs(leaderDelta).toLocaleString('pt-BR')}`;

      tooltipEl.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div style="display:flex; flex-direction:column; gap:4px;">
            <div style="font-weight:700; font-size:14px;">${label}</div>
            <div style="font-size:12px; color:${subtle};">Setores • Volume total</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:6px; font-size:13px;">
            <div style="display:flex; justify-content:space-between; gap:16px;">
              <span style="color:${subtle};">Registros</span>
              <strong style="font-weight:700;">${value.toLocaleString('pt-BR')}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; gap:16px; color:${participationColor};">
              <span>Participação</span>
              <strong>${perc.toFixed(1)}%</strong>
            </div>
            <div style="display:flex; justify-content:space-between; gap:16px; color:${leaderColor};">
              <span>Ranking</span>
              <strong>${rank}º lugar</strong>
            </div>
            <div style="display:flex; justify-content:space-between; gap:16px; color:${averageColor};">
              <span>Vs. média</span>
              <strong>${deltaAverage >= 0 ? '+' : '-'}${Math.abs(deltaAverage).toLocaleString('pt-BR')}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; gap:16px;">
              <span style="color:${subtle};">Distância p/ líder</span>
              <strong>${leaderText}</strong>
            </div>
          </div>
          <div style="border-top:1px solid ${dividerColor}; padding-top:6px; font-size:11px; color:${subtle};">
            Total geral: ${total.toLocaleString('pt-BR')} registros
          </div>
        </div>
      `;

      const { offsetLeft, offsetTop } = chart.canvas;
      tooltipEl.style.opacity = '1';
      tooltipEl.style.left = `${offsetLeft + tooltip.caretX}px`;
      tooltipEl.style.top = `${offsetTop + tooltip.caretY}px`;
      tooltipEl.style.transform = 'translate(-50%, calc(-100% - 18px))';
    };

    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels: STACKED_CATEGORIES,
        datasets: [
          {
            label: 'Registros',
            data: STACKED_SERIES,
            backgroundColor: fills,
            borderColor: STACKED_SERIES.map((_, idx) => adjustColor(palette[idx % palette.length], -0.15)),
            borderWidth: 1,
            borderRadius: 10,
            borderSkipped: false
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              color: subtleColor,
              precision: 0
            },
            grid: {
              color: mode === 'dark' ? 'rgba(148, 163, 184, 0.18)' : 'rgba(15, 23, 42, 0.08)'
            }
          },
          y: {
            ticks: {
              color: subtleColor,
              callback: (value) => {
                const label = STACKED_CATEGORIES[value] || value;
                return label && label.length > 24 ? `${label.slice(0, 22)}…` : label;
              }
            },
            grid: { display: false },
            border: { display: false }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: externalTooltipHandler
          },
          datalabels: {
            anchor: 'end',
            align: (context) => {
              const value = context.dataset.data?.[context.dataIndex] || 0;
              return value > 0 ? 'end' : 'start';
            },
            offset: (context) => {
              const value = context.dataset.data?.[context.dataIndex] || 0;
              return value > 0 ? -12 : 0;
            },
            clamp: true,
            color: (context) => {
              const bg = Array.isArray(context.dataset.backgroundColor)
                ? context.dataset.backgroundColor[context.dataIndex]
                : context.dataset.backgroundColor;
              return getReadableTextColor(typeof bg === 'string' ? bg : '#1f2937');
            },
            backgroundColor: (context) => {
              const bg = Array.isArray(context.dataset.backgroundColor)
                ? context.dataset.backgroundColor[context.dataIndex]
                : context.dataset.backgroundColor;
              const baseColor = typeof bg === 'string' ? bg : '#1f2937';
              return hexToRgba(adjustColor(baseColor, -0.25), 0.65);
            },
            borderRadius: 8,
            padding: { left: 8, right: 8, top: 4, bottom: 4 },
            font: { weight: '700', size: 12 },
            formatter: (value) => (value > 0 ? value.toLocaleString('pt-BR') : '')
          }
        }
      }
    });
  }

  function renderTimelineChart(ctx, palette, mode) {
    const timelineData = TIMELINE.map(([x, y]) => ({ x, y }));
    if (!timelineData.length) {
      const container = ctx.canvas.closest('.chart-wrapper');
      if (container) {
        container.innerHTML = '<div class="text-muted text-center py-5">Nenhum dado temporal disponível</div>';
      }
      return null;
    }

    const values = timelineData.map((point) => point.y);
    const total = values.reduce((sum, value) => sum + value, 0);
    const average = values.length ? total / values.length : 0;
    const maxValue = Math.max(...values);
    const accent = palette[0] || '#3498db';
    const accentSoft = adjustColor(accent, 0.28);
    const accentStrong = adjustColor(accent, -0.08);
    const axisColor = mode === 'dark' ? '#cbd5f5' : '#1f2937';
    const basePoint = mode === 'dark' ? '#0f172a' : '#ffffff';
    const highlightColor = '#fbbf24';
    const progressiveColors = timelineData.map((_, idx) => {
      if (timelineData.length <= 1) return accent;
      const ratio = idx / (timelineData.length - 1);
      return mixHexColors(accentSoft, accentStrong, ratio);
    });

    const maxIndex = values.indexOf(maxValue);
    const { helpers } = window.Chart || {};
    const easing = helpers?.easingEffects?.easeOutQuad ?? ((t) => t);
    const totalPoints = Math.max(1, timelineData.length);
    const normalizedIndex = (ctx) => {
      if (typeof ctx.index !== 'number') return 0;
      return Math.min(1, Math.max(0, ctx.index / totalPoints));
    };
    const totalDuration = 5000;
    const duration = (ctx) => {
      if (ctx.type !== 'data') return 0;
      const eased = easing(normalizedIndex(ctx));
      return (Number.isFinite(eased) ? eased : 0) * totalDuration / totalPoints;
    };
    const delay = (ctx) => {
      if (ctx.type !== 'data') return 0;
      const eased = easing(normalizedIndex(ctx));
      return (Number.isFinite(eased) ? eased : 0) * totalDuration;
    };
    const previousY = (ctx) => {
      if (ctx.index === 0) {
        const firstValue = timelineData[0]?.y ?? 0;
        return ctx.chart.scales.y.getPixelForValue(firstValue);
      }
      const meta = ctx.chart.getDatasetMeta(ctx.datasetIndex);
      return meta.data[ctx.index - 1].getProps(['y'], true).y;
    };

    const progressiveAnimation = timelineData.length > 1 && timelineData.length <= 600 ? {
      x: {
        type: 'number',
        easing: 'linear',
        duration,
        from: NaN,
        delay(ctx) {
          if (ctx.type !== 'data' || ctx.xStarted) {
            return 0;
          }
          ctx.xStarted = true;
          return delay(ctx);
        }
      },
      y: {
        type: 'number',
        easing: 'linear',
        duration,
        from: previousY,
        delay(ctx) {
          if (ctx.type !== 'data' || ctx.yStarted) {
            return 0;
          }
          ctx.yStarted = true;
          return delay(ctx);
        }
      }
    } : undefined;

    const timelineHoverLine = {
      id: 'timelineHoverLine',
      afterDraw(chartInstance) {
        if (chartInstance.canvas?.id !== 'chart-timeline') return;
        const active = chartInstance.getActiveElements();
        const { chartArea } = chartInstance;
        if (!active || !active.length || !chartArea) return;
        const ctxCanvas = chartInstance.ctx;
        const xPosition = active[0].element.x;
        ctxCanvas.save();
        ctxCanvas.setLineDash([6, 4]);
        ctxCanvas.lineWidth = 1.2;
        ctxCanvas.strokeStyle = hexToRgba(accent, mode === 'dark' ? 0.55 : 0.35);
        ctxCanvas.beginPath();
        ctxCanvas.moveTo(xPosition, chartArea.bottom);
        ctxCanvas.lineTo(xPosition, chartArea.top);
        ctxCanvas.stroke();
        ctxCanvas.restore();
      },
      beforeDestroy(chartInstance) {
        if (chartInstance.canvas?.id !== 'chart-timeline') return;
        const tooltipEl = chartInstance.canvas.parentNode?.querySelector('.chart-tooltip[data-chart="chart-timeline"]');
        if (tooltipEl) {
          tooltipEl.remove();
        }
      }
    };

    const dataset = {
      label: 'Matrículas',
      data: timelineData,
      spanGaps: true,
      borderColor: accent,
      borderWidth: 3,
      borderCapStyle: 'round',
      borderJoinStyle: 'round',
      tension: 0.32,
      fill: true,
      segment: {
        borderColor: (ctx) => {
          const idx = Math.max(ctx.p0DataIndex, ctx.p1DataIndex);
          return progressiveColors[idx] || accent;
        },
        borderWidth: (ctx) => {
          const idx = Math.max(ctx.p0DataIndex, ctx.p1DataIndex);
          if (idx === maxIndex) return 3.6;
          const ratio = timelineData.length <= 1 ? 0 : idx / (timelineData.length - 1);
          return 2.6 + ratio * 0.9;
        }
      },
      backgroundColor: (context) => {
        const { chart } = context;
        const { ctx: canvasCtx, chartArea } = chart;
        if (!chartArea) return hexToRgba(accentSoft, 0.35);
        const gradient = canvasCtx.createLinearGradient(chartArea.left, chartArea.top, chartArea.left, chartArea.bottom);
        gradient.addColorStop(0, hexToRgba(accentSoft, 0.32));
        gradient.addColorStop(0.5, hexToRgba(accent, 0.18));
        gradient.addColorStop(1, hexToRgba(adjustColor(accent, -0.15), 0.05));
        return gradient;
      },
      pointRadius: (context) => {
        if (!context || context.dataIndex == null) return 3;
        const ratio = timelineData.length <= 1 ? 1 : context.dataIndex / (timelineData.length - 1);
        const base = 3.5 + ratio * 2.5;
        if (context.dataIndex === maxIndex) {
          return Math.max(base, 7);
        }
        return base;
      },
      pointHoverRadius: (context) => {
        if (!context || context.dataIndex == null) return 6;
        const ratio = timelineData.length <= 1 ? 1 : context.dataIndex / (timelineData.length - 1);
        const base = 6 + ratio * 2;
        return context.dataIndex === maxIndex ? Math.max(base, 8.5) : base;
      },
      pointBackgroundColor: (context) => {
        const idx = context.dataIndex;
        if (idx === maxIndex) return highlightColor;
        const color = progressiveColors[idx] || accent;
        return mixHexColors(color, basePoint, 0.35);
      },
      pointBorderColor: (context) => {
        const idx = context.dataIndex;
        if (idx === maxIndex) return adjustColor(highlightColor, -0.25);
        const color = progressiveColors[idx] || accent;
        return adjustColor(color, -0.2);
      },
      pointBorderWidth: (context) => (context.dataIndex === maxIndex ? 2.5 : 1.5),
      pointHoverBackgroundColor: (context) => {
        if (context.dataIndex === maxIndex) return adjustColor(highlightColor, 0.1);
        const color = progressiveColors[context.dataIndex] || accent;
        return adjustColor(color, 0.12);
      },
      pointHoverBorderColor: (context) => {
        if (context.dataIndex === maxIndex) return adjustColor(highlightColor, -0.35);
        const color = progressiveColors[context.dataIndex] || accent;
        return adjustColor(color, -0.3);
      },
      hitRadius: 14,
      hoverBorderWidth: 2,
      clip: 12
    };

    const externalTooltipHandler = (context) => {
      const { chart, tooltip } = context;
      if (!chart || chart.canvas.id !== 'chart-timeline') return;
      const tooltipEl = ensureTooltipEl(chart, { mode, textColor: axisColor, minWidth: 240 });
      if (!tooltipEl) return;
      if (!tooltip || tooltip.opacity === 0 || !tooltip.dataPoints || !tooltip.dataPoints.length) {
        tooltipEl.style.opacity = '0';
        return;
      }

      const dataPoint = tooltip.dataPoints[0];
      const idx = dataPoint.dataIndex ?? 0;
      const value = values[idx] ?? 0;
      const previous = idx > 0 ? values[idx - 1] : null;
      const deltaValue = previous === null ? null : value - previous;
      const deltaText = deltaValue === null
        ? '—'
        : `${deltaValue > 0 ? '+' : ''}${deltaValue.toLocaleString('pt-BR')}`;
      const variationColor = deltaValue === null
        ? '#9ca3af'
        : deltaValue > 0
          ? '#22c55e'
          : deltaValue < 0
            ? '#ef4444'
            : '#9ca3af';
      const trend = previous === null
        ? 'Sem histórico'
        : value > previous
          ? 'Crescimento'
          : value < previous
            ? 'Declínio'
            : 'Estável';
      const progressRatio = timelineData.length <= 1 ? 1 : idx / (timelineData.length - 1);
      const progressPercent = Math.round(progressRatio * 100);
      const progressColor = '#fbbf24';
      const date = new Date(dataPoint.parsed.x);
      const titleDate = date.toLocaleDateString('pt-BR', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      const titleTime = date.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const subtleColor = mode === 'dark' ? 'rgba(148, 163, 184, 0.75)' : 'rgba(100, 116, 139, 0.85)';
      tooltipEl.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div style="font-weight:700; font-size:14px; text-transform:capitalize;">${titleDate} — ${titleTime}</div>
          <div style="display:flex; flex-direction:column; gap:6px; font-size:13px;">
            <div style="display:flex; justify-content:space-between; gap:16px;">
              <span style="color:${subtleColor};">Matrículas</span>
              <strong style="font-weight:700;">${value.toLocaleString('pt-BR')}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; gap:16px; color:${progressColor};">
              <span>Progresso</span>
              <strong>${progressPercent}%</strong>
            </div>
            <div style="display:flex; justify-content:space-between; gap:16px; color:${variationColor};">
              <span>Variação</span>
              <strong>${deltaText}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; gap:16px;">
              <span style="color:${subtleColor};">Tendência</span>
              <strong>${trend}</strong>
            </div>
          </div>
          <div style="border-top:1px solid ${mode === 'dark' ? 'rgba(100, 116, 139, 0.35)' : 'rgba(148, 163, 184, 0.35)'}; padding-top:6px; font-size:11px; color:${subtleColor};">
            Média do período: ${Math.round(average)} matrículas
          </div>
        </div>
      `;

      const { offsetLeft, offsetTop } = chart.canvas;
      tooltipEl.style.opacity = '1';
      tooltipEl.style.left = `${offsetLeft + tooltip.caretX}px`;
      tooltipEl.style.top = `${offsetTop + tooltip.caretY}px`;
      tooltipEl.style.transform = 'translate(-50%, calc(-100% - 18px))';
    };

    const chartConfig = {
      type: 'line',
      data: { datasets: [dataset] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
          axis: 'x'
        },
        scales: {
          x: {
            type: 'time',
            adapters: { date: {} },
            time: {
              unit: 'day',
              tooltipFormat: "dd/MM/yyyy HH:mm"
            },
            ticks: {
              color: axisColor,
              maxRotation: 0,
              autoSkip: true
            },
            grid: {
              color: mode === 'dark' ? 'rgba(148, 163, 184, 0.18)' : 'rgba(15, 23, 42, 0.08)',
              drawBorder: false
            },
            border: { display: false }
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: axisColor,
              precision: 0
            },
            grid: {
              color: mode === 'dark' ? 'rgba(148, 163, 184, 0.18)' : 'rgba(15, 23, 42, 0.08)',
              drawBorder: false
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: externalTooltipHandler
          },
          datalabels: { display: false }
        }
      },
      plugins: [timelineHoverLine]
    };

    if (progressiveAnimation) {
      chartConfig.options.animation = progressiveAnimation;
    }

    return new Chart(ctx, chartConfig);
  }

  function buildMergeColabColorConfig(palette, mode) {
    const basePalette = palette && palette.length ? palette : buildPalette(4, null, mode);
    const baseColors = [
      basePalette[0] || '#2563eb',
      basePalette[2] || adjustColor(basePalette[0] || '#2563eb', mode === 'dark' ? -0.1 : 0.1)
    ];
    const softAlpha = mode === 'dark' ? 0.78 : 0.68;
    const hoverAlpha = mode === 'dark' ? 0.88 : 0.78;
    const colors = baseColors.map((color, idx) => {
      const softened = shiftColor(color, {
        l: mode === 'dark' ? 0.08 : 0.16,
        s: mode === 'dark' ? -0.05 : -0.12,
        h: idx === 1 ? 6 : 0
      });
      return hexToRgba(softened || color, softAlpha);
    });
    const hoverColors = baseColors.map((color, idx) => {
      const boosted = shiftColor(color, {
        l: mode === 'dark' ? 0.18 : -0.05,
        s: mode === 'dark' ? -0.02 : -0.05,
        h: idx === 1 ? -4 : 2
      });
      return hexToRgba(boosted || color, hoverAlpha);
    });
    const borderColors = baseColors.map((color) => adjustColor(color, mode === 'dark' ? -0.35 : -0.25));
    const legendColor = mode === 'dark' ? '#cbd5f5' : '#1f2937';
    const textColor = mode === 'dark' ? '#e2e8f0' : '#0f172a';
    const subtleColor = mode === 'dark' ? 'rgba(148, 163, 184, 0.78)' : 'rgba(100, 116, 139, 0.86)';
    return { baseColors, colors, hoverColors, borderColors, legendColor, textColor, subtleColor };
  }

  function createMergeColabTooltip(labels, rawValues, total, baseColors, mode, textColor, subtleColor) {
    const dividerColor = mode === 'dark' ? 'rgba(100, 116, 139, 0.3)' : 'rgba(148, 163, 184, 0.35)';
    return (context) => {
      const { chart, tooltip } = context;
      const tooltipEl = ensureTooltipEl(chart, { mode, textColor, minWidth: 240 });
      if (!tooltipEl) return;
      if (!tooltip || tooltip.opacity === 0 || !tooltip.dataPoints || !tooltip.dataPoints.length) {
        tooltipEl.style.opacity = '0';
        return;
      }

      const dataPoint = tooltip.dataPoints[0];
      const idx = dataPoint.dataIndex ?? 0;
      const label = labels[idx] || dataPoint.label || '';
      const value = rawValues[idx] || 0;
      const perc = total > 0 ? (value / total) * 100 : 0;
      const accent = baseColors[idx] || baseColors[0] || '#2563eb';
      const participationColor = adjustColor(accent, mode === 'dark' ? 0.15 : -0.04);

      tooltipEl.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="display:inline-flex; width:14px; height:14px; border-radius:999px; background:${accent}; box-shadow:0 0 0 4px ${hexToRgba(accent, 0.18)};"></span>
            <div style="font-weight:700; font-size:14px;">${label}</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:6px; font-size:13px;">
            <div style="display:flex; justify-content:space-between; gap:16px;">
              <span style="color:${subtleColor};">Colaboradores</span>
              <strong style="font-weight:700;">${value.toLocaleString('pt-BR')}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; gap:16px; color:${participationColor};">
              <span>Participação</span>
              <strong>${perc.toFixed(1)}%</strong>
            </div>
          </div>
          <div style="border-top:1px solid ${dividerColor}; padding-top:6px; font-size:11px; color:${subtleColor};">
            Total analisado: ${total.toLocaleString('pt-BR')} colaboradores treinados
          </div>
        </div>
      `;

      const { offsetLeft, offsetTop } = chart.canvas;
      tooltipEl.style.opacity = '1';
      tooltipEl.style.left = `${offsetLeft + tooltip.caretX}px`;
      tooltipEl.style.top = `${offsetTop + tooltip.caretY}px`;
      tooltipEl.style.transform = 'translate(-50%, calc(-100% - 18px))';
    };
  }

  function renderMergeColabPercent(ctx, palette, mode) {
    const container = ctx?.canvas?.closest('.chart-wrapper');
    if (!MERGE_COLAB_PERCENT || !Array.isArray(MERGE_COLAB_PERCENT.values)) {
      if (container) {
        container.innerHTML = '<div class="text-muted text-center py-5">Nenhum dado disponível para calcular percentual de treinamento.</div>';
      }
      return null;
    }

    const labels = Array.isArray(MERGE_COLAB_PERCENT.labels) && MERGE_COLAB_PERCENT.labels.length
      ? MERGE_COLAB_PERCENT.labels
      : ['Com execução por Voz', 'Sem execução por Voz'];
    const rawValues = MERGE_COLAB_PERCENT.values.map((value) => Number.parseFloat(value) || 0);
    const total = rawValues.reduce((sum, value) => sum + Math.max(0, value), 0);

    if (!total) {
      if (container) {
        container.innerHTML = '<div class="text-muted text-center py-5">Nenhum colaborador treinado encontrado na planilha recente.</div>';
      }
      return null;
    }

    const {
      baseColors,
      colors,
      hoverColors,
      borderColors,
      legendColor,
      textColor,
      subtleColor
    } = buildMergeColabColorConfig(palette, mode);
    const externalTooltipHandler = createMergeColabTooltip(labels, rawValues, total, baseColors, mode, textColor, subtleColor);

    return new Chart(ctx, {
      type: 'pie',
      data: {
        labels,
        datasets: [
          {
            label: '% Colaboradores Treinados',
            data: rawValues,
            backgroundColor: colors,
            borderColor: borderColors,
            borderWidth: 1.5,
            hoverBackgroundColor: hoverColors,
            hoverBorderWidth: 1.5,
            hoverOffset: 8,
            hoverBorderColor: borderColors
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: legendColor,
              padding: 18,
              usePointStyle: true
            }
          },
          tooltip: {
            enabled: false,
            external: externalTooltipHandler
          },
          datalabels: {
            anchor: 'center',
            align: 'center',
            clamp: true,
            color: (context) => getReadableTextColor(baseColors[context.dataIndex] || '#2563eb'),
            backgroundColor: (context) => {
              const base = baseColors[context.dataIndex] || '#2563eb';
              return hexToRgba(adjustColor(base, -0.28), mode === 'dark' ? 0.82 : 0.75);
            },
            borderRadius: 10,
            padding: { top: 6, bottom: 6, left: 8, right: 8 },
            font: {
              weight: '700',
              size: 12
            },
            formatter: (value) => {
              const perc = total > 0 ? (value / total) * 100 : 0;
              return perc >= 4 ? `${perc.toFixed(1)}%` : '';
            }
          }
        }
      }
    });
  }

  function renderMergeColabBar(ctx, palette, mode) {
    const container = ctx?.canvas?.closest('.chart-wrapper');
    if (!MERGE_COLAB_PERCENT || !Array.isArray(MERGE_COLAB_PERCENT.values)) {
      if (container) {
        container.innerHTML = '<div class="text-muted text-center py-5">Nenhum dado disponível para calcular colaboradores treinados.</div>';
      }
      return null;
    }

    const labels = Array.isArray(MERGE_COLAB_PERCENT.labels) && MERGE_COLAB_PERCENT.labels.length
      ? MERGE_COLAB_PERCENT.labels
      : ['Com execução por Voz', 'Sem execução por Voz'];
    const rawValues = MERGE_COLAB_PERCENT.values.map((value) => Number.parseFloat(value) || 0);
    const total = rawValues.reduce((sum, value) => sum + Math.max(0, value), 0);

    if (!total) {
      if (container) {
        container.innerHTML = '<div class="text-muted text-center py-5">Nenhum colaborador treinado encontrado na planilha recente.</div>';
      }
      return null;
    }

    const {
      baseColors,
      colors,
      hoverColors,
      borderColors,
      subtleColor,
      textColor
    } = buildMergeColabColorConfig(palette, mode);
    const externalTooltipHandler = createMergeColabTooltip(labels, rawValues, total, baseColors, mode, textColor, subtleColor);

    const wrapLabel = (label) => {
      if (!label) return '';
      const words = String(label).split(/\s+/);
      const lines = [];
      let current = '';
      const limit = 14;
      words.forEach((word) => {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length > limit) {
          if (current) {
            lines.push(current);
            current = word;
          } else {
            lines.push(candidate);
            current = '';
          }
        } else {
          current = candidate;
        }
      });
      if (current) {
        lines.push(current);
      }
      return lines;
    };

    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Colaboradores Treinados',
            data: rawValues,
            backgroundColor: colors,
            borderColor: borderColors,
            borderWidth: 1.5,
            borderRadius: 10,
            maxBarThickness: 64,
            hoverBackgroundColor: hoverColors,
            hoverBorderColor: borderColors,
            hoverBorderWidth: 1.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { top: 8, right: 12, bottom: 4, left: 12 }
        },
        indexAxis: 'y',
        scales: {
          x: {
            ticks: {
              color: subtleColor,
              font: { weight: 600 }
            },
            grid: {
              color: mode === 'dark' ? 'rgba(148, 163, 184, 0.18)' : 'rgba(15, 23, 42, 0.08)'
            }
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: subtleColor,
              precision: 0,
              callback(value) {
                const label = this.getLabelForValue(value);
                const wrapped = wrapLabel(label);
                return wrapped && wrapped.length ? wrapped : label;
              }
            },
            grid: {
              display: false
            },
            border: { display: false }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: externalTooltipHandler
          },
          datalabels: {
            anchor: 'end',
            align: 'end',
            offset: -38,
            clamp: true,
            backgroundColor: (context) => {
              const base = baseColors[context.dataIndex] || '#2563eb';
              return hexToRgba(adjustColor(base, -0.25), mode === 'dark' ? 0.82 : 0.72);
            },
            color: (context) => getReadableTextColor(baseColors[context.dataIndex] || '#2563eb'),
            borderRadius: 8,
            padding: { top: 6, bottom: 6, left: 8, right: 8 },
            font: { weight: '700', size: 12 },
            formatter: (value) => {
              if (!value || value <= 0) return '';
              const perc = total > 0 ? (value / total) * 100 : 0;
              if (perc < 4) return '';
              const qty = Number.isFinite(value) ? Math.round(value).toLocaleString('pt-BR') : value;
              return `${qty} • ${perc.toFixed(1)}%`;
            }
          }
        }
      }
    });
  }

  function mountMergeCharts(force = false) {
    if (!ensureChartSetup()) return;
    const canvas = document.getElementById('chart-merge-colab-percent');
    const barCanvas = document.getElementById('chart-merge-colab');
    if (!canvas && !barCanvas) return;
    if (window.AppPanel.mergeMounted && !force) return;

    const mode = document.documentElement.dataset.bsTheme === 'dark' ? 'dark' : 'light';
    const paletteBase = [
      getCssVar('--accent-color', '#3498db'),
      getCssVar('--accent-hover', '#2980b9'),
      getCssVar('--success-color', '#27ae60'),
      getCssVar('--warning-color', '#f39c12')
    ];
    const palette = buildPalette(4, paletteBase, mode);

    if (window.AppPanel.charts.mergeColabPercent) {
      try {
        window.AppPanel.charts.mergeColabPercent.destroy();
      } catch (err) {
        console.warn('Falha ao destruir gráfico de percentual de treinamento', err);
      }
      delete window.AppPanel.charts.mergeColabPercent;
    }

    if (canvas) {
      const chart = renderMergeColabPercent(canvas.getContext('2d'), palette, mode);
      if (chart) {
        window.AppPanel.charts.mergeColabPercent = chart;
      }
    }

    if (window.AppPanel.charts.mergeColabBar) {
      try {
        window.AppPanel.charts.mergeColabBar.destroy();
      } catch (err) {
        console.warn('Falha ao destruir gráfico de colaboradores treinados', err);
      }
      delete window.AppPanel.charts.mergeColabBar;
    }

    if (barCanvas) {
      const barChart = renderMergeColabBar(barCanvas.getContext('2d'), palette, mode);
      if (barChart) {
        window.AppPanel.charts.mergeColabBar = barChart;
      }
    }

    window.AppPanel.mergeMounted = true;
  }

  function mountCharts() {
    if (!ensureChartSetup()) return;

    const target = document.getElementById('registros-graficos');
    if (!target) return;

    destroyExistingCharts();
    target.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'row g-3 mt-2';
    container.innerHTML = `
      <div class="col-12 col-xxl-4">
        <div class="card h-100">
          <div class="card-header d-flex align-items-center justify-content-between">
            <div class="d-flex align-items-center">
              <i class="bi bi-bar-chart-line me-2" style="color: var(--accent-color);"></i>
              <h6 class="mb-0">Tipos - Contagem Geral de Matrículas</h6>
            </div>
            <div class="badge bg-primary bg-opacity-10 text-primary px-2 py-1" style="font-size: 0.7rem; font-weight: 600;">Barras</div>
          </div>
          <div class="card-body">
            <div class="chart-wrapper" style="height: 360px;">
              <canvas id="chart-tipo"></canvas>
            </div>
          </div>
        </div>
      </div>
      <div class="col-12 col-xxl-4">
        <div class="card h-100">
          <div class="card-header d-flex align-items-center justify-content-between">
            <div class="d-flex align-items-center">
              <i class="bi bi-pie-chart-fill me-2" style="color: var(--accent-color);"></i>
              <h6 class="mb-0">Turnos - Distribuição Total por Donut</h6>
            </div>
            <div class="badge bg-success bg-opacity-10 text-success px-2 py-1" style="font-size: 0.7rem; font-weight: 600;">Donut</div>
          </div>
          <div class="card-body">
            <div class="chart-wrapper" style="height: 360px;">
              <canvas id="chart-turno"></canvas>
            </div>
          </div>
        </div>
      </div>
      <div class="col-12 col-xxl-4">
        <div class="card h-100">
          <div class="card-header d-flex align-items-center justify-content-between">
            <div class="d-flex align-items-center">
              <i class="bi bi-bar-chart-steps me-2" style="color: var(--accent-color);"></i>
              <h6 class="mb-0">Análise de Volume - Total por Setor</h6>
            </div>
            <div class="badge bg-warning bg-opacity-10 text-warning px-2 py-1" style="font-size: 0.7rem; font-weight: 600;">Barras</div>
          </div>
          <div class="card-body">
            <div class="chart-wrapper" style="height: 380px;">
              <canvas id="chart-setor"></canvas>
            </div>
          </div>
        </div>
      </div>`;

    target.appendChild(container);

    const timelineRow = document.createElement('div');
    timelineRow.className = 'row g-3 mt-2';
    timelineRow.innerHTML = `
      <div class="col-12">
        <div class="card h-100">
          <div class="card-header d-flex align-items-center justify-content-between">
            <div class="d-flex align-items-center">
              <i class="bi bi-graph-up me-2" style="color: var(--success-color);"></i>
              <h6 class="mb-0">Timeline Analytics - Evolução Temporal</h6>
            </div>
            <div class="d-flex gap-2">
              <select id="flt-setor" class="form-select form-select-sm">
                <option value="all">Setor: Todos</option>
              </select>
              <select id="flt-tipo" class="form-select form-select-sm">
                <option value="all">Tipo: Todos</option>
              </select>
              <select id="flt-supervisor" class="form-select form-select-sm">
                <option value="all">Supervisor: Todos</option>
              </select>
              <button id="apply-timeline" class="btn btn-sm btn-primary"><i class="bi bi-funnel me-1"></i>Aplicar</button>
            </div>
          </div>
          <div class="card-body">
            <div class="chart-wrapper" style="height: 420px;">
              <canvas id="chart-timeline"></canvas>
            </div>
          </div>
        </div>
      </div>`;

    target.appendChild(timelineRow);

    const mode = document.documentElement.dataset.bsTheme === 'dark' ? 'dark' : 'light';
    const paletteBase = [
      getCssVar('--accent-color', '#3498db'),
      getCssVar('--accent-hover', '#2980b9'),
      getCssVar('--success-color', '#27ae60'),
      getCssVar('--warning-color', '#f39c12'),
      getCssVar('--danger-color', '#e74c3c'),
      getCssVar('--primary-color', '#2c3e50')
    ];
    const palette = buildPalette(
      Math.max(
        TIPO_SERIES.length,
        TURNO_SERIES.length,
        STACKED_SERIES.length,
        6
      ),
      paletteBase,
      mode
    );

    const tipoCtx = document.getElementById('chart-tipo').getContext('2d');
    const turnoCtx = document.getElementById('chart-turno').getContext('2d');
    const setorCtx = document.getElementById('chart-setor').getContext('2d');
    const timelineCtx = document.getElementById('chart-timeline').getContext('2d');

    window.AppPanel.charts.tipo = renderTipoChart(tipoCtx, palette, mode);
    window.AppPanel.charts.turno = renderTurnoChart(turnoCtx, palette, mode);
    window.AppPanel.charts.setor = renderSetorChart(setorCtx, palette, mode);
    const timelineChart = renderTimelineChart(timelineCtx, palette, mode);
    if (timelineChart) {
      window.AppPanel.charts.timeline = timelineChart;
    }

    populateTimelineFilters();
    bindTimelineButton();

    window.AppPanel.mounted = true;
  }

  function populateTimelineFilters() {
    const selSetor = document.getElementById('flt-setor');
    const selTipo = document.getElementById('flt-tipo');
    const selSup = document.getElementById('flt-supervisor');

    const fillSelect = (select, items, selected, prefix) => {
      if (!select) return;
      select.querySelectorAll('option:not([value="all"])').forEach((opt) => opt.remove());
      items.forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = `${prefix}: ${value}`;
        if (selected !== 'all' && value === selected) {
          option.selected = true;
        }
        select.appendChild(option);
      });
      if (selected === 'all') {
        select.value = 'all';
      }
    };

    fillSelect(selSetor, AVAILABLE_SETORES, SELECTED_SETOR, 'Setor');
    fillSelect(selTipo, AVAILABLE_TIPOS, SELECTED_TIPO, 'Tipo');
    fillSelect(selSup, AVAILABLE_SUPERVISORES, SELECTED_SUPERVISOR, 'Supervisor');
  }

  function bindTimelineButton() {
    const button = document.getElementById('apply-timeline');
    if (!button) return;
    button.addEventListener('click', () => {
      const params = new URLSearchParams(window.location.search);
      const minData = document.getElementById('min_data')?.value;
      const maxData = document.getElementById('max_data')?.value;
      const turno = document.getElementById('turno')?.value;
      if (minData) params.set('min_data', minData);
      if (maxData) params.set('max_data', maxData);
      if (turno) params.set('turno', turno);
      params.set('setor', document.getElementById('flt-setor')?.value || 'all');
      params.set('tipo', document.getElementById('flt-tipo')?.value || 'all');
      params.set('supervisor', document.getElementById('flt-supervisor')?.value || 'all');
      window.location.search = params.toString();
    });
  }

  function setupInputFilters() {
    const filterButtons = Array.from(document.querySelectorAll('[data-input-filter]'));
    const panels = Array.from(document.querySelectorAll('[data-input-panel]'));
    if (!filterButtons.length || !panels.length) return;

    const activate = (filter) => {
      panels.forEach((panel) => {
        const key = panel.getAttribute('data-input-panel');
        panel.classList.toggle('d-none', key !== filter);
      });
    };

    filterButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        filterButtons.forEach((other) => other.classList.remove('active'));
        btn.classList.add('active');
        activate(btn.getAttribute('data-input-filter'));
      });
    });

    const initial = filterButtons.find((btn) => btn.classList.contains('active')) || filterButtons[0];
    if (initial) {
      initial.classList.add('active');
      activate(initial.getAttribute('data-input-filter'));
    }
  }

  function setupTabs() {
    if (window.AppPanel.tabsBound) return;
    const buttons = Array.from(document.querySelectorAll('.card-header .btn-group [data-target]'));
    if (!buttons.length) return;
    const label = document.getElementById('dataset-label');
    const names = {
      '#tab-registros': 'Registros',
      '#tab-input': 'Input*Dados',
      '#tab-merge': 'Registros x Input*Dados'
    };
    const validTargets = Object.keys(names);

    const activateTab = (targetSelector, updateHistory = true) => {
      let selector = targetSelector;
      if (!validTargets.includes(selector)) {
        selector = '#tab-registros';
      }

      buttons.forEach((btn) => {
        const btnTarget = btn.getAttribute('data-target');
        const isActive = btnTarget === selector;
        btn.classList.toggle('active', isActive);
        const section = document.querySelector(btnTarget);
        if (section) {
          section.classList.toggle('d-none', !isActive);
        }
      });

      if (label) {
        label.textContent = names[selector] || '';
      }

      if (updateHistory) {
        const params = new URLSearchParams(window.location.search);
        if (selector === '#tab-registros') {
          params.delete('tab');
        } else if (selector === '#tab-input') {
          params.set('tab', 'input');
        } else if (selector === '#tab-merge') {
          params.set('tab', 'merge');
        }
        const queryString = params.toString();
        const hash = selector === '#tab-registros' ? '' : selector;
        const newUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ''}${hash}`;
        window.history.replaceState({}, '', newUrl);
      }

      if (selector === '#tab-merge') {
        mountMergeCharts();
      }
    };

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetSelector = btn.getAttribute('data-target');
        activateTab(targetSelector, true);
      });
    });

    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    let initialSelector = '#tab-registros';
    if (tabParam === 'input') {
      initialSelector = '#tab-input';
    } else if (tabParam === 'merge') {
      initialSelector = '#tab-merge';
    } else if (validTargets.includes(window.location.hash)) {
      initialSelector = window.location.hash;
    }

    activateTab(initialSelector, false);

    window.AppPanel.tabsBound = true;
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    mountCharts();
    setupInputFilters();
    if (window.location.hash === '#tab-merge' || new URLSearchParams(window.location.search).get('tab') === 'merge') {
      mountMergeCharts();
    }
  });
})();
