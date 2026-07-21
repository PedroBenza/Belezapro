// ====================================================================
//  chart-module.js — extraído do app.js (Fase C da modularização)
//  Conteúdo: Gráfico semanal (swipe, renderização) e controlos do gráfico
//  Linhas originais: 911-1142
//  Carregar depois de core-*.js, db-indexeddb.js, sync-*.js, auth-supabase.js
// ====================================================================

// ====================================================================
//  GRÁFICO
// ====================================================================
let _chartSwipeStartX = null;
let _chartSwipeStartY = null;

function renderizarGrafico() {
  const canvas = document.getElementById('weekly-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const parentWidth = canvas.parentElement.getBoundingClientRect().width || 400;
  const width = Math.max(parentWidth, 200);
  const height = 160;
  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);

  const periodo = state.chartPeriodo || 'semana';
  const offset = state.chartOffset || 0;
  const mostrarValores = state.chartMostrarValores || false;

  const diasArr = [];
  let labels = [];
  let dados = [];
  let maxVal = 1;

  if (periodo === 'hora') {
    for (let h = 0; h < 12; h++) {
      const d = new Date();
      d.setDate(d.getDate() - offset);
      const ds = d.toISOString().split('T')[0];
      const hr = String(h * 2).padStart(2, '0');
      diasArr.push({ label: hr + 'h', data: ds, hora: hr });
    }
    labels = diasArr.map(d => d.label);
    dados = diasArr.map(d => {
      const hr = parseInt(d.hora);
      const total = state.movimentos.filter(m =>
        m.data === d.data && m.tipo === 'venda' && m.hora &&
        parseInt(m.hora.split(':')[0]) >= hr && parseInt(m.hora.split(':')[0]) < hr + 2
      ).reduce((s, v) => s + v.valor, 0);
      if (total > maxVal) maxVal = total;
      return total;
    });
  } else if (periodo === 'dia' || periodo === 'semana') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i - offset * 7);
      const ds = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('pt-AO', { weekday: 'short' }).replace('.', '');
      diasArr.push({ label, data: ds });
    }
    labels = diasArr.map(d => d.label);
    dados = diasArr.map(d => {
      const total = state.movimentos.filter(m => m.data === d.data && m.tipo === 'venda').reduce((s, v) => s + v.valor, 0);
      if (total > maxVal) maxVal = total;
      return total;
    });
  } else if (periodo === 'mes') {
    for (let i = 6; i >= 0; i--) {
      const dStart = new Date();
      dStart.setDate(dStart.getDate() - (i * 4 + 3) - offset * 30);
      const dEnd = new Date();
      dEnd.setDate(dEnd.getDate() - i * 4 - offset * 30);
      const label = dEnd.toLocaleDateString('pt-AO', { day: '2-digit', month: 'short' }).replace('.', '');
      const startStr = dStart.toISOString().split('T')[0];
      const endStr = dEnd.toISOString().split('T')[0];
      diasArr.push({ label, startData: startStr, endData: endStr });
    }
    labels = diasArr.map(d => d.label);
    dados = diasArr.map(d => {
      const total = state.movimentos.filter(m =>
        m.tipo === 'venda' && m.data >= d.startData && m.data <= d.endData
      ).reduce((s, v) => s + v.valor, 0);
      if (total > maxVal) maxVal = total;
      return total;
    });
  }

  maxVal = Math.max(maxVal, 1);

  const barW = (width - 40) / labels.length - 4;
  const startX = 20;
  const baseY = height - 20;

  for (let i = 0; i < labels.length; i++) {
    const x = startX + i * (barW + 4);
    const barH = Math.max(4, (dados[i] / maxVal) * (height - 40));
    const y = baseY - barH;
    const radius = 4;

    const grad = ctx.createLinearGradient(0, y, 0, baseY);
    if (dados[i] > 0) {
      grad.addColorStop(0, '#D4AF37');
      grad.addColorStop(1, '#A7872B');
    } else {
      grad.addColorStop(0, '#DCD5C9');
      grad.addColorStop(1, '#DCD5C9');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + barW - radius, y);
    ctx.arcTo(x + barW, y, x + barW, y + radius, radius);
    ctx.lineTo(x + barW, baseY);
    ctx.lineTo(x, baseY);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = (i === labels.length - 1 && offset === 0) ? '#1C1A18' : '#8c8980';
    ctx.font = (i === labels.length - 1 && offset === 0) ? 'bold 9px Inter' : '9px Inter';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(labels[i], x + barW / 2, baseY + 4);

    if (mostrarValores && dados[i] > 0) {
      ctx.fillStyle = '#1C1A18';
      ctx.font = 'bold 9px Inter';
      ctx.textBaseline = 'bottom';
      ctx.fillText(fmtKz(dados[i]).replace(' Kz', ''), x + barW / 2, y - 2);
    }
  }

  const labelEl = document.getElementById('chart-period-label');
  if (labelEl) {
    const periodoLabels = {
      hora:   offset === 0 ? 'Hoje por hora'    : `Há ${offset} dias (hora)`,
      dia:    offset === 0 ? 'Últimos 7 dias'   : `Semana −${offset}`,
      semana: offset === 0 ? 'Últimos 7 dias'   : `Semana −${offset}`,
      mes:    offset === 0 ? 'Últimos 30 dias'  : `Período −${offset}`
    };
    labelEl.textContent = periodoLabels[periodo] || 'Últimos 7 dias';
  }

  const tooltip = document.getElementById('chart-tooltip');
  if (!tooltip) return;

  const handleHover = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const mouseX = (clientX - rect.left) * scaleX;
    let idx = -1;
    for (let i = 0; i < labels.length; i++) {
      const x = startX + i * (barW + 4);
      if (mouseX >= x && mouseX <= x + barW) { idx = i; break; }
    }
    if (idx !== -1 && dados[idx] > 0) {
      tooltip.style.left = (clientX + 10) + 'px';
      tooltip.style.top  = (clientY - 30) + 'px';
      tooltip.textContent = `${labels[idx]}: ${fmtKz(dados[idx])}`;
      tooltip.style.opacity = '1';
    } else {
      tooltip.style.opacity = '0';
    }
  };

  canvas.onmousemove  = e => handleHover(e.clientX, e.clientY);
  canvas.onmouseleave = () => { tooltip.style.opacity = '0'; };

  canvas.ontouchstart = e => {
    if (e.touches.length > 0) {
      _chartSwipeStartX = e.touches[0].clientX;
      _chartSwipeStartY = e.touches[0].clientY;
      handleHover(e.touches[0].clientX, e.touches[0].clientY);
    }
  };
  canvas.ontouchmove = e => {
    if (e.touches.length > 0) handleHover(e.touches[0].clientX, e.touches[0].clientY);
  };
  canvas.ontouchend = e => {
    tooltip.style.opacity = '0';
    if (_chartSwipeStartX !== null && e.changedTouches.length > 0) {
      const dx = e.changedTouches[0].clientX - _chartSwipeStartX;
      const dy = e.changedTouches[0].clientY - _chartSwipeStartY;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) state.chartOffset += 1;
        else if (state.chartOffset > 0) state.chartOffset -= 1;
        localStorage.setItem('bp_chart_offset', String(state.chartOffset));
        renderizarGrafico();
      }
    }
    _chartSwipeStartX = null;
    _chartSwipeStartY = null;
  };
}

function initChartControls() {
  document.querySelectorAll('.chart-filter').forEach(btn => {
    btn.addEventListener('click', function() {
      const periodo = this.dataset.periodo;
      state.chartPeriodo = periodo;
      localStorage.setItem('bp_chart_periodo', periodo);
      state.chartOffset = 0;
      localStorage.setItem('bp_chart_offset', '0');
      document.querySelectorAll('.chart-filter').forEach(b => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-secondary');
      });
      this.classList.remove('btn-secondary');
      this.classList.add('btn-primary');
      renderizarGrafico();
    });
  });

  const prevBtn = document.getElementById('chart-prev');
  const nextBtn = document.getElementById('chart-next');
  if (prevBtn) prevBtn.onclick = () => { state.chartOffset += 1; localStorage.setItem('bp_chart_offset', String(state.chartOffset)); renderizarGrafico(); };
  if (nextBtn) nextBtn.onclick = () => { if (state.chartOffset > 0) { state.chartOffset -= 1; localStorage.setItem('bp_chart_offset', String(state.chartOffset)); renderizarGrafico(); } };

  const eyeToggle = document.getElementById('chart-eye-toggle');
  if (eyeToggle) {
    eyeToggle.addEventListener('click', function() {
      state.chartMostrarValores = !state.chartMostrarValores;
      localStorage.setItem('bp_chart_mostrar_valores', String(state.chartMostrarValores));
      const svg = this.querySelector('svg');
      if (svg) {
        if (state.chartMostrarValores) {
          svg.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
        } else {
          svg.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`;
        }
      }
      renderizarGrafico();
    });
  }
}
// ====================================================================
//  DETALHE VENDA E IMPRESSÃO
// ====================================================================
