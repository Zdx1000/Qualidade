// Painel Gráfico - JS extraído do template para melhor manutenção e cache
(function(){
  // Estado simples global para evitar duplicações entre navegações/reativações
  window.AppPanel = window.AppPanel || { charts: {}, mounted: false, tabsBound: false };
  // Helper para ler JSON de tags <script type="application/json" id="...">
  function readJson(id, fallback){
    const el = document.getElementById(id);
    if(!el) return fallback;
    try { return JSON.parse(el.textContent || ''); } catch { return fallback; }
  }

  // Dados vindos do servidor
  const SETOR_LABELS = readJson('data-setor-labels', []);
  const SETOR_SERIES = readJson('data-setor-series', []);
  const TURNO_LABELS = readJson('data-turno-labels', []);
  const TURNO_SERIES = readJson('data-turno-series', []);
  const STACKED_CATEGORIES = readJson('data-stacked-categories', []);
  const STACKED_SERIES = readJson('data-stacked-series', []);
  const TIMELINE = readJson('data-timeline', []);
  const AVAILABLE_SETORES = readJson('data-available-setores', []);
  const AVAILABLE_TIPOS = readJson('data-available-tipos', []);
  const AVAILABLE_SUPERVISORES = readJson('data-available-supervisores', []);
  const SELECTED_SETOR = readJson('data-selected-setor', 'all');
  const SELECTED_TIPO = readJson('data-selected-tipo', 'all');
  const SELECTED_SUPERVISOR = readJson('data-selected-supervisor', 'all');

  function mountCharts() {
    const ap = window.AppPanel;
    const target = document.getElementById('registros-graficos');
    if (!target) return;

    // Se já renderizado antes, destruir gráficos e limpar HTML (idempotência)
    if (ap.charts && Object.keys(ap.charts).length) {
      Object.values(ap.charts).forEach(ch => { try { ch.destroy(); } catch(_) {} });
      ap.charts = {};
    }
    target.innerHTML = '';
    // Container para gráficos (modo Registros)
    const container = document.createElement('div');
    container.className = 'row g-3 mt-2';
    container.innerHTML = `
      <div class="col-12 col-xxl-4">
        <div class="card h-100">
          <div class="card-header d-flex align-items-center justify-content-between">
            <div class="d-flex align-items-center">
              <i class="bi bi-speedometer2 me-2" style="color: var(--accent-color);"></i>
              <h6 class="mb-0">Top 6 Setores - Distribuição de Matrículas</h6>
            </div>
            <div class="badge bg-primary bg-opacity-10 text-primary px-2 py-1" style="font-size: 0.7rem; font-weight: 600;">
              Ranking
            </div>
          </div>
          <div class="card-body">
            <div id="chart-setor" style="min-height: 360px;"></div>
          </div>
        </div>
      </div>
      <div class="col-12 col-xxl-4">
        <div class="card h-100">
          <div class="card-header d-flex align-items-center justify-content-between">
            <div class="d-flex align-items-center">
              <i class="bi bi-radar me-2" style="color: var(--accent-color);"></i>
              <h6 class="mb-0">Turnos - Análise Polar Monocromática</h6>
            </div>
            <div class="badge bg-success bg-opacity-10 text-success px-2 py-1" style="font-size: 0.7rem; font-weight: 600;">
              Polar
            </div>
          </div>
          <div class="card-body">
            <div id="chart-turno" style="min-height: 360px;"></div>
          </div>
        </div>
      </div>
      <div class="col-12 col-xxl-4">
        <div class="card h-100">
          <div class="card-header d-flex align-items-center justify-content-between">
            <div class="d-flex align-items-center">
              <i class="bi bi-bar-chart-steps me-2" style="color: var(--accent-color);"></i>
              <h6 class="mb-0">Análise Empilhada - Tipos por Setor</h6>
            </div>
            <div class="badge bg-warning bg-opacity-10 text-warning px-2 py-1" style="font-size: 0.7rem; font-weight: 600;">
              Stacked
            </div>
          </div>
          <div class="card-body">
            <div id="chart-stacked" style="min-height: 380px;"></div>
          </div>
        </div>
      </div>`;

  target.appendChild(container);

    // Paleta baseada em variáveis CSS
    const css = getComputedStyle(document.documentElement);
    const COL_PRIMARY = css.getPropertyValue('--primary-color').trim() || '#2c3e50';
    const COL_ACCENT = css.getPropertyValue('--accent-color').trim() || '#3498db';
    const COL_ACCENT_H = css.getPropertyValue('--accent-hover').trim() || '#2980b9';
    const COL_SUCCESS = css.getPropertyValue('--success-color').trim() || '#27ae60';
    const COL_WARNING = css.getPropertyValue('--warning-color').trim() || '#f39c12';
    const COL_DANGER = css.getPropertyValue('--danger-color').trim() || '#e74c3c';
    const COL_LIGHTBG = css.getPropertyValue('--light-bg').trim() || '#e6e7ee';
    const palette = [COL_ACCENT, COL_ACCENT_H, COL_SUCCESS, COL_WARNING, COL_DANGER, COL_PRIMARY];

    const baseGrid = { borderColor: 'rgba(0,0,0,0.08)', strokeDashArray: 4 };
    const baseStates = { active: { filter: { type: 'none' } }, hover: { filter: { type: 'none' } } };
    const mode = (document.documentElement.dataset.bsTheme || 'light');

    // Gráfico radialBar por setor: top 6 (visual refinado)
    const topN = 6;
    const setores = SETOR_LABELS.map((l, i) => ({ label: l, value: SETOR_SERIES[i] || 0 }))
      .sort((a,b) => b.value - a.value)
      .slice(0, topN);
    const radialTotal = setores.reduce((acc, s) => acc + s.value, 0);
    const radialHollowColor = mode === 'dark' ? '#0f172a' : '#ffffff';
    const radialTrackColor = mode === 'dark' ? 'rgba(148, 163, 184, 0.12)' : 'rgba(226, 232, 240, 0.8)';
    const radialNameColor = mode === 'dark' ? '#cbd5f5' : '#1f2937';
    const radialValueColor = mode === 'dark' ? '#e2e8f0' : '#0f172a';
    const radialTotalColor = mode === 'dark' ? '#94a3b8' : '#64748b';
    const radialOptions = {
      chart: { 
        type: 'radialBar', 
        height: 360, 
        foreColor: radialValueColor,
        toolbar: { show: false },
        animations: { enabled: true, easing: 'easeinout', speed: 800, animateGradually: { enabled: true, delay: 150 } },
        dropShadow: { enabled: true, top: 3, left: 0, blur: 8, opacity: 0.15, color: COL_ACCENT }
      },
      theme: { mode },
      colors: palette,
      series: setores.map(s => radialTotal > 0 ? Math.round((s.value / radialTotal) * 100) : 0),
      labels: setores.map(s => s.label),
      plotOptions: {
        radialBar: {
          startAngle: -135,
          endAngle: 225,
          hollow: { 
            margin: 12,
            size: '58%', 
            background: radialHollowColor,
            image: undefined,
            imageWidth: 64,
            imageHeight: 64,
            imageClipped: false
          },
          track: { 
            background: radialTrackColor, 
            strokeWidth: '95%',
            margin: 6,
            dropShadow: { 
              enabled: true, 
              top: 2, 
              left: 0, 
              blur: 4, 
              opacity: 0.35,
              color: mode === 'dark' ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.1)'
            }
          },
          dataLabels: {
            show: true,
            name: { 
              fontSize: '13px', 
              fontWeight: 600,
              color: radialNameColor,
              offsetY: -8,
              formatter: (val) => val.length > 12 ? val.substring(0, 12) + '...' : val
            },
            value: { 
              fontSize: '16px', 
              fontWeight: 700,
              color: radialValueColor,
              offsetY: 8,
              formatter: (val, opts) => {
                const realValue = setores[opts.seriesIndex]?.value || 0;
                return `${realValue}`;
              }
            },
            total: {
              show: true,
              showAlways: true,
              label: 'Total Geral',
              fontSize: '12px',
              fontWeight: 600,
              color: radialTotalColor,
              formatter: function () { 
                return `${radialTotal} matrículas`;
              }
            }
          }
        }
      },
      fill: {
        type: 'gradient',
        gradient: {
          shade: mode,
          type: 'diagonal1',
          shadeIntensity: 0.4,
          gradientToColors: palette.map((color, i) => {
            // Criar variações mais claras para o gradiente
            const rgb = color.match(/\w\w/g);
            if (rgb) {
              const [r, g, b] = rgb.map(x => parseInt(x, 16));
              return `rgba(${r}, ${g}, ${b}, 0.85)`;
            }
            return color;
          }),
          inverseColors: false,
          opacityFrom: 0.92,
          opacityTo: 0.78,
          stops: [0, 50, 100]
        }
      },
      stroke: {
        lineCap: 'round',
        dashArray: 0
      },
      tooltip: {
        enabled: true,
        theme: mode,
        fillSeriesColor: false,
        custom: function({ series, seriesIndex, dataPointIndex, w }) {
          const setor = setores[seriesIndex];
          if (!setor) return '';
          const percentage = series[seriesIndex];
          const realValue = setor.value;
          const setorName = setor.label;
          const rank = seriesIndex + 1;
          
          // Calcular posição relativa
          const position = radialTotal > 0 ? ((realValue / radialTotal) * 100).toFixed(1) : '0.0';
          
          return `
            <div style="
              background: ${mode === 'dark' ? 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)'};
              color: ${mode === 'dark' ? '#e2e8f0' : '#1f2937'};
              padding: 12px 16px;
              border-radius: 12px;
              box-shadow: 0 8px 32px rgba(0, 0, 0, ${mode === 'dark' ? '0.4' : '0.15'});
              border: 1px solid ${mode === 'dark' ? 'rgba(148, 163, 184, 0.2)' : 'rgba(226, 232, 240, 0.8)'};
              font-family: 'Segoe UI', system-ui, sans-serif;
              font-size: 13px;
              min-width: 200px;
            ">
              <div style="
                display: flex;
                align-items: center;
                margin-bottom: 8px;
                font-weight: 700;
                font-size: 14px;
                color: ${palette[seriesIndex] || COL_ACCENT};
              ">
                <div style="
                  width: 12px;
                  height: 12px;
                  border-radius: 50%;
                  background: ${palette[seriesIndex] || COL_ACCENT};
                  margin-right: 8px;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                "></div>
                ${setorName}
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="color: ${mode === 'dark' ? '#94a3b8' : '#64748b'};">Matrículas:</span>
                <strong>${realValue}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="color: ${mode === 'dark' ? '#94a3b8' : '#64748b'};">Participação:</span>
                <strong>${position}%</strong>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span style="color: ${mode === 'dark' ? '#94a3b8' : '#64748b'};">Ranking:</span>
                <strong>${rank}º lugar</strong>
              </div>
              <div style="
                padding-top: 8px;
                border-top: 1px solid ${mode === 'dark' ? 'rgba(148, 163, 184, 0.2)' : 'rgba(226, 232, 240, 0.8)'};
                font-size: 11px;
                color: ${mode === 'dark' ? '#94a3b8' : '#64748b'};
                text-align: center;
              ">
                Total geral: ${radialTotal} matrículas
              </div>
            </div>
          `;
        }
      },
      legend: {
        show: true,
        position: 'right',
        horizontalAlign: 'center',
        fontSize: '12px',
        fontWeight: 500,
        markers: { 
          width: 10, 
          height: 10, 
          radius: 5,
          strokeWidth: 2,
          strokeColor: mode === 'dark' ? '#0f172a' : '#ffffff'
        },
        itemMargin: { horizontal: 8, vertical: 6 },
        labels: { 
          colors: mode === 'dark' ? '#cbd5f5' : '#1f2937',
          useSeriesColors: false
        },
        formatter: function(seriesName, opts) {
          const value = setores[opts.seriesIndex]?.value || 0;
          return `${seriesName}: ${value}`;
        }
      },
      grid: { 
        padding: { top: 8, bottom: 8, left: 8, right: 8 } 
      },
      states: {
        hover: {
          filter: {
            type: 'lighten',
            value: 0.08
          }
        },
        active: {
          allowMultipleDataPointsSelection: false,
          filter: {
            type: 'darken',
            value: 0.05
          }
        }
      },
      noData: { 
        text: 'Nenhum setor encontrado', 
        style: { 
          color: mode === 'dark' ? '#94a3b8' : '#64748b',
          fontSize: '14px',
          fontWeight: 500
        } 
      },
      responsive: [
        {
          breakpoint: 1400,
          options: {
            chart: { height: 330 },
            plotOptions: {
              radialBar: {
                hollow: { size: '60%' },
                dataLabels: {
                  name: { fontSize: '12px' },
                  value: { fontSize: '15px' }
                }
              }
            },
            legend: { 
              position: 'bottom',
              horizontalAlign: 'center',
              itemMargin: { horizontal: 6, vertical: 4 }
            }
          }
        },
        {
          breakpoint: 768,
          options: {
            chart: { height: 300 },
            plotOptions: {
              radialBar: {
                hollow: { size: '65%' },
                dataLabels: {
                  name: { fontSize: '11px' },
                  value: { fontSize: '14px' },
                  total: { fontSize: '11px' }
                }
              }
            },
            legend: { 
              position: 'bottom',
              fontSize: '11px',
              itemMargin: { horizontal: 4, vertical: 3 }
            }
          }
        }
      ]
    };
  const chartSetor = new ApexCharts(document.querySelector('#chart-setor'), radialOptions);
  chartSetor.render();
  window.AppPanel.charts.setor = chartSetor;

    // Polar Area Monocromático por turno
    const polarTotal = TURNO_SERIES.reduce((acc, val) => acc + (val || 0), 0);
    const polarBaseColor = mode === 'dark' ? COL_ACCENT : COL_ACCENT;
    const polarLabelColor = mode === 'dark' ? '#cbd5f5' : '#1f2937';
    const polarValueColor = mode === 'dark' ? '#e2e8f0' : '#0f172a';
    const polarSubtleColor = mode === 'dark' ? '#94a3b8' : '#64748b';
    
    // Gerar paleta monocromática baseada na cor principal
    const generateMonochromeColors = (baseColor, count) => {
      const colors = [];
      for (let i = 0; i < count; i++) {
        const opacity = 0.3 + (0.7 * i / (count - 1)); // De 30% a 100% de opacidade
        const rgb = baseColor.match(/\w\w/g);
        if (rgb) {
          const [r, g, b] = rgb.map(x => parseInt(x, 16));
          colors.push(`rgba(${r}, ${g}, ${b}, ${opacity})`);
        } else {
          colors.push(`${baseColor}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`);
        }
      }
      return colors.reverse(); // Maiores valores com cores mais intensas
    };
    
    const polarColors = generateMonochromeColors(polarBaseColor, TURNO_SERIES.length);
    const polarOptions = {
      chart: {
        type: 'polarArea',
        height: 360,
        foreColor: polarValueColor,
        toolbar: { show: false },
        animations: { 
          enabled: true, 
          easing: 'easeinout', 
          speed: 750,
          animateGradually: { enabled: true, delay: 120 }
        },
        dropShadow: { 
          enabled: true, 
          top: 4, 
          left: 0, 
          blur: 12, 
          opacity: 0.15, 
          color: polarBaseColor 
        }
      },
      theme: { mode },
      colors: polarColors,
      labels: TURNO_LABELS,
      series: TURNO_SERIES,
      dataLabels: {
        enabled: true,
        formatter: (val, opts) => {
          if (!val || polarTotal === 0) return '';
          const perc = (val / polarTotal) * 100;
          return perc >= 8 ? `${perc.toFixed(1)}%` : '';
        },
        style: { 
          fontSize: '11px', 
          fontWeight: 700,
          colors: ['#ffffff'],
          textShadow: '0 1px 2px rgba(0,0,0,0.5)'
        },
        background: {
          enabled: true,
          foreColor: mode === 'dark' ? '#0f172a' : '#ffffff',
          borderRadius: 6,
          padding: 2,
          opacity: 0.8
        },
        dropShadow: {
          enabled: true,
          top: 1,
          left: 1,
          blur: 2,
          opacity: 0.3
        }
      },
      stroke: { 
        show: true,
        width: 2, 
        colors: [mode === 'dark' ? '#0f172a' : '#ffffff']
      },
      fill: {
        type: 'gradient',
        gradient: {
          shade: mode,
          type: 'radial',
          shadeIntensity: 0.6,
          gradientToColors: polarColors.map(color => {
            // Criar versão mais intensa para o gradiente
            const match = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
            if (match) {
              const [, r, g, b, a] = match;
              return `rgba(${r}, ${g}, ${b}, ${Math.min(parseFloat(a) + 0.2, 1)})`;
            }
            return color;
          }),
          inverseColors: false,
          opacityFrom: 0.85,
          opacityTo: 0.95,
          stops: [0, 100]
        }
      },
      plotOptions: {
        polarArea: {
          rings: {
            strokeWidth: 1,
            strokeColor: mode === 'dark' ? 'rgba(148, 163, 184, 0.15)' : 'rgba(15, 23, 42, 0.1)'
          },
          spokes: {
            strokeWidth: 1,
            connectorColors: mode === 'dark' ? 'rgba(148, 163, 184, 0.15)' : 'rgba(15, 23, 42, 0.1)'
          }
        }
      },
      legend: {
        show: true,
        position: 'right',
        horizontalAlign: 'center',
        fontSize: '12px',
        fontWeight: 500,
        markers: { 
          width: 12, 
          height: 12, 
          radius: 6,
          strokeWidth: 2,
          strokeColor: mode === 'dark' ? '#0f172a' : '#ffffff'
        },
        itemMargin: { horizontal: 10, vertical: 8 },
        labels: { 
          colors: polarLabelColor,
          useSeriesColors: false
        },
        formatter: function(seriesName, opts) {
          const value = TURNO_SERIES[opts.seriesIndex] || 0;
          const perc = polarTotal > 0 ? ((value / polarTotal) * 100).toFixed(1) : '0.0';
          return `${seriesName}: ${value} (${perc}%)`;
        }
      },
      tooltip: {
        enabled: true,
        theme: mode,
        fillSeriesColor: false,
        custom: function({ series, seriesIndex, dataPointIndex, w }) {
          const value = series[seriesIndex];
          const label = TURNO_LABELS[seriesIndex];
          const percentage = polarTotal > 0 ? ((value / polarTotal) * 100).toFixed(1) : '0.0';
          const rank = [...TURNO_SERIES]
            .map((val, idx) => ({ val, idx }))
            .sort((a, b) => b.val - a.val)
            .findIndex(item => item.idx === seriesIndex) + 1;
          
          return `
            <div style="
              background: ${mode === 'dark' ? 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)'};
              color: ${mode === 'dark' ? '#e2e8f0' : '#1f2937'};
              padding: 14px 18px;
              border-radius: 12px;
              box-shadow: 0 10px 40px rgba(0, 0, 0, ${mode === 'dark' ? '0.4' : '0.15'});
              border: 1px solid ${mode === 'dark' ? 'rgba(148, 163, 184, 0.2)' : 'rgba(226, 232, 240, 0.8)'};
              font-family: 'Segoe UI', system-ui, sans-serif;
              font-size: 13px;
              min-width: 220px;
            ">
              <div style="
                display: flex;
                align-items: center;
                margin-bottom: 10px;
                font-weight: 700;
                font-size: 15px;
                color: ${polarColors[seriesIndex] || polarBaseColor};
              ">
                <div style="
                  width: 14px;
                  height: 14px;
                  border-radius: 50%;
                  background: ${polarColors[seriesIndex] || polarBaseColor};
                  margin-right: 10px;
                  box-shadow: 0 3px 6px rgba(0,0,0,0.25);
                "></div>
                ${label}
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span style="color: ${mode === 'dark' ? '#94a3b8' : '#64748b'};">Matrículas:</span>
                <strong style="font-size: 14px;">${value}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span style="color: ${mode === 'dark' ? '#94a3b8' : '#64748b'};">Participação:</span>
                <strong style="font-size: 14px;">${percentage}%</strong>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                <span style="color: ${mode === 'dark' ? '#94a3b8' : '#64748b'};">Ranking:</span>
                <strong style="font-size: 14px;">${rank}º colocado</strong>
              </div>
              <div style="
                padding-top: 10px;
                border-top: 1px solid ${mode === 'dark' ? 'rgba(148, 163, 184, 0.2)' : 'rgba(226, 232, 240, 0.8)'};
                font-size: 11px;
                color: ${mode === 'dark' ? '#94a3b8' : '#64748b'};
                text-align: center;
                font-style: italic;
              ">
                Total de turnos: ${polarTotal} matrículas
              </div>
            </div>
          `;
        }
      },
      grid: { 
        padding: { top: 10, bottom: 10, left: 10, right: 10 } 
      },
      states: {
        hover: {
          filter: {
            type: 'lighten',
            value: 0.12
          }
        },
        active: {
          allowMultipleDataPointsSelection: false,
          filter: {
            type: 'darken',
            value: 0.08
          }
        }
      },
      noData: { 
        text: 'Nenhum turno encontrado', 
        style: { 
          color: mode === 'dark' ? '#94a3b8' : '#64748b',
          fontSize: '14px',
          fontWeight: 500
        } 
      },
      responsive: [
        {
          breakpoint: 1400,
          options: {
            chart: { height: 330 },
            legend: { 
              position: 'bottom',
              horizontalAlign: 'center',
              itemMargin: { horizontal: 8, vertical: 5 }
            },
            dataLabels: { style: { fontSize: '10px' } }
          }
        },
        {
          breakpoint: 768,
          options: {
            chart: { height: 300 },
            stroke: { width: 1 },
            dataLabels: { enabled: false },
            legend: { 
              position: 'bottom',
              fontSize: '11px',
              itemMargin: { horizontal: 6, vertical: 3 }
            }
          }
        }
      ]
    };
  const chartTurno = new ApexCharts(document.querySelector('#chart-turno'), polarOptions);
  chartTurno.render();
  window.AppPanel.charts.turno = chartTurno;

    // Stacked Bar Premium por Tipo e Setor (design avançado)
    const stackedLabelColor = mode === 'dark' ? '#cbd5f5' : '#1f2937';
    const stackedValueColor = mode === 'dark' ? '#e2e8f0' : '#334155';
    const stackedGridColor = mode === 'dark' ? 'rgba(148, 163, 184, 0.18)' : 'rgba(15, 23, 42, 0.1)';
    const stackedBackgroundColor = mode === 'dark' ? 'rgba(15, 23, 42, 0.05)' : 'rgba(248, 250, 252, 0.8)';
    const stackedCategoryColors = STACKED_CATEGORIES.map(() => stackedLabelColor);
    
    // Calcular totais para cada categoria para melhor tooltip
    const stackedTotals = STACKED_CATEGORIES.map((_, catIndex) => {
      return STACKED_SERIES.reduce((sum, series) => sum + (series.data[catIndex] || 0), 0);
    });
    
    const stackedOptions = {
      series: STACKED_SERIES,
      chart: {
        type: 'bar',
        height: 380,
        stacked: true,
        foreColor: stackedValueColor,
        toolbar: { show: false },
        animations: { 
          enabled: true, 
          easing: 'easeinout', 
          speed: 800, 
          animateGradually: { enabled: true, delay: 120 }
        },
        background: stackedBackgroundColor,
        dropShadow: {
          enabled: true,
          top: 4,
          left: 0,
          blur: 8,
          opacity: 0.12,
          color: COL_ACCENT
        }
      },
      colors: palette,
      theme: { mode },
      plotOptions: {
        bar: {
          horizontal: true,
          barHeight: '72%',
          borderRadius: 12,
          borderRadiusApplication: 'end',
          borderRadiusWhenStacked: 'last',
          rangeBarOverlap: false,
          rangeBarGroupRows: false,
          dataLabels: {
            total: {
              enabled: true,
              offsetX: 16,
              style: { 
                fontSize: '13px', 
                fontWeight: 800, 
                colors: [stackedValueColor],
                textShadow: '0 1px 2px rgba(0,0,0,0.1)'
              },
              formatter: function(val, opts) {
                const categoryIndex = opts.dataPointIndex;
                const total = stackedTotals[categoryIndex];
                return total > 0 ? `${total}` : '';
              }
            }
          }
        }
      },
      dataLabels: {
        enabled: true,
        style: { 
          fontSize: '11px', 
          fontWeight: 700, 
          colors: ['#ffffff'],
          textShadow: '0 1px 3px rgba(0,0,0,0.7)'
        },
        dropShadow: { 
          enabled: true,
          top: 1,
          left: 1,
          blur: 2,
          opacity: 0.4
        },
        offsetX: -2,
        formatter: (val, opts) => {
          if (!val || val < 2) return '';
          const total = stackedTotals[opts.dataPointIndex];
          const percentage = total > 0 ? ((val / total) * 100) : 0;
          return percentage >= 10 ? `${val}` : '';
        }
      },
      stroke: { 
        width: 1, 
        colors: [mode === 'dark' ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.8)'],
        lineCap: 'round'
      },
      xaxis: {
        labels: {
          style: { colors: [stackedLabelColor], fontWeight: 600, fontSize: '12px' },
          formatter: (v) => Math.round(v)
        },
        axisTicks: { show: false },
        axisBorder: { show: false },
        crosshairs: { 
          show: true,
          stroke: { color: COL_ACCENT, width: 1, dashArray: 3 }
        }
      },
      yaxis: {
        categories: STACKED_CATEGORIES,
        labels: {
          maxWidth: 240,
          style: { colors: stackedCategoryColors, fontWeight: 700, fontSize: '12px' },
          formatter: (val) => val.length > 25 ? val.substring(0, 22) + '...' : val
        }
      },
      legend: {
        show: true,
        position: 'bottom',
        horizontalAlign: 'center',
        fontSize: '12px',
        fontWeight: 600,
        markers: { 
          width: 14, 
          height: 14, 
          radius: 8,
          strokeWidth: 2,
          strokeColor: mode === 'dark' ? '#0f172a' : '#ffffff'
        },
        itemMargin: { vertical: 6, horizontal: 14 },
        labels: {
          colors: stackedLabelColor,
          useSeriesColors: false
        },
        formatter: function(seriesName, opts) {
          const seriesTotal = STACKED_SERIES[opts.seriesIndex]?.data?.reduce((a, b) => a + b, 0) || 0;
          return `${seriesName}: ${seriesTotal}`;
        }
      },
      fill: {
        type: 'gradient',
        gradient: { 
          shade: mode, 
          type: 'horizontal', 
          shadeIntensity: 0.4, 
          gradientToColors: palette.map(color => {
            // Criar versão mais clara para o final do gradiente
            const rgb = color.match(/\w\w/g);
            if (rgb) {
              const [r, g, b] = rgb.map(x => parseInt(x, 16));
              return `rgba(${Math.min(r + 20, 255)}, ${Math.min(g + 20, 255)}, ${Math.min(b + 20, 255)}, 0.85)`;
            }
            return color;
          }),
          inverseColors: false,
          opacityFrom: 0.92, 
          opacityTo: 0.78, 
          stops: [0, 100] 
        }
      },
      tooltip: {
        shared: true,
        intersect: false,
        theme: mode,
        fillSeriesColor: false,
        custom: function({ series, seriesIndex, dataPointIndex, w }) {
          const categoryName = STACKED_CATEGORIES[dataPointIndex];
          const seriesName = w.globals.seriesNames[seriesIndex];
          const value = series[seriesIndex][dataPointIndex];
          const total = stackedTotals[dataPointIndex];
          const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
          const seriesColor = palette[seriesIndex] || COL_ACCENT;
          
          // Calcular ranking desta série nesta categoria
          const categoryValues = series.map(s => s[dataPointIndex]).filter(v => v > 0);
          const rank = categoryValues.sort((a, b) => b - a).indexOf(value) + 1;
          
          return `
            <div style="
              background: ${mode === 'dark' ? 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)'};
              color: ${mode === 'dark' ? '#e2e8f0' : '#1f2937'};
              padding: 14px 18px;
              border-radius: 12px;
              box-shadow: 0 12px 40px rgba(0, 0, 0, ${mode === 'dark' ? '0.4' : '0.15'});
              border: 1px solid ${mode === 'dark' ? 'rgba(148, 163, 184, 0.2)' : 'rgba(226, 232, 240, 0.8)'};
              font-family: 'Segoe UI', system-ui, sans-serif;
              font-size: 13px;
              min-width: 240px;
            ">
              <div style="
                font-weight: 700;
                font-size: 14px;
                color: ${seriesColor};
                margin-bottom: 8px;
                display: flex;
                align-items: center;
              ">
                <div style="
                  width: 12px;
                  height: 12px;
                  border-radius: 3px;
                  background: ${seriesColor};
                  margin-right: 8px;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                "></div>
                ${seriesName}
              </div>
              <div style="
                font-size: 12px;
                color: ${mode === 'dark' ? '#94a3b8' : '#64748b'};
                margin-bottom: 8px;
                font-weight: 500;
              ">
                Categoria: ${categoryName}
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span style="color: ${mode === 'dark' ? '#94a3b8' : '#64748b'};">Valor:</span>
                <strong style="font-size: 14px;">${value} matrículas</strong>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span style="color: ${mode === 'dark' ? '#94a3b8' : '#64748b'};">Participação:</span>
                <strong style="font-size: 14px;">${percentage}%</strong>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                <span style="color: ${mode === 'dark' ? '#94a3b8' : '#64748b'};">Posição:</span>
                <strong style="font-size: 14px;">${rank}º lugar</strong>
              </div>
              <div style="
                padding-top: 8px;
                border-top: 1px solid ${mode === 'dark' ? 'rgba(148, 163, 184, 0.2)' : 'rgba(226, 232, 240, 0.8)'};
                font-size: 11px;
                color: ${mode === 'dark' ? '#94a3b8' : '#64748b'};
                text-align: center;
                font-style: italic;
              ">
                Total da categoria: ${total} matrículas
              </div>
            </div>
          `;
        }
      },
      grid: {
        show: true,
        borderColor: stackedGridColor,
        strokeDashArray: 3,
        padding: { left: 8, right: 20, top: 8, bottom: 8 },
        xaxis: { 
          lines: { show: true } 
        },
        yaxis: { 
          lines: { show: false } 
        }
      },
      states: {
        hover: {
          filter: {
            type: 'lighten',
            value: 0.15
          }
        },
        active: {
          allowMultipleDataPointsSelection: false,
          filter: {
            type: 'darken',
            value: 0.08
          }
        }
      },
      noData: { 
        text: 'Nenhum dado de tipo/setor encontrado', 
        style: { 
          color: mode === 'dark' ? '#94a3b8' : '#64748b',
          fontSize: '14px',
          fontWeight: 500
        } 
      },
      responsive: [
        {
          breakpoint: 1400,
          options: { 
            chart: { height: 340 }, 
            plotOptions: { bar: { barHeight: '68%' } },
            yaxis: { labels: { maxWidth: 200 } }
          }
        },
        {
          breakpoint: 992,
          options: {
            chart: { height: 360 },
            dataLabels: { enabled: false },
            plotOptions: { 
              bar: { 
                barHeight: '65%',
                dataLabels: { total: { enabled: true, offsetX: 12 } } 
              } 
            },
            legend: { 
              position: 'top', 
              itemMargin: { vertical: 3, horizontal: 8 },
              fontSize: '11px'
            }
          }
        },
        {
          breakpoint: 768,
          options: {
            chart: { height: 320 },
            yaxis: { labels: { maxWidth: 150, style: { fontSize: '11px' } } },
            xaxis: { labels: { style: { fontSize: '11px' } } },
            legend: { fontSize: '10px' }
          }
        }
      ]
    };
    const chartStacked = new ApexCharts(document.querySelector('#chart-stacked'), stackedOptions);
    chartStacked.render();
    window.AppPanel.charts.stacked = chartStacked;

    // Timeline
    const timeline = document.createElement('div');
    timeline.className = 'row g-3 mt-2';
    timeline.innerHTML = `
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
            <div id="chart-timeline" style="min-height: 380px;"></div>
          </div>
        </div>
      </div>`;
    if (target) target.appendChild(timeline);

    const mode2 = (document.documentElement.dataset.bsTheme || 'light');
    // Popular selects de filtro da timeline
    const selSetor = document.getElementById('flt-setor');
    const selTipo = document.getElementById('flt-tipo');
    const selSup = document.getElementById('flt-supervisor');
    function populateSelect(select, items, selectedValue, prefix){
      if(!select) return;
      // Limpa mantendo o primeiro option "all"
      select.querySelectorAll('option:not([value="all"])').forEach(o => o.remove());
      items.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = `${prefix}: ${v}`;
        if (selectedValue && selectedValue !== 'all' && v === selectedValue) opt.selected = true;
        select.appendChild(opt);
      });
      // Se selectedValue for 'all', garantir que o primeiro option fique selecionado
      if (selectedValue === 'all' && select.options.length) {
        select.value = 'all';
      }
    }
    populateSelect(selSetor, AVAILABLE_SETORES, SELECTED_SETOR, 'Setor');
    populateSelect(selTipo, AVAILABLE_TIPOS, SELECTED_TIPO, 'Tipo');
    populateSelect(selSup, AVAILABLE_SUPERVISORES, SELECTED_SUPERVISOR, 'Supervisor');
    const timelineSeries = [{ name: 'Matrículas', data: TIMELINE }];
    const timelineLineColor = mode2 === 'dark' ? '#60a5fa' : COL_ACCENT;
    const timelineGradientFrom = mode2 === 'dark' ? 'rgba(96, 165, 250, 0.35)' : 'rgba(52, 152, 219, 0.35)';
    const timelineGradientTo = mode2 === 'dark' ? 'rgba(15, 23, 42, 0.05)' : 'rgba(52, 152, 219, 0.02)';
    const timelineAxisColor = mode2 === 'dark' ? '#cbd5f5' : '#1f2937';
    const timelineGridColor = mode2 === 'dark' ? 'rgba(148, 163, 184, 0.18)' : 'rgba(15, 23, 42, 0.08)';
    // Encontrar o valor máximo e seu índice para destacar
    const maxValue = Math.max(...TIMELINE.map(point => point[1]));
    const maxIndex = TIMELINE.findIndex(point => point[1] === maxValue);
    
    const timelineOptions = {
      series: timelineSeries,
      chart: {
        type: 'area',
        height: 420,
        foreColor: timelineAxisColor,
        toolbar: { show: false },
        animations: { enabled: true, easing: 'easeinout', speed: 700 },
        dropShadow: { enabled: true, top: 4, left: 0, blur: 6, opacity: 0.18, color: timelineLineColor }
      },
      theme: { mode: mode2 },
      colors: [timelineLineColor],
      dataLabels: { enabled: false },
      stroke: { curve: 'smooth', width: 3.4, lineCap: 'round' },
      xaxis: {
        type: 'datetime',
        labels: {
          datetimeFormatter: { month: 'dd/MM', day: 'dd/MM' },
          style: { colors: timelineAxisColor, fontWeight: 500 }
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
        crosshairs: { show: true, stroke: { color: timelineLineColor, width: 1, dashArray: 4 } }
      },
      yaxis: {
        decimalsInFloat: 0,
        labels: {
          formatter: (v) => Math.round(v),
          style: { colors: timelineAxisColor, fontWeight: 500 }
        }
      },
      tooltip: {
        shared: false,
        intersect: false,
        theme: mode2,
        custom: function({ series, seriesIndex, dataPointIndex, w }) {
          const value = series[seriesIndex][dataPointIndex];
          const dateMs = w.globals.seriesX[seriesIndex][dataPointIndex];
          const previous = dataPointIndex > 0 ? series[seriesIndex][dataPointIndex - 1] : null;
          const next = dataPointIndex < series[seriesIndex].length - 1 ? series[seriesIndex][dataPointIndex + 1] : null;
          const delta = previous !== null ? value - previous : null;
          
          // Calcular tendência baseada em múltiplos pontos
          let trend = 'stable';
          if (dataPointIndex >= 2) {
            const recent = series[seriesIndex].slice(Math.max(0, dataPointIndex - 2), dataPointIndex + 1);
            const isIncreasing = recent.every((val, i) => i === 0 || val >= recent[i - 1]);
            const isDecreasing = recent.every((val, i) => i === 0 || val <= recent[i - 1]);
            if (isIncreasing && recent[recent.length - 1] > recent[0]) trend = 'up';
            else if (isDecreasing && recent[recent.length - 1] < recent[0]) trend = 'down';
          }
          
          const trendIcon = trend === 'up' ? '📈' : trend === 'down' ? '📉' : '📊';
          const trendColor = trend === 'up' ? '#10b981' : trend === 'down' ? '#ef4444' : '#6b7280';
          const trendText = trend === 'up' ? 'Crescimento' : trend === 'down' ? 'Declínio' : 'Estável';
          
          const date = new Date(dateMs);
          const dateStr = date.toLocaleDateString('pt-BR', { 
            weekday: 'short',
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric' 
          });
          const timeStr = date.toLocaleTimeString('pt-BR', { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
          });
          const deltaStr = delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta}`;
          
          // Calcular estatísticas do período
          const allValues = series[seriesIndex];
          const maxValue = Math.max(...allValues);
          const minValue = Math.min(...allValues);
          const avgValue = allValues.reduce((a, b) => a + b, 0) / allValues.length;
          const isMax = value === maxValue;
          const isMin = value === minValue;
          
          return `
            <div style="
              background: ${mode2 === 'dark' ? 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)' : 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)'};
              color: ${mode2 === 'dark' ? '#e2e8f0' : '#1f2937'};
              padding: 16px 20px;
              border-radius: 16px;
              box-shadow: 0 20px 60px rgba(0, 0, 0, ${mode2 === 'dark' ? '0.4' : '0.15'}), 0 8px 20px rgba(0, 0, 0, ${mode2 === 'dark' ? '0.2' : '0.1'});
              border: 1px solid ${mode2 === 'dark' ? 'rgba(148, 163, 184, 0.2)' : 'rgba(226, 232, 240, 0.8)'};
              font-family: 'Segoe UI', system-ui, sans-serif;
              font-size: 13px;
              min-width: 280px;
              position: relative;
            ">
              <div style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
                padding-bottom: 8px;
                border-bottom: 1px solid ${mode2 === 'dark' ? 'rgba(148, 163, 184, 0.1)' : 'rgba(226, 232, 240, 0.5)'};
              ">
                <div>
                  <div style="font-size: 14px; font-weight: 700; color: ${mode2 === 'dark' ? '#cbd5f5' : '#1f2937'};">
                    ${dateStr}
                  </div>
                  <div style="font-size: 11px; color: ${mode2 === 'dark' ? '#94a3b8' : '#64748b'}; margin-top: 2px;">
                    ${timeStr}
                  </div>
                </div>
                <div style="
                  background: ${timelineLineColor}20;
                  border: 2px solid ${timelineLineColor};
                  border-radius: 50%;
                  width: 16px;
                  height: 16px;
                  box-shadow: 0 0 12px ${timelineLineColor}40;
                "></div>
              </div>
              
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                <span style="color: ${mode2 === 'dark' ? '#94a3b8' : '#64748b'}; font-weight: 500;">Valor:</span>
                <div style="text-align: right;">
                  <strong style="font-size: 18px; font-weight: 800; color: ${timelineLineColor};">
                    ${value.toLocaleString('pt-BR')}
                  </strong>
                  <div style="font-size: 10px; color: ${mode2 === 'dark' ? '#94a3b8' : '#64748b'};">
                    matrículas
                  </div>
                </div>
              </div>
              
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                <span style="color: ${mode2 === 'dark' ? '#94a3b8' : '#64748b'}; font-weight: 500;">Variação:</span>
                <strong style="color: ${delta === null ? '#6b7280' : delta > 0 ? '#10b981' : delta < 0 ? '#ef4444' : '#6b7280'};">
                  ${deltaStr}
                </strong>
              </div>
              
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                <span style="color: ${mode2 === 'dark' ? '#94a3b8' : '#64748b'}; font-weight: 500;">Tendência:</span>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="font-size: 14px;">${trendIcon}</span>
                  <strong style="color: ${trendColor}; font-size: 12px;">${trendText}</strong>
                </div>
              </div>
              
              ${isMax || isMin ? `
                <div style="
                  background: ${isMax ? 'linear-gradient(90deg, #10b98120, #10b98110)' : 'linear-gradient(90deg, #ef444420, #ef444410)'};
                  border: 1px solid ${isMax ? '#10b981' : '#ef4444'}40;
                  border-radius: 8px;
                  padding: 6px 10px;
                  margin-bottom: 8px;
                  text-align: center;
                ">
                  <span style="font-size: 11px; font-weight: 600; color: ${isMax ? '#10b981' : '#ef4444'};">
                    ${isMax ? '🏆 Valor Máximo do Período' : '📉 Valor Mínimo do Período'}
                  </span>
                </div>
              ` : ''}
              
              <div style="
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
                margin-top: 8px;
                padding-top: 8px;
                border-top: 1px solid ${mode2 === 'dark' ? 'rgba(148, 163, 184, 0.1)' : 'rgba(226, 232, 240, 0.5)'};
                font-size: 11px;
              ">
                <div style="text-align: center;">
                  <div style="color: ${mode2 === 'dark' ? '#94a3b8' : '#64748b'};">Máximo</div>
                  <strong style="color: #10b981;">${maxValue}</strong>
                </div>
                <div style="text-align: center;">
                  <div style="color: ${mode2 === 'dark' ? '#94a3b8' : '#64748b'};">Mínimo</div>
                  <strong style="color: #ef4444;">${minValue}</strong>
                </div>
              </div>
              
              <div style="
                text-align: center;
                margin-top: 8px;
                padding-top: 8px;
                border-top: 1px solid ${mode2 === 'dark' ? 'rgba(148, 163, 184, 0.1)' : 'rgba(226, 232, 240, 0.5)'};
                font-size: 11px;
                color: ${mode2 === 'dark' ? '#94a3b8' : '#64748b'};
                font-style: italic;
              ">
                Média do período: ${Math.round(avgValue)} matrículas
              </div>
            </div>
          `;
        }
      },
      grid: {
        show: true,
        borderColor: timelineGridColor,
        strokeDashArray: 3,
        padding: { left: 12, right: 20, top: 12, bottom: 8 },
        xaxis: { 
          lines: { show: true } 
        },
        yaxis: { 
          lines: { show: true } 
        }
      },
      fill: {
        type: 'gradient',
        gradient: {
          shade: mode2,
          shadeIntensity: 0.8,
          opacityFrom: 0.6,
          opacityTo: 0.05,
          stops: [0, 90, 100],
          colorStops: [
            {
              offset: 0,
              color: timelineGradientFrom,
              opacity: 0.8
            },
            {
              offset: 50,
              color: timelineGradientFrom,
              opacity: 0.4
            },
            {
              offset: 100,
              color: timelineGradientTo,
              opacity: 0
            }
          ]
        }
      },
      markers: {
        size: 4,
        colors: [mode2 === 'dark' ? '#0f172a' : '#ffffff'],
        strokeColors: timelineLineColor,
        strokeWidth: 2,
        hover: { 
          size: 6, 
          sizeOffset: 1 
        },
        discrete: maxIndex >= 0 ? [{
          seriesIndex: 0,
          dataPointIndex: maxIndex,
          fillColor: '#fbbf24',
          strokeColor: '#f59e0b',
          size: 10,
          shape: 'circle'
        }] : []
      },
      annotations: {
        points: maxIndex >= 0 ? [{
          x: TIMELINE[maxIndex][0],
          y: TIMELINE[maxIndex][1],
          marker: {
            size: 8,
            fillColor: '#fbbf24',
            strokeColor: '#f59e0b',
            strokeWidth: 2,
            shape: 'circle'
          },
          label: {
            borderColor: '#f59e0b',
            borderWidth: 1,
            borderRadius: 6,
            offsetY: -25,
            offsetX: 0,
            style: {
              color: mode2 === 'dark' ? '#0f172a' : '#ffffff',
              background: '#fbbf24',
              fontSize: '11px',
              fontWeight: 700,
              padding: {
                left: 6,
                right: 6,
                top: 3,
                bottom: 3
              }
            },
            text: `🏆 Máx: ${maxValue}`
          }
        }] : []
      },
      states: {
        hover: {
          filter: {
            type: 'lighten',
            value: 0.1
          }
        },
        active: {
          allowMultipleDataPointsSelection: false,
          filter: {
            type: 'darken',
            value: 0.05
          }
        }
      },
      noData: { 
        text: 'Nenhum dado temporal disponível', 
        style: { 
          color: mode2 === 'dark' ? '#94a3b8' : '#64748b',
          fontSize: '14px',
          fontWeight: 500
        } 
      },
      responsive: [
        {
          breakpoint: 1200,
          options: { 
            chart: { height: 380 }, 
            markers: { size: 4, hover: { size: 7 } },
            dataLabels: { enabled: false }
          }
        },
        {
          breakpoint: 768,
          options: {
            chart: { 
              height: 320,
              toolbar: { show: false }
            },
            markers: { size: 0, hover: { size: 5 } },
            dataLabels: { enabled: false },
            stroke: { width: 3 },
            tooltip: { 
              custom: undefined, 
              x: { format: 'dd/MM/yyyy HH:mm' }, 
              y: { formatter: (v) => `${v} matrículas` } 
            },
            xaxis: {
              labels: { rotate: -90, style: { fontSize: '10px' } }
            },
            yaxis: {
              title: { text: undefined },
              labels: { style: { fontSize: '10px' } }
            }
          }
        }
      ]
    };
  const chartTimeline = new ApexCharts(document.querySelector('#chart-timeline'), timelineOptions);
  chartTimeline.render();
  window.AppPanel.charts.timeline = chartTimeline;

    // Aplicar filtros: lê valores atuais dos selects
    document.getElementById('apply-timeline')?.addEventListener('click', () => {
      const params = new URLSearchParams(window.location.search);
      // Preserva período e turno já definidos via form acima
      const minData = document.getElementById('min_data')?.value;
      const maxData = document.getElementById('max_data')?.value;
      const turno = document.getElementById('turno')?.value;
      if (minData) params.set('min_data', minData);
      if (maxData) params.set('max_data', maxData);
      if (turno) params.set('turno', turno);
      // Define filtros da timeline
      params.set('setor', selSetor ? selSetor.value : 'all');
      params.set('tipo', selTipo ? selTipo.value : 'all');
      params.set('supervisor', selSup ? selSup.value : 'all');
      window.location.search = params.toString();
    });

    ap.mounted = true;
  }

  function setupTabs() {
    if (window.AppPanel.tabsBound) return; // evita múltiplas ligações
    const buttons = document.querySelectorAll('.card-header .btn-group [data-target]');
    const label = document.getElementById('dataset-label');
    const sections = ['#tab-registros', '#tab-input', '#tab-merge'].map(id => document.querySelector(id));
    const names = { '#tab-registros': 'Registros', '#tab-input': 'Input*Dados', '#tab-merge': 'Registros x Input*Dados' };

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        sections.forEach(sec => sec && sec.classList.add('d-none'));
        const target = document.querySelector(btn.getAttribute('data-target'));
        if (target) target.classList.remove('d-none');
        if (label) label.textContent = names[btn.getAttribute('data-target')] || '';
      });
    });

    window.AppPanel.tabsBound = true;
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    mountCharts();
  });
})();
