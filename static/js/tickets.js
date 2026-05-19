// 1. Variables Globales (Solo para tickets)
let DATOS_TICKETS = {};
let todosLosTickets = [];
let miChart    = null;
let chartDias  = null;
let chartEstado = null;

let supervisorSeleccionado = null;
let statusFiltro           = "todos";
let sortCol                = "fecha";
let sortDir                = -1;
let paginaActual           = 1;
const POR_PAGINA           = 20;

// 2. Inicialización
window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("msg").textContent = "Cargando datos desde el servidor...";
    document.getElementById("msg").style.display = "block";

    fetch(`datos_tickets.json?v=${new Date().getTime()}`)
        .then(response => {
            if (!response.ok) throw new Error("Error en la red");
            return response.json();
        })
        .then(data => {
            DATOS_TICKETS = data;
            todosLosTickets = DATOS_TICKETS.tickets_detalle;

            const fechas = todosLosTickets.map(t => t.fecha).sort();
            if (fechas.length > 0) {
                document.getElementById("fechaDesde").value = fechas[0];
                document.getElementById("fechaHasta").value = fechas[fechas.length - 1];
            }

            document.getElementById("msg").style.display = "none";
            document.getElementById("chartWrap").style.display = "block";
            
            calcularHoy();
            dibujarGrafica(todosLosTickets);
            dibujarGraficaEstado();
            renderTabla();
        })
        .catch(error => {
            console.error("Error:", error);
            document.getElementById("msg").innerHTML = `<span style="color: red;">Error al cargar datos_tickets.json</span>`;
        });
});

// 3. Funciones de Filtros y Tablas
function aplicarFiltro() {
    const desde = document.getElementById("fechaDesde").value;
    const hasta = document.getElementById("fechaHasta").value;
    if (!desde || !hasta) { alert("Selecciona ambas fechas."); return; }
    if (desde > hasta)    { alert("'Desde' no puede ser mayor que 'Hasta'."); return; }
    dibujarGrafica(todosLosTickets.filter(t => t.fecha >= desde && t.fecha <= hasta));
}

function resetFiltro() {
    const fechas = todosLosTickets.map(t => t.fecha).sort();
    document.getElementById("fechaDesde").value = fechas[0];
    document.getElementById("fechaHasta").value = fechas[fechas.length - 1];
    dibujarGrafica(todosLosTickets);
}

function calcularHoy() {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const hoyStr = hoy.toISOString().slice(0, 10);

    document.getElementById("labelHoy").textContent = hoy.toLocaleDateString("es-MX", { weekday:"long", day:"numeric", month:"long", year:"numeric" });

    const abiertosHoy   = todosLosTickets.filter(t => t.fecha === hoyStr);
    const finalizadosHoy  = todosLosTickets.filter(t => t.fecha_cierre === hoyStr);
    const finalizadosHoy2 = todosLosTickets.filter(t => t.fecha_completado === hoyStr);
    const cerradosHoy   = finalizadosHoy.filter(t => t.status === "Cerrado");
    const resueltosHoy  = finalizadosHoy2.filter(t => t.status === "Resuelto");
    const hayDatos = abiertosHoy.length > 0 || finalizadosHoy.length > 0;

    if (hayDatos) {
        document.getElementById("hoyGrid").style.display   = "grid";
        document.getElementById("hoyTablas").style.display = "grid";
        document.getElementById("hoyVacio").style.display  = "none";
        document.getElementById("hoyAbiertos").textContent = abiertosHoy.length.toLocaleString();
        document.getElementById("hoyCerrados").textContent = finalizadosHoy.length.toLocaleString();
        llenarTablaHoy("tablaCerradosHoy",  cerradosHoy,  "Cerrado");
        llenarTablaHoy("tablaResueltosHoy", resueltosHoy, "Resuelto");
    } else {
        document.getElementById("hoyGrid").style.display   = "none";
        document.getElementById("hoyTablas").style.display = "none";
        document.getElementById("hoyVacio").style.display  = "block";
    }
}

function llenarTablaHoy(tbodyId, tickets, etiqueta) {
    const tbody = document.getElementById(tbodyId);
    tbody.innerHTML = "";
    if (tickets.length === 0) {
        tbody.innerHTML = `<tr><td colspan="2" class="hoy-tabla-vacia">Sin ${etiqueta.toLowerCase()} hoy</td></tr>`;
        return;
    }
    const conteo = {};
    tickets.forEach(t => { conteo[t.supervisor] = (conteo[t.supervisor] || 0) + 1; });
    Object.entries(conteo).sort((a,b) => b[1]-a[1]).forEach(([sup,n]) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${sup}</td><td class="num">${n}</td>`;
        tbody.appendChild(tr);
    });
}

function actualizarAging(tickets) {
    const activos = tickets.filter(t => t.status === "Activo");
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    let menos5=0, entre5y30=0, mas30=0;
    activos.forEach(t => {
        const dias = Math.floor((hoy - new Date(t.fecha)) / 86400000);
        if      (dias < 5)  menos5++;
        else if (dias < 30) entre5y30++;
        else                mas30++;
    });
    const total = activos.length;
    const pct = n => total > 0 ? ((n/total)*100).toFixed(1) : "0.0";
    document.getElementById("aging0a5").textContent    = menos5.toLocaleString();
    document.getElementById("aging5a30").textContent   = entre5y30.toLocaleString();
    document.getElementById("aging30mas").textContent  = mas30.toLocaleString();
    document.getElementById("aging0a5pct").textContent   = `${pct(menos5)}% de los activos`;
    document.getElementById("aging5a30pct").textContent  = `${pct(entre5y30)}% de los activos`;
    document.getElementById("aging30maspct").textContent = `${pct(mas30)}% de los activos`;
    document.getElementById("bar0a5").style.width   = `${pct(menos5)}%`;
    document.getElementById("bar5a30").style.width  = `${pct(entre5y30)}%`;
    document.getElementById("bar30mas").style.width = `${pct(mas30)}%`;
}

function dibujarGrafica(tickets) {
    actualizarAging(todosLosTickets);
    const agrupado = {};
    tickets.forEach(t => {
        if (!agrupado[t.supervisor]) agrupado[t.supervisor] = { activo:0, resuelto:0, cerrado:0 };
        if (t.status === "Activo")   agrupado[t.supervisor].activo++;
        if (t.status === "Resuelto") agrupado[t.supervisor].resuelto++;
        if (t.status === "Cerrado")  agrupado[t.supervisor].cerrado++;
    });

    const supervisores = Object.keys(agrupado).sort((a,b) => {
        const tA = agrupado[a].activo + agrupado[a].resuelto + agrupado[a].cerrado;
        const tB = agrupado[b].activo + agrupado[b].resuelto + agrupado[b].cerrado;
        return tB - tA;
    });

    const dataActivos   = supervisores.map(s => agrupado[s].activo);
    const dataResueltos = supervisores.map(s => agrupado[s].resuelto);
    const dataCerrados  = supervisores.map(s => agrupado[s].cerrado);
    const sumA = dataActivos.reduce((a,b)=>a+b,0);
    const sumR = dataResueltos.reduce((a,b)=>a+b,0);
    const sumC = dataCerrados.reduce((a,b)=>a+b,0);
    const sumTotal = sumA + sumR + sumC;
    const pct = n => sumTotal > 0 ? ((n/sumTotal)*100).toFixed(1)+"%" : "0%";

    document.getElementById("totalActivos").textContent   = sumA.toLocaleString();
    document.getElementById("totalResueltos").textContent = sumR.toLocaleString();
    document.getElementById("totalCerrados").textContent  = sumC.toLocaleString();
    document.getElementById("totalGeneral").textContent   = sumTotal.toLocaleString();
    document.getElementById("pctActivos").textContent     = pct(sumA);
    document.getElementById("pctResueltos").textContent   = pct(sumR);
    document.getElementById("pctCerrados").textContent    = pct(sumC);
    document.getElementById("miGrafica").height = Math.max(400, supervisores.length * 20);

    if (miChart) miChart.destroy();
    miChart = new Chart(document.getElementById("miGrafica").getContext("2d"), {
        type: "bar",
        data: {
            labels: supervisores,
            datasets: [
                { label:"Resueltos", data:dataResueltos, backgroundColor:"#10b981", borderRadius:{topLeft:0,topRight:4,bottomRight:4,bottomLeft:0}, stack:"tickets" },
                { label:"Cerrados",  data:dataCerrados,  backgroundColor:"#f97316", borderRadius:{topLeft:0,topRight:4,bottomRight:4,bottomLeft:0}, stack:"tickets" },
                { label:"Activos",   data:dataActivos,   backgroundColor:"#3b82f6", borderRadius:{topLeft:0,topRight:4,bottomRight:4,bottomLeft:0}, stack:"tickets" }
            ]
        },
        options: {
            indexAxis:"y", responsive:true, animation:{ duration:500 },
            interaction:{ mode:"index" },
            onClick: (evt, elements) => {
                if (elements.length === 0) return;
                const idx = elements[0].index;
                const sup = supervisores[idx];
                seleccionarSupervisor(sup);
            },
            plugins: { legend: { display:false } },
            scales: {
                x: { stacked:true, grid:{color:"#f3f4f6"} },
                y: { stacked:true, grid:{display:false} }
            }
        }
    });
    dibujarGraficaDias(tickets);
}

function dibujarGraficaDias(tickets) {
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const activos = tickets.filter(t => t.status === "Activo");
    const diasPorSup = {};
    activos.forEach(t => {
        const dias = Math.floor((hoy - new Date(t.fecha)) / 86400000);
        diasPorSup[t.supervisor] = (diasPorSup[t.supervisor] || 0) + Math.max(0, dias);
    });
    const supervisores = Object.keys(diasPorSup).sort((a,b) => diasPorSup[b]-diasPorSup[a]);
    const dataDias = supervisores.map(s => diasPorSup[s]);
    const ancho = Math.max(500, supervisores.length * 60);
    const canvas = document.getElementById("graficaDias");
    canvas.width = ancho; canvas.height = 320;
    if (chartDias) chartDias.destroy();
    chartDias = new Chart(canvas.getContext("2d"), {
        type:"bar",
        data:{ labels:supervisores, datasets:[{
            label:"Días acumulados", data:dataDias,
            backgroundColor: supervisores.map((_,i) => {
                const max = dataDias[0]||1; const p = dataDias[i]/max;
                if(p>0.66) return "#ef4444"; if(p>0.33) return "#f59e0b"; return "#10b981";
            }),
            borderRadius:6
        }]},
        options:{ responsive:false, animation:{duration:500}, plugins:{ legend:{display:false} } }
    });
}

function dibujarGraficaEstado() {
    const labels = DATOS_TICKETS.activos_por_estado.labels;
    const data   = DATOS_TICKETS.activos_por_estado.data;
    if (!labels || labels.length === 0) return;
    const ancho  = Math.max(500, labels.length * 60);
    const canvas = document.getElementById("graficaEstado");
    canvas.width = ancho; canvas.height = 320;
    const maxVal = Math.max(...data) || 1;
    const colores = data.map(v => {
        const p = v / maxVal;
        if (p > 0.75) return "#1d4ed8"; if (p > 0.5) return "#3b82f6"; if (p > 0.25) return "#60a5fa"; return "#93c5fd";
    });
    if (chartEstado) chartEstado.destroy();
    chartEstado = new Chart(canvas.getContext("2d"), {
        type: "bar",
        data: { labels, datasets:[{ label: "Tickets activos", data, backgroundColor: colores, borderRadius: 6 }]},
        options: { responsive: false, animation:{ duration:500 }, plugins:{ legend:{ display:false } } }
    });
}

function seleccionarSupervisor(sup) {
    supervisorSeleccionado = sup; paginaActual = 1;
    document.getElementById("supervisorBanner").classList.add("visible");
    document.getElementById("bannerNombre").textContent = sup;
    const conteo = todosLosTickets.filter(t => t.supervisor === sup).length;
    document.getElementById("bannerConteo").textContent = `${conteo} tickets en total`;
    document.getElementById("tituloTablaTickets").scrollIntoView({ behavior:"smooth", block:"start" });
    renderTabla();
}

function limpiarSupervisor() {
    supervisorSeleccionado = null; paginaActual = 1;
    document.getElementById("supervisorBanner").classList.remove("visible");
    renderTabla();
}

function setStatusFiltro(val, btn) {
    statusFiltro = val; paginaActual = 1;
    document.querySelectorAll(".status-pill").forEach(b => b.classList.remove("active"));
    btn.classList.add("active"); renderTabla();
}

function sortTabla(col) {
    if (sortCol === col) sortDir *= -1; else { sortCol = col; sortDir = 1; }
    document.querySelectorAll(".sort-icon").forEach(el => el.textContent = "↕");
    const icon = document.getElementById("si-" + col);
    if (icon) icon.textContent = sortDir === 1 ? "↑" : "↓";
    renderTabla();
}

function renderTabla() {
    const busqueda = (document.getElementById("searchTabla").value || "").toLowerCase();
    let filtrados = todosLosTickets.filter(t => {
        if (supervisorSeleccionado && t.supervisor !== supervisorSeleccionado) return false;
        if (statusFiltro !== "todos" && t.status !== statusFiltro) return false;
        if (busqueda) {
            const haystack = [t.supervisor, t.tickets_sharp, t.tickets_isste, t.fecha, t.status, t.ciudad, t.inmueble, t.descripcion].join(" ").toLowerCase();
            if (!haystack.includes(busqueda)) return false;
        }
        return true;
    });

    filtrados.sort((a, b) => {
        const va = (a[sortCol] || "").toString().toLowerCase();
        const vb = (b[sortCol] || "").toString().toLowerCase();
        if (va < vb) return -1 * sortDir; if (va > vb) return  1 * sortDir; return 0;
    });

    document.getElementById("badgeTabla").textContent = `${filtrados.length.toLocaleString()} tickets`;
    const totalPags = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
    if (paginaActual > totalPags) paginaActual = totalPags;
    const inicio = (paginaActual - 1) * POR_PAGINA;
    const pagina = filtrados.slice(inicio, inicio + POR_PAGINA);
    const tbody = document.getElementById("tbodyTickets");
    tbody.innerHTML = "";

    if (pagina.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:#9ca3af;">Sin resultados</td></tr>`;
    } else {
        pagina.forEach(t => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>${t.supervisor || "—"}</strong></td>
                <td class="mono">${t.tickets_sharp || "—"}</td>
                <td class="mono">${t.tickets_isste || "—"}</td>
                <td class="mono">${t.fecha || "—"}</td>
                <td><span class="badge ${t.status}">${t.status || "—"}</span></td>
                <td>${t.ciudad || "—"}</td>
                <td>${t.inmueble || "—"}</td>
                <td class="desc" title="${(t.descripcion||"").replace(/"/g,"&quot;")}">${t.descripcion || "—"}</td>`;
            tbody.appendChild(tr);
        });
    }

    document.getElementById("pagInfo").textContent = `Mostrando ${Math.min(inicio+1, filtrados.length)}–${Math.min(inicio+POR_PAGINA, filtrados.length)} de ${filtrados.length.toLocaleString()}`;
    const pagBtns = document.getElementById("pagBtns");
    pagBtns.innerHTML = "";
    
    const btnAnt = document.createElement("button");
    btnAnt.className = "pag-btn"; btnAnt.textContent = "← Ant";
    btnAnt.disabled = paginaActual <= 1;
    btnAnt.onclick = () => { paginaActual--; renderTabla(); };
    pagBtns.appendChild(btnAnt);
    
    let start = Math.max(1, paginaActual - 2); let end = Math.min(totalPags, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    for (let p = start; p <= end; p++) {
        const btn = document.createElement("button");
        btn.className = "pag-btn" + (p === paginaActual ? " active" : ""); btn.textContent = p;
        btn.onclick = (pg => () => { paginaActual = pg; renderTabla(); })(p);
        pagBtns.appendChild(btn);
    }
    
    const btnSig = document.createElement("button");
    btnSig.className = "pag-btn"; btnSig.textContent = "Sig →";
    btnSig.disabled = paginaActual >= totalPags;
    btnSig.onclick = () => { paginaActual++; renderTabla(); };
    pagBtns.appendChild(btnSig);
}