/* HydraPet · HYDRAPETAPP — lógica de las 3 pantallas Figma.
   Inicio (4:3) · Estadísticas (21:143) · Calendario (38:261) */
const KEY = "hydrapet_state_v1";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = () => dayKey(new Date());
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtT = (ts) => new Date(ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && typeof s.goalMl === "number" && Array.isArray(s.intakes)) return s;
  } catch {}
  return null;
}
let state = load();
if (!state) { state = seedState(); persist(); }
function seedState() {
  const t = new Date();
  const at = (h, m) => { const d = new Date(t); d.setHours(h, m, 0, 0); return d.getTime(); };
  return {
    goalMl: 2000, userName: "", batt: 82,
    freqMin: 120, rangeStart: "08:00", rangeEnd: "20:00",
    intakes: [
      { id: uid(), ml: 200, ts: at(8, 0), note: "Al despertar" },
      { id: uid(), ml: 200, ts: at(9, 30), note: "" },
      { id: uid(), ml: 160, ts: at(10, 5), note: "" },
      { id: uid(), ml: 200, ts: at(11, 10), note: "" },
      { id: uid(), ml: 200, ts: at(12, 0), note: "" },
    ],
    schedules: [
      { id: uid(), time: "08:00", label: "Al despertar", ml: 200, enabled: true, auto: false },
      { id: uid(), time: "09:00", label: "Media mañana", ml: 200, enabled: true, auto: false },
      { id: uid(), time: "10:00", label: "Antes de salir", ml: 200, enabled: true, auto: false },
      { id: uid(), time: "12:00", label: "Mediodía", ml: 200, enabled: true, auto: false },
    ],
  };
}
function persist() { localStorage.setItem(KEY, JSON.stringify(state)); }
function toast(msg, type = "") {
  const el = document.createElement("div");
  el.className = "toast " + type; el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

/* ---------- navegación ---------- */
function go(tab) {
  $$(".tabbtn").forEach((b) => b.classList.toggle("active", b.dataset.go === tab));
  $$(".tab").forEach((s) => s.classList.toggle("active", s.id === "tab-" + tab));
  $("#drawer").hidden = true;
  $(".scroll").scrollTo({ top: 0 });
  if (tab === "stats") renderStats();
  if (tab === "cal") { renderCal(); renderSchedList(); }
}
$$("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
$("#btnMenu").addEventListener("click", (e) => { e.stopPropagation(); $("#drawer").hidden = !$("#drawer").hidden; });
document.addEventListener("click", (e) => {
  const d = $("#drawer");
  if (!d.hidden && !e.target.closest("#drawer") && !e.target.closest("#btnMenu")) d.hidden = true;
});
$("#btnVerTodos").addEventListener("click", () => go("cal"));
$("#btnProfile").addEventListener("click", () => go("ajustes"));

/* ---------- datos ---------- */
const totalOf = (k) => state.intakes.filter((i) => dayKey(new Date(i.ts)) === k).reduce((a, b) => a + b.ml, 0);
const ofDay = (k) => state.intakes.filter((i) => dayKey(new Date(i.ts)) === k).sort((a, b) => b.ts - a.ts);

function addIntake(ml, ts = Date.now(), note = "") {
  ml = Number(ml);
  if (!ml || ml < 30 || ml > 3000) { toast("Cantidad inválida (30–3000 ml)", "warn"); return false; }
  state.intakes.push({ id: uid(), ml, ts: Number(new Date(ts)), note: String(note || "").slice(0, 60) });
  persist(); renderAll();
  toast(`+${ml} ml registrados 💧`, "ok");
  return true;
}
function reminderStatus(s) {
  const [h, m] = s.time.split(":").map(Number);
  const now = new Date();
  const sched = new Date(now); sched.setHours(h, m, 0, 0);
  const match = state.intakes.some((i) => {
    const d = new Date(i.ts);
    return dayKey(d) === todayKey() && d >= new Date(sched.getTime() - 15 * 60000) && d <= new Date(sched.getTime() + 60 * 60000);
  });
  if (match) return "ok";
  if (now > new Date(sched.getTime() + 60 * 60000)) return "late";
  return "soon";
}
const ST_TXT = { ok: ["Tomado a tiempo", "✓"], late: ["Tomado tarde", "◷"], soon: ["A tiempo", "◷"] };

function setRing(el, pct) {
  const C = 2 * Math.PI * 82;
  el.style.strokeDasharray = C;
  el.style.strokeDashoffset = C - (C * Math.min(100, pct)) / 100;
}

/* ---------- render ---------- */
let chartRange = "semana";
function renderAll() { renderHome(); renderStats(); renderCal(); renderSchedList(); renderSettings(); }

function renderHome() {
  const total = totalOf(todayKey());
  const pct = Math.round((total / state.goalMl) * 100);
  setRing($("#ringFill"), pct);
  $("#ringFill").style.stroke = pct >= 100 ? "#22ca6a" : "#1f8ae0";
  $("#pctBig").textContent = Math.min(999, pct) + "%";
  $("#todayMl").textContent = total + " ml";
  $("#goalMlHero").textContent = state.goalMl;
  $("#goalBig").textContent = state.goalMl + " ml";
  $("#deviceState").textContent = "conectado";
  $("#battPct").textContent = state.batt + "%";

  const list = [...state.schedules].filter((s) => s.enabled).sort((a, b) => a.time.localeCompare(b.time));
  $("#remList").innerHTML = list.length ? list.map((s) => {
    const st = reminderStatus(s);
    const [txt, ico] = ST_TXT[st];
    const hr = s.time.replace(/^0/, "").slice(0, 5);
    return `<li data-take="${s.id}" title="${esc(s.label)}"><span class="hour">${hr}</span><span class="sep"></span>
      <span class="st ${st}">${ico}</span>
      <span class="rt"><strong>${txt}</strong><small>${s.ml || 200} ml</small></span>
      <span class="chev">›</span></li>`;
  }).join("") : `<li><span class="rt"><strong>Sin recordatorios hoy</strong><small>Crea horarios en Calendario</small></span></li>`;
}

function renderStats() {
  const total = totalOf(todayKey());
  const pct = Math.round((total / state.goalMl) * 100);
  setRing($("#ringFill2"), pct);
  $("#ringFill2").style.stroke = pct >= 100 ? "#22ca6a" : "#1f8ae0";
  $("#pctBig2").textContent = Math.min(999, pct) + "%";
  $("#todayMl2").textContent = total + " ml";
  $("#goalMlHero2").textContent = state.goalMl;
  $("#goalBig2").textContent = state.goalMl + " ml";
  $("#consumedToday").textContent = total + " ml";
  $("#goalSlider").value = state.goalMl;
  $("#sliderVal").textContent = state.goalMl + " ml";
  renderChart();
  // KPIs
  const sch = state.schedules.filter((s) => s.enabled);
  const done = sch.filter((s) => reminderStatus(s) === "ok").length;
  $("#kpiDone").textContent = sch.length ? Math.round((done / sch.length) * 100) + "%" : "—";
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = dayKey(d);
    if (totalOf(k) >= state.goalMl) streak++;
    else if (i === 0 && totalOf(k) === 0 && new Date().getHours() < 20) continue;
    else break;
  }
  $("#kpiStreak").textContent = streak + (streak === 1 ? " día" : " días");
}

function renderChart() {
  const box = $("#chart"), axis = $("#chartAxis");
  if (chartRange === "dia") {
    const [sh] = state.rangeStart.split(":").map(Number);
    const [eh] = state.rangeEnd.split(":").map(Number);
    let rows = "";
    for (let h = eh; h >= sh; h--) {
      const items = state.intakes.filter((i) => {
        const d = new Date(i.ts);
        return dayKey(d) === todayKey() && d.getHours() === h;
      });
      const ml = items.reduce((a, b) => a + b.ml, 0);
      const pct = Math.min(100, Math.round((ml / state.goalMl) * 100));
      const ampm = h >= 12 ? "pm" : "am";
      const h12 = ((h + 11) % 12) + 1;
      rows += `<div class="hbar ${ml >= 200 ? "done" : ""}"><span>${h12}:00 ${ampm}</span>
        <span class="tr"><span class="fl" style="display:block;width:${pct}%"></span></span><span>${ml} ml</span></div>`;
    }
    box.innerHTML = rows;
    axis.innerHTML = `<span>0</span><span>${state.goalMl / 2} ml</span><span>${state.goalMl} ml</span>`;
  } else if (chartRange === "semana") {
    const days = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
    const max = Math.max(state.goalMl, ...days.map((d) => totalOf(dayKey(d))), 1);
    box.innerHTML = `<div class="vbars">` + days.map((d) => {
      const t = totalOf(dayKey(d));
      const h = Math.max(5, Math.round((t / max) * 130));
      const wd = d.toLocaleDateString("es-MX", { weekday: "short" });
      return `<div class="vbar ${t >= state.goalMl ? "met" : ""}"><div class="col" style="height:${h}px"></div><span>${wd}</span><strong>${t}</strong></div>`;
    }).join("") + `</div>`;
    axis.innerHTML = `<span>Últimos 7 días · meta ${state.goalMl} ml</span>`;
  } else {
    const days = [];
    for (let i = 29; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
    const max = Math.max(state.goalMl, ...days.map((d) => totalOf(dayKey(d))), 1);
    box.innerHTML = `<div class="vbars">` + days.map((d) => {
      const t = totalOf(dayKey(d));
      const h = Math.max(3, Math.round((t / max) * 130));
      return `<div class="vbar ${t >= state.goalMl ? "met" : ""}" title="${d.toLocaleDateString("es-MX")} · ${t} ml"><div class="col" style="height:${h}px"></div><span>${d.getDate()}</span></div>`;
    }).join("") + `</div>`;
    axis.innerHTML = `<span>Últimos 30 días · meta ${state.goalMl} ml</span>`;
  }
}
$$(".seg").forEach((b) => b.addEventListener("click", () => {
  $$(".seg").forEach((x) => x.classList.remove("active"));
  b.classList.add("active");
  chartRange = b.dataset.range;
  renderStats();
}));

/* ---------- calendario (38:261) ---------- */
let calCursor = new Date(); calCursor.setDate(1);
let selDay = todayKey();
function renderCal() {
  $("#calTitle").textContent = calCursor.toLocaleDateString("es-MX", { month: "long" }).replace(/^\w/, (c) => c.toUpperCase());
  $("#activeRange").textContent = `De ${state.rangeStart.slice(0, 5)} a ${state.rangeEnd.slice(0, 5)}`;
  const y = calCursor.getFullYear(), m = calCursor.getMonth();
  const first = (new Date(y, m, 1).getDay() + 6) % 7;
  const n = new Date(y, m + 1, 0).getDate();
  const nowK = todayKey();
  let html = "";
  for (let i = 0; i < first; i++) html += `<span class="empty"></span>`;
  for (let d = 1; d <= n; d++) {
    const k = `${y}-${pad(m + 1)}-${pad(d)}`;
    const t = totalOf(k);
    const past = k < nowK, isToday = k === nowK;
    let cls = "", ico = "";
    if (t >= state.goalMl) { cls = "done"; ico = '<img src="assets/gota-dia.png?v=8" alt="" />'; }
    else if (t > 0) { cls = "prog"; ico = '<img src="assets/leyenda-continuar.png?v=8" alt="" />'; }
    else if (past && !isToday) { cls = "missed"; ico = '<i class="miss-dot"></i>'; }
    if (isToday) cls += " today";
    if (k === selDay) cls += " sel";
    html += `<button class="day ${cls}" data-day="${k}">${d}<i>${ico}</i></button>`;
  }
  $("#calGrid").innerHTML = html;
  const items = ofDay(selDay);
  const t = items.reduce((a, b) => a + b.ml, 0);
  const d = new Date(selDay + "T12:00:00");
  $("#dayTitle").textContent = d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  $("#daySub").textContent = `${t} ml de ${state.goalMl} ml · ${items.length} tomas`;
  $("#dayList").innerHTML = items.length ? items.map((i) =>
    `<li><span class="hour">+${i.ml}</span><span class="sep"></span>
     <span class="rt"><strong>${fmtT(i.ts)}</strong><small>${esc(i.note || "Sin nota")}</small></span>
     <span><button class="iconbtn" data-edit="${i.id}" title="Editar">✎</button>
     <button class="iconbtn" data-del="${i.id}" title="Eliminar">🗑</button></span></li>`).join("")
    : `<li><span class="rt"><strong>Sin tomas este día</strong><small>Registra desde Inicio (＋)</small></span></li>`;
}
$("#calPrev").addEventListener("click", () => { calCursor.setMonth(calCursor.getMonth() - 1); renderCal(); });
$("#calNext").addEventListener("click", () => { calCursor.setMonth(calCursor.getMonth() + 1); renderCal(); });

/* frecuencia + rango → regenera horarios automáticos */
const FREQ_TXT = { 30: "Cada 30 min", 60: "Cada 1 hora", 120: "Cada 2 horas", 300: "Cada 5 horas" };
$("#freqSelect").addEventListener("click", () => { $("#freqMenu").hidden = !$("#freqMenu").hidden; });
$$('input[name="freq"]').forEach((r) => r.addEventListener("change", () => {
  state.freqMin = Number(r.value);
  $("#freqSelect").textContent = FREQ_TXT[state.freqMin] + " ▾";
  $("#freqMenu").hidden = true;
  regenAuto(); persist(); renderAll();
  toast(`Frecuencia: ${FREQ_TXT[state.freqMin]}`, "ok");
}));
function regenAuto() {
  const [sh, sm] = state.rangeStart.split(":").map(Number);
  const [eh, em] = state.rangeEnd.split(":").map(Number);
  let cur = sh * 60 + sm, end = eh * 60 + em;
  const keep = state.schedules.filter((s) => !s.auto);
  const gen = [];
  while (cur <= end) {
    const t = `${pad(Math.floor(cur / 60))}:${pad(cur % 60)}`;
    if (!keep.some((s) => s.time === t)) gen.push({ id: uid(), time: t, label: "Recordatorio", ml: 200, enabled: true, auto: true });
    cur += state.freqMin;
  }
  state.schedules = [...keep, ...gen].sort((a, b) => a.time.localeCompare(b.time));
}
$("#btnEditRange").addEventListener("click", () => { $("#formRange").hidden = !$("#formRange").hidden; });
$("#formRange").addEventListener("submit", (e) => {
  e.preventDefault();
  state.rangeStart = $("#rangeStart").value || "08:00";
  state.rangeEnd = $("#rangeEnd").value || "20:00";
  $("#formRange").hidden = true;
  regenAuto(); persist(); renderAll();
  toast(`Horario activo de ${state.rangeStart.slice(0, 5)} a ${state.rangeEnd.slice(0, 5)}`, "ok");
});

/* horarios manuales */
$("#formSched").addEventListener("submit", (e) => {
  e.preventDefault();
  const time = $("#schedTime").value, label = $("#schedLabel").value.trim();
  if (!time || !label) return;
  state.schedules.push({ id: uid(), time, label, ml: 200, enabled: true, auto: false });
  $("#schedLabel").value = "";
  persist(); renderAll(); toast("Horario guardado ⏰", "ok");
});
$("#btnSeedSched").addEventListener("click", () => {
  [["08:00", "Al despertar"], ["13:00", "Después de comer"], ["18:00", "Antes de entrenar"], ["21:00", "Antes de dormir"]]
    .forEach(([time, label]) => {
      if (!state.schedules.some((s) => s.time === time))
        state.schedules.push({ id: uid(), time, label, ml: 200, enabled: true, auto: false });
    });
  persist(); renderAll(); toast("Horarios de ejemplo cargados", "ok");
});
function renderSchedList() {
  const list = [...state.schedules].sort((a, b) => a.time.localeCompare(b.time));
  $("#schedList").innerHTML = list.length ? list.map((s) =>
    `<li><span class="hour">${s.time.slice(0, 5)}</span><span class="sep"></span>
     <span class="rt"><strong>${esc(s.label)}</strong><small>${s.ml || 200} ml · ${s.enabled ? "Activo" : "Pausado"}${s.auto ? " · auto" : ""}</small></span>
     <button class="iconbtn" data-tog="${s.id}" title="Activar/pausar">${s.enabled ? "✓" : "○"}</button>
     <button class="iconbtn" data-sdel="${s.id}" title="Eliminar">🗑</button></li>`).join("")
    : `<li><span class="rt"><strong>Sin horarios</strong><small>Agrega uno arriba o cambia la frecuencia</small></span></li>`;
}

/* clicks globales: tomar / editar / borrar / toggle */
document.addEventListener("click", (e) => {
  const take = e.target.closest("[data-take]");
  if (take) {
    const s = state.schedules.find((x) => x.id === take.dataset.take);
    if (!s || !s.enabled) return;
    if (reminderStatus(s) === "ok") { toast("Ya registrado para este horario 💧"); return; }
    addIntake(s.ml || 200, Date.now(), s.label);
    return;
  }
  const del = e.target.closest("[data-del]");
  if (del) {
    state.intakes = state.intakes.filter((x) => x.id !== del.dataset.del);
    persist(); renderAll(); toast("Toma eliminada"); return;
  }
  const ed = e.target.closest("[data-edit]");
  if (ed) {
    const it = state.intakes.find((x) => x.id === ed.dataset.edit);
    if (!it) return;
    $("#intakeId").value = it.id; $("#intakeMl").value = it.ml;
    $("#intakeTs").value = toLocal(new Date(it.ts)); $("#intakeNote").value = it.note || "";
    $("#intakeTitle").textContent = "Editar toma ✎";
    $("#ovIntake").hidden = false; return;
  }
  const day = e.target.closest("[data-day]");
  if (day) { selDay = day.dataset.day; renderCal(); return; }
  const tog = e.target.closest("[data-toggle],[data-tog]");
  if (tog) {
    const id = tog.dataset.tog || tog.dataset.toggle;
    const s = state.schedules.find((x) => x.id === id);
    if (s) { s.enabled = !s.enabled; persist(); renderAll(); }
    return;
  }
  const sdel = e.target.closest("[data-sdel]");
  if (sdel) {
    state.schedules = state.schedules.filter((x) => x.id !== sdel.dataset.sdel);
    persist(); renderAll(); toast("Horario eliminado");
  }
});

/* ---------- modales ---------- */
const toLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
function openIntake() {
  $("#intakeId").value = ""; $("#intakeTitle").textContent = "Nueva toma 🥤";
  $("#intakeMl").value = 250; $("#intakeTs").value = toLocal(new Date()); $("#intakeNote").value = "";
  $("#ovIntake").hidden = false;
}
$("#btnOpenIntake").addEventListener("click", openIntake);
$("#fabAdd").addEventListener("click", openIntake);
$("#btnCloseIntake").addEventListener("click", () => { $("#ovIntake").hidden = true; });
$$("#formIntake [data-preset]").forEach((b) => b.addEventListener("click", () => { $("#intakeMl").value = b.dataset.preset; }));
$("#formIntake").addEventListener("submit", (e) => {
  e.preventDefault();
  const id = $("#intakeId").value, ml = Number($("#intakeMl").value);
  const ts = new Date($("#intakeTs").value).getTime(), note = $("#intakeNote").value.trim();
  if (isNaN(ts)) { toast("Fecha inválida", "warn"); return; }
  if (id) {
    const it = state.intakes.find((x) => x.id === id);
    if (it) Object.assign(it, { ml, ts, note });
    $("#ovIntake").hidden = true; persist(); renderAll(); toast("Toma actualizada ✎", "ok");
  } else { $("#ovIntake").hidden = true; addIntake(ml, ts, note); }
});
$$("[data-quick]").forEach((b) => b.addEventListener("click", () => addIntake(Number(b.dataset.quick))));

function openGoal() { $("#goalModalInput").value = state.goalMl; $("#ovGoal").hidden = false; }
$("#btnEditGoal").addEventListener("click", openGoal);
$("#btnCloseGoal").addEventListener("click", () => { $("#ovGoal").hidden = true; });
$("#formGoal").addEventListener("submit", (e) => {
  e.preventDefault();
  const n = Number($("#goalModalInput").value);
  if (!n || n < 500 || n > 6000) { toast("Meta inválida (500–6000 ml)", "warn"); return; }
  state.goalMl = Math.round(n);
  $("#goalSlider").value = state.goalMl;
  $("#ovGoal").hidden = true; persist(); renderAll();
  toast(`Meta: ${state.goalMl} ml 🎯`, "ok");
});
$("#goalSlider").addEventListener("change", () => {
  state.goalMl = Number($("#goalSlider").value);
  persist(); renderAll(); toast(`Meta: ${state.goalMl} ml 🎯`, "ok");
});

/* ---------- ajustes ---------- */
function renderSettings() {
  if (document.activeElement !== $("#userName")) $("#userName").value = state.userName || "";
  if (document.activeElement !== $("#goalInput")) $("#goalInput").value = state.goalMl;
}
$("#btnSaveSettings").addEventListener("click", () => {
  state.userName = $("#userName").value.trim().slice(0, 30);
  const n = Number($("#goalInput").value);
  if (n && n >= 500 && n <= 6000) state.goalMl = Math.round(n);
  if ($("#notifToggle").checked && "Notification" in window && Notification.permission === "default") {
    try { Notification.requestPermission(); } catch {}
  }
  persist(); renderAll(); toast("Ajustes guardados ✅", "ok");
});
$("#btnExport").addEventListener("click", () => {
  const rows = [["fecha", "hora", "ml", "nota"]];
  [...state.intakes].sort((a, b) => a.ts - b.ts).forEach((i) => {
    rows.push([dayKey(new Date(i.ts)), fmtT(i.ts), i.ml, `"${(i.note || "").replace(/"/g, "'")}"`]);
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" }));
  a.download = "hydrapet_registro.csv"; a.click();
  toast("CSV exportado 📊", "ok");
});
$("#btnSeedDemo").addEventListener("click", () => {
  const fresh = seedState(); state.intakes = fresh.intakes; state.schedules = fresh.schedules;
  persist(); renderAll(); toast("Datos de ejemplo cargados ✨", "ok");
});
$("#btnWipe").addEventListener("click", () => {
  if (!confirm("¿Borrar todos tus datos?")) return;
  state.intakes = []; state.schedules = [];
  persist(); renderAll(); toast("Datos borrados");
});

/* ---------- llavero ---------- */
function syncDevice() {
  $("#deviceState").textContent = "sincronizando…";
  setTimeout(() => {
    state.batt = Math.max(5, state.batt - 1); persist();
    $("#deviceState").textContent = "conectado";
    $("#battPct").textContent = state.batt + "%";
    renderHome(); toast("Llavero sincronizado ✅", "ok");
  }, 800);
}
$("#deviceCard").addEventListener("click", syncDevice);
$("#btnSync").addEventListener("click", syncDevice);
$("#btnDeviceAdd").addEventListener("click", () => addIntake(250, Date.now(), "Botón del llavero"));

/* aviso de horarios */
const fired = new Set();
setInterval(() => {
  const now = new Date();
  const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const hit = state.schedules.find((s) => s.enabled && s.time === hhmm);
  if (hit) {
    const k = hhmm + "|" + todayKey() + "|" + hit.id;
    if (!fired.has(k)) {
      fired.add(k);
      toast(`⏰ ${hit.time} · ${hit.label}: toma agua 💧`, "ok");
      if ("Notification" in window && Notification.permission === "granted" && $("#notifToggle").checked)
        try { new Notification("HydraPet ⏰", { body: `${hit.label}: toma un vaso de agua 💧` }); } catch {}
    }
  }
}, 30000);

/* init */
$("#rangeStart").value = state.rangeStart;
$("#rangeEnd").value = state.rangeEnd;
$("#freqSelect").textContent = (FREQ_TXT[state.freqMin] || "Cada 2 horas") + " ▾";
const fr = document.querySelector(`input[name="freq"][value="${state.freqMin}"]`);
if (fr) fr.checked = true;
if ($("#notifToggle") && "Notification" in window && Notification.permission === "denied") $("#notifToggle").checked = false;
renderAll();
