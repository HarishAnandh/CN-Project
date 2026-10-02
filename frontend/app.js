// Smart Warehouse Drone Fleet - Dashboard & Telemetry Client App

let ws = null;
let drones = [];
let networkStats = {};
let recentPackets = [];
let logs = [];
let activeLogFilter = 'ALL';
let selectedDroneId = null;

// Canvas Animation state
let canvas, ctx;
let interpolatedDrones = {};

document.addEventListener('DOMContentLoaded', () => {
  initLucideIcons();
  setupCanvas();
  connectWebSocket();
});

function initLucideIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// ---------------------------------------------------------
// 1. WebSocket Client Connection & Event Handling
// ---------------------------------------------------------
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  updateWSStatus('CONNECTING', 'amber');

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    updateWSStatus('CONNECTED', 'green');
    console.log('[WS] Connected to adapter bridge server');
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleServerEvent(msg.event, msg.data);
    } catch (err) {
      console.error('[WS] Error parsing message:', err);
    }
  };

  ws.onclose = () => {
    updateWSStatus('DISCONNECTED', 'red');
    console.warn('[WS] Connection closed. Retrying in 2 seconds...');
    setTimeout(connectWebSocket, 2000);
  };

  ws.onerror = (err) => {
    console.error('[WS] Socket error:', err);
  };
}

function updateWSStatus(statusText, colorClass) {
  const textEl = document.getElementById('ws-status-text');
  const dotEl = document.getElementById('ws-dot');
  if (textEl) textEl.textContent = statusText;
  if (dotEl) dotEl.className = `dot ${colorClass}`;
}

function sendWSMessage(type, payload = {}) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, ...payload }));
  } else {
    console.warn('[WS] Cannot send message, WebSocket not connected.');
  }
}

function handleServerEvent(event, data) {
  switch (event) {
    case 'init':
      drones = data.drones || [];
      networkStats = data.stats || {};
      recentPackets = data.recentPackets || [];
      logs = data.logs || [];
      updateUI();
      break;

    case 'telemetry':
      drones = data;
      updateUI();
      break;

    case 'stats':
      networkStats = data;
      renderKPIs();
      updateBackendStatusChip();
      break;

    case 'packet':
      recentPackets.unshift(data);
      if (recentPackets.length > 100) recentPackets.pop();
      renderPacketStream();
      break;

    case 'log':
      logs.unshift(data);
      if (logs.length > 300) logs.pop();
      renderLogs();
      renderMiniLogFeed();
      break;
  }
}

// ---------------------------------------------------------
// 2. UI Updates & Rendering
// ---------------------------------------------------------
function updateUI() {
  renderKPIs();
  renderQuickDroneList();
  renderDroneTable();
  renderPacketStream();
  renderLogs();
  renderMiniLogFeed();
  updateSelectedDroneInspector();
  updateBackendStatusChip();
}

function updateBackendStatusChip() {
  const textEl = document.getElementById('backend-status-text');
  const dotEl = document.getElementById('backend-dot');
  const status = networkStats.backendStatus || 'OFFLINE';
  
  if (textEl) textEl.textContent = status;
  if (dotEl) {
    if (status === 'RUNNING') dotEl.className = 'dot green';
    else if (status === 'STOPPED') dotEl.className = 'dot amber';
    else dotEl.className = 'dot red';
  }

  const fdEl = document.getElementById('spec-fd');
  if (fdEl && networkStats.socketFd) {
    fdEl.textContent = `fd=${networkStats.socketFd}`;
  }
}

function renderKPIs() {
  const total = drones.length;
  const active = drones.filter(d => d.status === 'DELIVERING').length;
  const idle = drones.filter(d => d.status === 'IDLE').length;
  const avgBattery = total > 0 ? Math.round(drones.reduce((acc, d) => acc + d.battery, 0) / total) : 0;

  document.getElementById('kpi-total-drones').textContent = total;
  document.getElementById('kpi-active-drones').textContent = active;
  document.getElementById('kpi-active-sub').textContent = `${active} Delivering / ${idle} Idle`;
  document.getElementById('kpi-total-packets').textContent = networkStats.totalPackets || recentPackets.length;
  document.getElementById('kpi-avg-battery').textContent = `${avgBattery}%`;
  document.getElementById('kpi-ws-clients').textContent = networkStats.connectedClients || 1;
}

function renderQuickDroneList() {
  const container = document.getElementById('drone-quick-list');
  if (!container) return;

  container.innerHTML = drones.map(d => `
    <div class="drone-quick-card" onclick="selectDrone(${d.id})">
      <div class="drone-info">
        <div class="drone-badge">D${d.id}</div>
        <div>
          <strong>Drone ${d.id}</strong>
          <div class="text-muted" style="font-size:0.75rem;">Pos: (${d.x.toFixed(1)}, ${d.y.toFixed(1)})</div>
        </div>
      </div>
      <div style="text-align:right;">
        <span class="badge badge-${d.status.toLowerCase()}">${d.status}</span>
        <div class="text-muted" style="font-size:0.75rem; margin-top:0.2rem;">Battery: ${d.battery}%</div>
      </div>
    </div>
  `).join('');
}

function renderDroneTable() {
  const tbody = document.getElementById('drone-table-body');
  if (!tbody) return;

  tbody.innerHTML = drones.map(d => `
    <tr>
      <td><strong>Drone ${d.id}</strong></td>
      <td><span class="badge badge-${d.status.toLowerCase()}">${d.status}</span></td>
      <td><code>(${d.x.toFixed(1)}, ${d.y.toFixed(1)})</code></td>
      <td>${d.destination ? `<span style="color:var(--accent-cyan); font-weight:600;">${d.destination}</span>` : '<span class="text-muted">None</span>'}</td>
      <td>
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <div style="width:60px; height:8px; background:#0f172a; border-radius:4px; overflow:hidden; border:1px solid #334155;">
            <div style="width:${d.battery}%; height:100%; background:${d.battery > 50 ? 'var(--accent-green)' : (d.battery > 20 ? 'var(--accent-amber)' : 'var(--accent-red)')};"></div>
          </div>
          <span>${d.battery}%</span>
        </div>
      </td>
      <td><span style="color:var(--accent-green); font-size:0.8rem;"><i data-lucide="wifi"></i> Connected</span></td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="assignSingleDelivery(${d.id})"><i data-lucide="package"></i> Deliver</button>
        <button class="btn btn-sm btn-accent" onclick="selectDrone(${d.id}); switchTab('tab-warehouse');"><i data-lucide="eye"></i> Track</button>
      </td>
    </tr>
  `).join('');

  initLucideIcons();
}

function renderPacketStream() {
  const tbody = document.getElementById('packet-stream-body');
  const countBadge = document.getElementById('packet-count-badge');
  if (countBadge) countBadge.textContent = `${recentPackets.length} Packets Captured`;
  if (!tbody) return;

  if (recentPackets.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-muted" style="text-align:center;">No UDP datagram packets captured yet. Send a packet using the topbar control!</td></tr>`;
    return;
  }

  tbody.innerHTML = recentPackets.slice(0, 30).map(p => `
    <tr>
      <td><code>${p.id}</code></td>
      <td class="text-muted">${p.timestamp}</td>
      <td><code>${p.sourceIp}:${p.sourcePort}</code></td>
      <td><code>${p.destIp}:${p.destPort}</code></td>
      <td><span class="badge badge-network">${p.protocol}</span></td>
      <td>${p.sizeBytes} B</td>
      <td><strong style="color:var(--accent-cyan);">${escapeHtml(p.payload)}</strong></td>
      <td><span class="badge badge-idle">${p.status}</span></td>
    </tr>
  `).join('');
}

function renderLogs() {
  const container = document.getElementById('full-log-terminal');
  if (!container) return;

  const filtered = logs.filter(l => {
    if (activeLogFilter === 'ALL') return true;
    if (activeLogFilter === 'NETWORK') return l.type === 'NETWORK' || l.source === 'UDP_SOCKET';
    if (activeLogFilter === 'SIMULATION') return l.type === 'SIMULATION';
    if (activeLogFilter === 'C_BACKEND') return l.source === 'C_BACKEND';
    if (activeLogFilter === 'ERROR') return l.type === 'ERROR';
    return true;
  });

  container.innerHTML = filtered.map(l => `
    <div class="log-entry">
      <span class="log-time">[${l.timestamp}]</span>
      <span class="log-source ${l.source}">${l.source}</span>
      <span class="log-type ${l.type}">${l.type}:</span>
      <span class="log-msg">${escapeHtml(l.message)}</span>
    </div>
  `).join('');
}

function renderMiniLogFeed() {
  const container = document.getElementById('mini-log-feed');
  if (!container) return;

  container.innerHTML = logs.slice(0, 15).map(l => `
    <div class="log-entry">
      <span class="log-time">${l.timestamp}</span>
      <span class="log-source ${l.source}">${l.source}</span>
      <span class="log-msg">${escapeHtml(l.message)}</span>
    </div>
  `).join('');
}

// ---------------------------------------------------------
// 3. Warehouse 2D Canvas Renderer
// ---------------------------------------------------------
function setupCanvas() {
  canvas = document.getElementById('warehouseCanvas');
  if (!canvas) return;

  ctx = canvas.getContext('2d');

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Check collision with drone positions on canvas
    drones.forEach(d => {
      const pos = mapCoordsToCanvas(d.x, d.y);
      const dist = Math.hypot(clickX - pos.cx, clickY - pos.cy);
      if (dist <= 25) {
        selectDrone(d.id);
      }
    });
  });

  requestAnimationFrame(drawCanvasLoop);
}

function drawCanvasLoop() {
  if (ctx && canvas) {
    drawWarehouseFloor();
  }
  requestAnimationFrame(drawCanvasLoop);
}

function mapCoordsToCanvas(x, y) {
  // Map C drone coordinates (0..100) to Canvas pixels (Width 900, Height 550)
  const padding = 60;
  const width = canvas.width - padding * 2;
  const height = canvas.height - padding * 2;

  const cx = padding + (x / 100) * width;
  const cy = padding + (y / 100) * height;
  return { cx, cy };
}

function drawWarehouseFloor() {
  const w = canvas.width;
  const h = canvas.height;

  // Clear Background
  ctx.fillStyle = '#0b1120';
  ctx.fillRect(0, 0, w, h);

  // Draw Grid Lines
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  const gridSize = 40;
  for (let x = 0; x < w; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // Draw Storage Zones & Warehouse Racks
  drawZone(ctx, 60, 50, 220, 180, 'STORAGE ZONE A', '#1e293b');
  drawZone(ctx, 340, 50, 220, 180, 'STORAGE ZONE B', '#1e293b');
  drawZone(ctx, 60, 280, 220, 180, 'STORAGE ZONE C', '#1e293b');
  drawZone(ctx, 340, 280, 220, 180, 'STORAGE ZONE D', '#1e293b');

  // Charging Station Bay
  drawZone(ctx, 620, 50, 220, 180, 'CHARGING STATION BAY', '#1c3d37');
  
  // Loading Bay
  drawZone(ctx, 620, 280, 220, 180, 'LOADING & DISPATCH BAY', '#281c3d');

  // Control Center Socket Gateway
  drawZone(ctx, 60, 480, 780, 50, 'NETWORK SOCKET GATEWAY (127.0.0.1:8080 - UDP PORT)', '#0f2942');

  // Draw Drones
  drones.forEach(drone => {
    // Interpolate position smoothly
    if (!interpolatedDrones[drone.id]) {
      interpolatedDrones[drone.id] = { x: drone.x, y: drone.y };
    }
    const current = interpolatedDrones[drone.id];
    current.x += (drone.x - current.x) * 0.1;
    current.y += (drone.y - current.y) * 0.1;

    const { cx, cy } = mapCoordsToCanvas(current.x, current.y);

    // Draw Flight Path line if drone is delivering / has target
    if (drone.status === 'DELIVERING' || (drone.targetX && drone.targetX !== drone.x)) {
      const targetPos = mapCoordsToCanvas(drone.targetX || 40, drone.targetY || 40);
      ctx.beginPath();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.moveTo(cx, cy);
      ctx.lineTo(targetPos.cx, targetPos.cy);
      ctx.stroke();
      ctx.setLineDash([]);

      // Waypoint Marker
      ctx.beginPath();
      ctx.arc(targetPos.cx, targetPos.cy, 8, 0, Math.PI * 2);
      ctx.strokeStyle = '#06b6d4';
      ctx.stroke();
    }

    // Drone Outer Glow Pulse
    const isSelected = selectedDroneId === drone.id;
    ctx.beginPath();
    ctx.arc(cx, cy, isSelected ? 24 : 18, 0, Math.PI * 2);
    ctx.fillStyle = getDroneStatusColor(drone.status, 0.2);
    ctx.fill();

    // Drone Main Icon Circle
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fillStyle = getDroneStatusColor(drone.status, 1);
    ctx.fill();
    ctx.strokeStyle = isSelected ? '#ffffff' : '#0f172a';
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.stroke();

    // Label Drone ID
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`D${drone.id}`, cx, cy);

    // Battery bar above drone
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.fillRect(cx - 18, cy - 28, 36, 6);
    ctx.fillStyle = drone.battery > 50 ? '#10b981' : '#f59e0b';
    ctx.fillRect(cx - 17, cy - 27, (drone.battery / 100) * 34, 4);
  });
}

function drawZone(ctx, x, y, width, height, title, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, x + width / 2, y + 16);
}

function getDroneStatusColor(status, opacity = 1) {
  switch (status) {
    case 'DELIVERING': return `rgba(6, 182, 212, ${opacity})`;
    case 'IDLE': return `rgba(16, 185, 129, ${opacity})`;
    case 'CHARGING': return `rgba(245, 158, 11, ${opacity})`;
    case 'OFFLINE': return `rgba(100, 116, 139, ${opacity})`;
    default: return `rgba(59, 130, 246, ${opacity})`;
  }
}

// ---------------------------------------------------------
// 4. Interactive Actions & Handlers
// ---------------------------------------------------------
function switchTab(tabId) {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  const targetTab = document.getElementById(tabId);
  const targetNav = document.querySelector(`[data-tab="${tabId}"]`);

  if (targetTab) targetTab.classList.add('active');
  if (targetNav) targetNav.classList.add('active');
}

function selectDrone(id) {
  selectedDroneId = id;
  updateSelectedDroneInspector();
}

function updateSelectedDroneInspector() {
  const container = document.getElementById('selected-drone-details');
  if (!container) return;

  const d = drones.find(item => item.id === selectedDroneId);
  if (!d) {
    container.innerHTML = `<p class="text-muted">Click on any drone in the warehouse map to view detailed telemetry, coordinates, and flight control.</p>`;
    return;
  }

  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem;">
      <h4>Drone ${d.id}</h4>
      <span class="badge badge-${d.status.toLowerCase()}">${d.status}</span>
    </div>

    <div class="socket-spec-list">
      <div class="spec-row"><span>Position X:</span> <strong>${d.x.toFixed(1)}</strong></div>
      <div class="spec-row"><span>Position Y:</span> <strong>${d.y.toFixed(1)}</strong></div>
      <div class="spec-row"><span>Battery Level:</span> <strong>${d.battery}%</strong></div>
      <div class="spec-row"><span>Destination:</span> <strong>${d.destination || 'Idle'}</strong></div>
      <div class="spec-row"><span>UDP Datagrams Emitted:</span> <strong>12 datagrams</strong></div>
    </div>

    <div style="margin-top:1rem; display:flex; gap:0.5rem;">
      <button class="btn btn-sm btn-primary btn-block" onclick="assignSingleDelivery(${d.id})"><i data-lucide="package"></i> Assign Delivery</button>
      <button class="btn btn-sm btn-secondary btn-block" onclick="simulateMovement()"><i data-lucide="fast-forward"></i> Move</button>
    </div>
  `;

  initLucideIcons();
}

function simulateMovement() {
  sendWSMessage('SIMULATE_MOVEMENT');
}

function viewDrones() {
  sendWSMessage('VIEW_DRONES');
}

function assignSingleDelivery(id) {
  sendWSMessage('ASSIGN_DELIVERY', { droneId: id });
}

function openDeliveryModal() {
  document.getElementById('delivery-modal').classList.add('open');
}

function closeDeliveryModal() {
  document.getElementById('delivery-modal').classList.remove('open');
}

function submitDelivery() {
  const id = parseInt(document.getElementById('modal-drone-select').value);
  assignSingleDelivery(id);
  closeDeliveryModal();
}

function sendPacketPrompt() {
  const msg = prompt("Enter packet message to transmit over UDP socket (Port 8080):", "TELEMETRY_UPDATE_PING");
  if (msg) {
    sendWSMessage('SEND_PACKET', { message: msg });
  }
}

function handlePacketInjection(e) {
  e.preventDefault();
  const msgInput = document.getElementById('packet-msg-input');
  const methodSelect = document.getElementById('packet-method-select');
  const msg = msgInput.value.trim();
  const method = methodSelect.value;

  if (!msg) return;

  if (method === 'C_SOCKET') {
    sendWSMessage('SEND_PACKET', { message: msg });
  } else {
    sendWSMessage('INJECT_UDP_PACKET', { message: msg });
  }

  msgInput.value = '';
}

function restartBackend() {
  if (confirm("Restart C backend process?")) {
    sendWSMessage('RESTART_BACKEND');
  }
}

function filterLogs(category) {
  activeLogFilter = category;
  document.querySelectorAll('.btn-filter').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');
  renderLogs();
}

function clearLogs() {
  logs = [];
  renderLogs();
  renderMiniLogFeed();
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
