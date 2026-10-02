const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const dgram = require('dgram');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const UDP_PORT = 8080;
const BACKEND_DIR = path.join(__dirname, '../backend');
const BINARY_PATH = path.join(BACKEND_DIR, 'drone_fleet');

// Initial State
let drones = [
  { id: 1, x: 10.0, y: 20.0, battery: 100, status: 'IDLE', destination: null, targetX: 10.0, targetY: 20.0 },
  { id: 2, x: 20.0, y: 25.0, battery: 100, status: 'IDLE', destination: null, targetX: 20.0, targetY: 25.0 },
  { id: 3, x: 30.0, y: 30.0, battery: 100, status: 'IDLE', destination: null, targetX: 30.0, targetY: 30.0 }
];

let networkStats = {
  totalPackets: 0,
  successfulPackets: 0,
  failedPackets: 0,
  connectedClients: 0,
  serverStatus: 'OFFLINE',
  backendStatus: 'STOPPED',
  udpPort: UDP_PORT,
  protocol: 'UDP (SOCK_DGRAM)',
  socketFd: -1,
  startTime: Date.now()
};

let recentPackets = [];
let logs = [];

function addLog(source, type, message) {
  const logEntry = {
    id: Date.now() + Math.random().toString(36).substring(2, 6),
    timestamp: new Date().toLocaleTimeString(),
    fullTimestamp: new Date().toISOString(),
    source, // 'C_BACKEND', 'UDP_SOCKET', 'BRIDGE', 'UI'
    type,   // 'INFO', 'NETWORK', 'SIMULATION', 'DRONE', 'ERROR'
    message
  };
  logs.unshift(logEntry);
  if (logs.length > 200) logs.pop();
  broadcast('log', logEntry);
  return logEntry;
}

// ---------------------------------------------------------
// 1. C Subprocess Controller
// ---------------------------------------------------------
let cProcess = null;

function ensureBinaryExists() {
  if (!fs.existsSync(BINARY_PATH)) {
    addLog('BRIDGE', 'INFO', 'Compiling C backend via Makefile...');
    try {
      execSync('make -C ' + BACKEND_DIR);
      addLog('BRIDGE', 'INFO', 'C backend compiled successfully.');
    } catch (err) {
      addLog('BRIDGE', 'ERROR', `Failed to compile C backend: ${err.message}`);
    }
  }
}

function startCBackend() {
  ensureBinaryExists();

  if (cProcess) {
    try { cProcess.kill(); } catch (e) { }
  }

  addLog('BRIDGE', 'INFO', `Spawning C backend subprocess (${BINARY_PATH})...`);

  cProcess = spawn(BINARY_PATH, [], {
    cwd: BACKEND_DIR,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  networkStats.backendStatus = 'RUNNING';

  cProcess.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    parseCOutput(text);
  });

  cProcess.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) {
      addLog('C_BACKEND', 'ERROR', text);
      if (text.includes('Message sending failed')) {
        networkStats.failedPackets++;
        broadcast('stats', networkStats);
      }
    }
  });

  cProcess.on('close', (code) => {
    networkStats.backendStatus = 'STOPPED';
    addLog('BRIDGE', 'WARNING', `C backend process exited with code ${code}`);
    broadcast('stats', networkStats);
  });

  cProcess.on('error', (err) => {
    networkStats.backendStatus = 'ERROR';
    addLog('BRIDGE', 'ERROR', `C backend process error: ${err.message}`);
  });

  // Initial poll after startup
  setTimeout(() => {
    sendCCommand('1');
  }, 500);
}

function sendCCommand(cmd, arg = null) {
  if (!cProcess || !cProcess.stdin.writable) {
    addLog('BRIDGE', 'ERROR', 'C backend stdin is not writable');
    return false;
  }
  try {
    cProcess.stdin.write(cmd + '\n');
    if (arg !== null) {
      setTimeout(() => {
        if (cProcess && cProcess.stdin.writable) {
          cProcess.stdin.write(arg + '\n');
        }
      }, 50);
    }
    return true;
  } catch (err) {
    addLog('BRIDGE', 'ERROR', `Failed to write to C backend: ${err.message}`);
    return false;
  }
}

function parseCOutput(text) {
  const lines = text.split('\n');

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Log general backend messages
    if (trimmed.startsWith('[NETWORK]')) {
      addLog('C_BACKEND', 'NETWORK', trimmed);
      if (trimmed.includes('UDP socket created successfully')) {
        networkStats.socketFd = 3; // Standard socket fd after stdin/out/err
      }
      if (trimmed.includes('Packet sent:')) {
        networkStats.successfulPackets++;
        broadcast('stats', networkStats);
      }
    } else if (trimmed.startsWith('[SIMULATION]')) {
      addLog('C_BACKEND', 'SIMULATION', trimmed);
      // Parse drone movement: "[SIMULATION] Drone 1 moved to (15.0, 23.0)"
      const moveMatch = trimmed.match(/Drone (\d+) moved to \(([\d.]+),\s*([\d.]+)\)/);
      if (moveMatch) {
        const id = parseInt(moveMatch[1]);
        const x = parseFloat(moveMatch[2]);
        const y = parseFloat(moveMatch[3]);
        updateDroneState(id, { x, y });
      }
    } else if (trimmed.startsWith('[DELIVERY]')) {
      addLog('C_BACKEND', 'SIMULATION', trimmed);
      const assignMatch = trimmed.match(/Drone (\d+) assigned to delivery/);
      if (assignMatch) {
        const id = parseInt(assignMatch[1]);
        updateDroneState(id, { status: 'DELIVERING', destination: 'Storage Zone B (40, 40)', targetX: 40.0, targetY: 40.0 });
      }
      const reachMatch = trimmed.match(/Drone (\d+) reached delivery location/);
      if (reachMatch) {
        const id = parseInt(reachMatch[1]);
        updateDroneState(id, { status: 'IDLE', destination: null });
      }
    } else if (trimmed.startsWith('D') && trimmed.includes('%')) {
      // Parse drone table line: "D1     ( 15.0, 23.0) 95       % IDLE"
      const tableMatch = trimmed.match(/D(\d+)\s+\(\s*([\d.]+),\s*([\d.]+)\)\s+(\d+)\s*%\s+([A-Z]+)/);
      if (tableMatch) {
        const id = parseInt(tableMatch[1]);
        const x = parseFloat(tableMatch[2]);
        const y = parseFloat(tableMatch[3]);
        const battery = parseInt(tableMatch[4]);
        const status = tableMatch[5];
        updateDroneState(id, { x, y, battery, status });
      }
    } else if (trimmed.includes('Smart Warehouse Drone Fleet started')) {
      addLog('C_BACKEND', 'INFO', trimmed);
    }
  });
}

function updateDroneState(id, partialState) {
  const index = drones.findIndex(d => d.id === id);
  if (index !== -1) {
    drones[index] = { ...drones[index], ...partialState };
    broadcast('telemetry', drones);
  }
}

// ---------------------------------------------------------
// 2. Real UDP Socket Listener on Port 8080
// ---------------------------------------------------------
let udpSocket = dgram.createSocket('udp4');

udpSocket.on('error', (err) => {
  addLog('UDP_SOCKET', 'ERROR', `UDP Socket Error: ${err.message}`);
  networkStats.serverStatus = 'ERROR';
  broadcast('stats', networkStats);
});

udpSocket.on('message', (msg, rinfo) => {
  const payload = msg.toString();
  networkStats.totalPackets++;

  const packetData = {
    id: 'PKT-' + Math.floor(1000 + Math.random() * 9000),
    timestamp: new Date().toLocaleTimeString(),
    fullTimestamp: new Date().toISOString(),
    sourceIp: rinfo.address,
    sourcePort: rinfo.port,
    destIp: '127.0.0.1',
    destPort: UDP_PORT,
    protocol: 'UDP',
    sizeBytes: rinfo.size,
    payload: payload,
    status: 'SUCCESS'
  };

  recentPackets.unshift(packetData);
  if (recentPackets.length > 100) recentPackets.pop();

  addLog('UDP_SOCKET', 'NETWORK', `UDP Datagram received on port ${UDP_PORT} from ${rinfo.address}:${rinfo.port} (${rinfo.size} bytes): "${payload}"`);

  broadcast('packet', packetData);
  broadcast('stats', networkStats);
});

udpSocket.on('listening', () => {
  const address = udpSocket.address();
  networkStats.serverStatus = 'LISTENING';
  addLog('UDP_SOCKET', 'INFO', `UDP Server listening for socket datagrams on ${address.address}:${address.port}`);
  broadcast('stats', networkStats);
});

udpSocket.bind(UDP_PORT, '127.0.0.1');

// ---------------------------------------------------------
// 3. Web & WebSocket Server Setup
// ---------------------------------------------------------
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

function broadcast(event, data) {
  const message = JSON.stringify({ event, data });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

wss.on('connection', (ws) => {
  networkStats.connectedClients = wss.clients.size;
  broadcast('stats', networkStats);

  addLog('BRIDGE', 'INFO', `New frontend WebSocket client connected (${wss.clients.size} total)`);

  // Send initial snapshot
  ws.send(JSON.stringify({ event: 'init', data: { drones, stats: networkStats, recentPackets, logs: logs.slice(0, 50) } }));

  ws.on('message', (message) => {
    try {
      const parsed = JSON.parse(message);
      handleWSCommand(parsed);
    } catch (err) {
      addLog('BRIDGE', 'ERROR', `Invalid WS payload: ${err.message}`);
    }
  });

  ws.on('close', () => {
    networkStats.connectedClients = wss.clients.size;
    broadcast('stats', networkStats);
    addLog('BRIDGE', 'INFO', `WebSocket client disconnected (${wss.clients.size} connected)`);
  });
});

function handleWSCommand(action) {
  switch (action.type) {
    case 'VIEW_DRONES':
      sendCCommand('1');
      break;
    case 'ASSIGN_DELIVERY':
      sendCCommand('2', String(action.droneId || 1));

      // Refresh the complete C-side drone state after delivery.
      setTimeout(() => sendCCommand('1'), 150);
      break;
    case 'SIMULATE_MOVEMENT':
      sendCCommand('3');
      // Trigger status view after movement to refresh telemetry
      setTimeout(() => sendCCommand('1'), 150);
      break;
    case 'SEND_PACKET':
      sendCCommand('4', action.message || 'HEARTBEAT_TELEMETRY_PING');
      break;
    case 'INJECT_UDP_PACKET': {
      // Direct UDP packet injection from UI to port 8080
      const client = dgram.createSocket('udp4');
      const packetMsg = action.message || 'CUSTOM_UDP_INJECTION_PACKET';
      client.send(Buffer.from(packetMsg), UDP_PORT, '127.0.0.1', (err) => {
        if (err) addLog('BRIDGE', 'ERROR', `UDP Packet injection error: ${err.message}`);
        client.close();
      });
      break;
    }
    case 'RESTART_BACKEND':
      startCBackend();
      break;
    default:
      addLog('BRIDGE', 'WARNING', `Unknown WS command type: ${action.type}`);
  }
}

// REST Endpoints
app.get('/api/status', (req, res) => {
  res.json({ drones, stats: networkStats, logs: logs.slice(0, 50) });
});

app.post('/api/drone/move', (req, res) => {
  const success = sendCCommand('3');
  setTimeout(() => sendCCommand('1'), 150);
  res.json({ success });
});

app.post('/api/drone/delivery', (req, res) => {
  const { droneId } = req.body;
  const success = sendCCommand('2', String(droneId || 1));
  res.json({ success });
});

app.post('/api/network/packet', (req, res) => {
  const { message } = req.body;
  const success = sendCCommand('4', message || 'HTTP_REST_TRIGGERED_PACKET');
  res.json({ success });
});

// Start Server & C Backend
server.listen(PORT, () => {
  addLog('BRIDGE', 'INFO', `Smart Warehouse Drone Fleet UI & API Bridge running on http://localhost:${PORT}`);
  startCBackend();
});
