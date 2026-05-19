// 1. Variables Globales (Solo para RH)
let DATOS_RH = [];
let currentTab = 'asistencia';

// 2. Funciones de Utilidad
function parseHora(str) {
  const m = (str||'').match(/(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
}
function calcRetraso(entrada_h, entrada_prog) {
  const real = parseHora(entrada_h), prog = parseHora(entrada_prog);
  if (real === null || prog === null) return 0;
  const diff = real - prog; return diff > 15 ? diff - 15 : 0;
}
function parseFechaStr(str) {
  if (!str) return null; const p = str.split('/');
  return p.length === 3 ? new Date(+('20'+p[2].slice(-2)), +p[1] - 1, +p[0]) : null;
}
function parseFiltroFechas(str) {
  str = str.trim(); if (!str) return null;
  if (str.includes(':')) { const [a, b] = str.split(':'); return { tipo: 'rango', desde: parseFechaStr(a), hasta: parseFechaStr(b) }; }
  const partes = str.split(',').map(s => parseFechaStr(s.trim())).filter(Boolean);
  return partes.length ? { tipo: 'lista', fechas: partes } : null;
}
function fechaEnFiltro(fechaStr, f) {
  if (!f) return true; const d = parseFechaStr(fechaStr); if (!d) return true;
  return f.tipo === 'rango' ? (d >= f.desde && d <= f.hasta) : f.fechas.some(ff => ff.getTime() === d.getTime());
}

// 3. Navegación
function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  event.currentTarget.classList.add('active');
  document.getElementById('container-revisar').style.display = (tab === 'ubicaciones') ? 'flex' : 'none';
  render();
}

function toggleSup(el) { el.closest('.supervisor-section').classList.toggle('collapsed'); }

function resetFiltros() {
  document.getElementById('filter-supervisor').value = '';
  document.getElementById('filter-empleado').value = '';
  document.getElementById('filter-fechas').value = '';
  document.getElementById('filter-revisar').checked = false;
  render();
}

// 4. Renderizado Visual
function render() {
  const supFiltro = document.getElementById('filter-supervisor').value;
  const empFiltro = document.getElementById('filter-empleado').value.toLowerCase().trim();
  const f = parseFiltroFechas(document.getElementById('filter-fechas').value);
  const soloRevisar = document.getElementById('filter-revisar').checked;

  let empleados = DATOS_RH.map(emp => ({
    ...emp,
    _dias: (emp.dias || []).filter(d => {
      const matchFecha = fechaEnFiltro(d.fecha, f);
      if (currentTab === 'ubicaciones' && soloRevisar) { return matchFecha && d.Entrada_h && !d.Ubicacion; }
      return matchFecha;
    })
  })).filter(emp => {
    if (supFiltro && emp.Supervisor !== supFiltro) return false;
    if (empFiltro) {
      const nombre = (emp['Nombre completo'] || '').toLowerCase();
      const id = (emp['Numero de empleado'] || '').toLowerCase();
      if (!nombre.includes(empFiltro) && !id.includes(empFiltro)) return false;
    }
    if (currentTab === 'ubicaciones' && emp._dias.length === 0) return false;
    return true;
  });

  const grupos = {};
  empleados.forEach(emp => {
    const sup = emp.Supervisor || 'Sin supervisor';
    if (!grupos[sup]) grupos[sup] = [];
    grupos[sup].push(emp);
  });

  const cont = document.getElementById('contenido');
  if (Object.keys(grupos).length === 0) {
    cont.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted);">No hay resultados.</div>`;
    return;
  }

  if (currentTab === 'asistencia') {
    cont.innerHTML = Object.entries(grupos).map(([sup, emps]) => renderSupAsistencia(sup, emps)).join('');
  } else {
    cont.innerHTML = Object.entries(grupos).map(([sup, emps]) => renderSupUbicaciones(sup, emps)).join('');
  }
}

function renderSupAsistencia(sup, emps) {
  return `
  <div class="supervisor-section">
    <div class="supervisor-header" onclick="toggleSup(this)">
      <span class="pill pill-ok">SUP</span><h2>${sup}</h2><span class="sup-arrow">▼</span>
    </div>
    <div class="supervisor-body">
      ${emps.map(e => {
        const rSem = e._dias.reduce((a, d) => a + calcRetraso(d.Entrada_h, e.Entrada), 0);
        return `
        <div class="employee-card">
          <div class="employee-header" onclick="this.nextElementSibling.classList.toggle('open')">
            <span class="emp-id">#${e['Numero de empleado']}</span>
            <span style="font-weight:500; font-size:14px;">${e['Nombre completo']}</span>
            <span class="emp-retraso-badge ${rSem===0?'badge-ok':rSem<=30?'badge-warn':'badge-err'}">
              ${rSem===0 ? '✓ A tiempo' : `⚠ ${rSem} min acumulados`}
            </span>
          </div>
          <div class="employee-detail">
            <div class="table-responsive">
              <table class="data-table">
                <thead><tr><th>Fecha</th><th>Día</th><th>Entrada</th><th>Salida</th><th>Retraso</th><th>Incidencia</th><th>Comentario RH</th></tr></thead>
                <tbody>
                  ${e._dias.map(d => {
                    const ret = calcRetraso(d.Entrada_h, e.Entrada);
                    const hasInc = d.Descripcion || d.Comentario;
                    return `<tr style="${hasInc ? 'background: #fffbeb;' : ''}">
                      <td style="font-family:var(--mono)">${d.fecha}</td><td>${d.Día}</td>
                      <td style="font-family:var(--mono); font-weight:500;">${d.Entrada_h || '<span class="pill pill-gray">—</span>'}</td>
                      <td style="font-family:var(--mono)">${d.Salida_h  || '<span class="pill pill-gray">—</span>'}</td>
                      <td>${ret === 0 ? '<span class="pill pill-ok">0 min</span>' : `<span class="pill pill-err">+${ret} min</span>`}</td>
                      <td class="col-texto">${d.Descripcion ? `<b>⚑</b> ${d.Descripcion}` : '<span class="pill pill-gray">—</span>'}</td>
                      <td class="col-texto">${d.Comentario ? d.Comentario : '<span class="pill pill-gray">—</span>'}</td>
                    </tr>`;
                  }).join('') || '<tr><td colspan="7" style="text-align:center">Sin registros</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function renderSupUbicaciones(sup, emps) {
  const filas = emps.flatMap(emp => emp._dias.map(d => ({ emp, d }))).filter(item => item.d.Entrada_h !== "");
  if (filas.length === 0) return '';
  return `
  <div class="supervisor-section">
    <div class="supervisor-header" onclick="toggleSup(this)">
      <span class="pill pill-warn">UBICACIONES</span><h2>${sup}</h2>
      <span style="margin-left:16px; font-size:12px; color:var(--text-muted)">${filas.length} registros</span><span class="sup-arrow">▼</span>
    </div>
    <div class="supervisor-body">
      <div class="table-responsive" style="margin:0; border:none; border-radius:0;">
        <table class="data-table">
          <thead><tr><th>ID</th><th>Empleado</th><th>Fecha y Hora</th><th>Ubicación (DOPAJ)</th><th>Dirección Física</th><th>Estado</th></tr></thead>
          <tbody>
            ${filas.map(({emp, d}) => {
              const tieneNombre = d.Ubicacion && d.Ubicacion.trim() !== "";
              const estadoBadge = tieneNombre ? '<span class="pill pill-ok">Habilitado</span>' : '<span class="pill pill-err">Requiere Revisión</span>';
              return `<tr style="${!tieneNombre ? 'background: #fef2f2;' : ''}">
                <td><span class="emp-id">#${emp['Numero de empleado']}</span></td>
                <td style="font-weight:500;">${emp['Nombre completo']}</td>
                <td><b style="font-family:var(--mono)">${d.fecha}</b> a las <b style="font-family:var(--mono)">${d.Entrada_h}</b></td>
                <td class="col-texto"><b>${tieneNombre ? d.Ubicacion : '<i>(Vacío / No Identificado)</i>'}</b></td>
                <td class="col-texto">${d.Direccion || '<span class="pill pill-gray">Sin coordenadas</span>'}</td>
                <td>${estadoBadge}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

// 5. Arranque
window.addEventListener("DOMContentLoaded", () => {
  fetch(`datos_directorio.json?v=${new Date().getTime()}`)
    .then(response => response.json())
    .then(data => {
      DATOS_RH = data;

      const sups = [...new Set(DATOS_RH.map(e => e.Supervisor).filter(Boolean))].sort();
      sups.forEach(s => document.getElementById('filter-supervisor').innerHTML += `<option value="${s}">${s}</option>`);

      const fechas = DATOS_RH.flatMap(e => (e.dias||[]).map(d => d.fecha)).filter(Boolean);
      if (fechas.length) {
        const s = fechas.slice().sort((a,b) => parseFechaStr(a) - parseFechaStr(b));
        document.getElementById('header-range').textContent = `Período: ${s[0]} al ${s[s.length-1]}`;
      }

      ['filter-supervisor', 'filter-empleado', 'filter-fechas'].forEach(id => 
        document.getElementById(id).addEventListener(id === 'filter-fechas' ? 'input' : 'change', render)
      );

      render();
    })
    .catch(error => {
      console.error("Error:", error);
      document.getElementById('contenido').innerHTML = `<div style="padding:40px;text-align:center;color:red;">Error al cargar datos_directorio.json.</div>`;
    });
});