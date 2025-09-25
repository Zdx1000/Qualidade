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
              <i class="bi bi-speedometer2 me-2"></i>
              <h6 class="mb-0">Setor x Matrícula (contagem)</h6>
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
              <i class="bi bi-pie-chart me-2"></i>
              <h6 class="mb-0">Turno x Matrícula (contagem)</h6>
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
              <i class="bi bi-bar-chart-steps me-2"></i>
              <h6 class="mb-0">Tipo x Matrícula (empilhado)</h6>
            </div>
          </div>
          <div class="card-body">
            <div id="chart-stacked" style="min-height: 360px;"></div>
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

    // Gráfico radialBar por setor: top 6
    const topN = 6;
    const setores = SETOR_LABELS.map((l, i) => ({ label: l, value: SETOR_SERIES[i] || 0 }))
      .sort((a,b) => b.value - a.value)
      .slice(0, topN);
    const radialOptions = {
      chart: { type: 'radialBar', height: 360, foreColor: '#444' },
      theme: { mode },
      colors: palette,
      series: setores.map(s => s.value),
      labels: setores.map(s => s.label),
      plotOptions: {
        radialBar: {
          hollow: { size: '55%', background: '#fff' },
          track: { background: COL_LIGHTBG, dropShadow: { enabled: true, blur: 3 } },
          dataLabels: {
            name: { fontSize: '13px' },
            value: { fontSize: '18px', fontWeight: 700 },
            total: {
              show: true,
              label: 'Total',
              formatter: function () { return setores.reduce((acc, s) => acc + s.value, 0); }
            }
          }
        }
      },
      tooltip: { theme: mode, y: { formatter: (val) => `${val} matrículas` } },
      grid: baseGrid,
      states: baseStates,
    };
  const chartSetor = new ApexCharts(document.querySelector('#chart-setor'), radialOptions);
  chartSetor.render();
  window.AppPanel.charts.setor = chartSetor;

    // Donut por turno
    const donutOptions = {
      chart: { type: 'donut', height: 360 },
      theme: { mode },
      colors: palette,
      labels: TURNO_LABELS,
      series: TURNO_SERIES,
      legend: { position: 'bottom', markers: { width: 10, height: 10, radius: 12 } },
      tooltip: { theme: mode, y: { formatter: (val) => `${val} matrículas` } },
      plotOptions: {
        pie: { donut: { size: '60%', labels: { show: true, total: { show: true, label: 'Total', formatter: (w) => w.globals.seriesTotals.reduce((a, b) => a + b, 0) }, value: { fontSize: '18px', fontWeight: 700 } } } }
      }
    };
  const chartTurno = new ApexCharts(document.querySelector('#chart-turno'), donutOptions);
  chartTurno.render();
  window.AppPanel.charts.turno = chartTurno;

    // Stacked Bar por Tipo e Setor
    const stackedOptions = {
      series: STACKED_SERIES,
      chart: { type: 'bar', height: 360, stacked: true, foreColor: '#444' },
      colors: palette,
      theme: { mode },
      plotOptions: { bar: { horizontal: true, barHeight: '70%', borderRadius: 4, dataLabels: { total: { enabled: true, style: { fontSize: '12px', fontWeight: 700 } } } } },
      stroke: { width: 1, colors: ['#fff'] },
      xaxis: { categories: STACKED_CATEGORIES, labels: { formatter: (v) => Math.round(v) } },
      legend: { position: 'bottom' },
      fill: { opacity: 0.9 },
      tooltip: { theme: mode, y: { formatter: (val) => `${val} matrículas` } },
      grid: baseGrid,
      states: baseStates,
      noData: { text: 'Sem dados', style: { color: '#999' } }
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
              <i class="bi bi-graph-up me-2"></i>
              <h6 class="mb-0">Linha do tempo: Data x Matrícula (contagem)</h6>
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
    const timelineOptions = {
      series: [{ name: 'Matrículas', data: TIMELINE }],
      chart: { type: 'area', height: 420, foreColor: '#444', toolbar: { show: false } },
      theme: { mode: mode2 },
      colors: [COL_ACCENT],
      dataLabels: { enabled: false },
      stroke: { curve: 'smooth', width: 3 },
      xaxis: { type: 'datetime', labels: { datetimeFormatter: { month: 'dd/MM', day: 'dd/MM' } } },
      yaxis: { labels: { formatter: (v) => Math.round(v) } },
      tooltip: { theme: mode2, x: { format: 'dd/MM/yyyy' }, y: { formatter: (v) => `${v} matrículas` } },
      grid: baseGrid,
      fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.05 } },
      markers: { size: 0, hover: { size: 6 } },
      noData: { text: 'Sem dados', style: { color: '#999' } }
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
