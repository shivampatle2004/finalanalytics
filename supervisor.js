/**
 * OneStopAnalytics Active Process Supervisor (High-Resilience & Structured Logs)
 * ===================================================================
 * This script orchestrates, monitors, and automatically restarts
 * OneStopAnalytics microservices upon exit, crash, or freeze (hangs).
 */

const { spawn, exec, execSync } = require('child_process');
const http = require('http');
const path = require('path');

// Colors and Styles
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m'
};


// ── OS Detection ──────────────────────────────────────────────────────────────
const isWindows = process.platform === 'win32';
const pythonExe = (dir) => isWindows
  ? path.join(dir, 'venv', 'Scripts', 'python.exe')
  : path.join(dir, 'venv', 'bin', 'python');

// Services Configuration
const SERVICES = {
  frontend: {
    name: 'Frontend',
    cwd: path.join(__dirname, 'frontend'),
    command: 'npm',
    args: ['run', 'dev'],
    color: colors.cyan,
    healthUrl: 'http://localhost:5173',
    expectedStatus: 200,
    process: null,
    failCount: 0,
    restarting: false
  },
  etl: {
    name: 'ETL-Backend',
    cwd: path.join(__dirname, 'ETL-backend'),
    command: pythonExe(path.join(__dirname, 'ETL-backend')),
    args: ['-m', 'uvicorn', 'app.main:app', '--reload', '--port', '8111', '--reload-dir', 'app'],
    color: colors.green,
    healthUrl: 'http://localhost:8111/etl/health',
    expectedStatus: 200,
    process: null,
    failCount: 0,
    restarting: false
  },
  dw: {
    name: 'DW-Backend',
    cwd: path.join(__dirname, 'dw-backend'),
    command: pythonExe(path.join(__dirname, 'dw-backend')),
    args: ['-m', 'uvicorn', 'app.main:app', '--reload', '--port', '8004', '--reload-dir', 'app'],
    color: colors.magenta,
    healthUrl: 'http://localhost:8004/health',
    expectedStatus: 200,
    process: null,
    failCount: 0,
    restarting: false
  },
  analytics: {
    name: 'Analytics-Backend',
    cwd: path.join(__dirname, 'Analytics-backend'),
    command: pythonExe(path.join(__dirname, 'Analytics-backend')),
    args: ['-m', 'uvicorn', 'main:app', '--reload', '--port', '8010', '--reload-dir', 'routers', '--reload-dir', 'connectors', '--reload-dir', 'services', '--reload-dir', 'utils'],
    color: colors.yellow,
    healthUrl: 'http://localhost:8010/analytics/health',
    expectedStatus: 200,
    process: null,
    failCount: 0,
    restarting: false
  }
};


// ── Global State ─────────────────────────────────────────────────────────────
let isShuttingDown = false;

// De-duplication structures
const lastLoggedLines = {};
let lastStatusMatrix = '';

// Log formatting function (Generic, Space-Saving & Prefix-only Colorful)
function log(serviceName, message, color = colors.reset) {
  // Regex to split bracketed prefix tag from the rest of the message
  const match = message.match(/^(\[[A-Z]+\])\s*(.*)/);
  if (match) {
    const prefix = match[1]; // e.g. [INFO], [SUCCESS], [WARNING], [ERROR]
    const rest = match[2];   // e.g. "API Server active on port 8000"
    console.log(`${color}${prefix}${colors.reset} ${rest}`);
  } else {
    console.log(`${color}${message}${colors.reset}`);
  }
}

// Log Parser to keep the output extremely quiet, clean, and professional
function parseAndFormatLogLine(serviceName, rawLine, serviceColor) {
  const line = rawLine.trim();
  if (!line) return;

  // 1. De-duplicate consecutive identical raw lines to prevent log spam
  if (lastLoggedLines[serviceName] === line) {
    return;
  }
  lastLoggedLines[serviceName] = line;

  // 2. Filter out background health ping requests and internal DB traffic logs to prevent log spam
  if (
    line.includes('/etl/health') || 
    line.includes('/health') || 
    line.includes('/analytics/health') ||
    line.includes('/dw/catalog/') ||
    line.includes('/dw/workspace/') ||
    line.includes('/dw/volumes') ||
    line.includes('/dw/jobs') ||
    line.includes('/dw/sql-history/') ||
    line.includes('GET /dw/')
  ) {
    return;
  }

  // 3. Filter out noisy standard build/watcher logs
  if (
    line.includes('[vite] (client) hmr update') || 
    line.includes('[vite] (client) page reload') ||
    line.includes('Will watch for changes') ||
    line.includes('Started reloader process') ||
    line.includes('Started server process') ||
    line.includes('Waiting for application startup') ||
    line.includes('SLA sweep') ||
    line.includes('SLA rules') ||
    line.includes('MongoDB ping successful') ||
    line.includes('Retrieved 10 items') ||
    line.includes('Loading .env from')
  ) {
    return;
  }

  // 4. Skip background MongoDB/Postgres debug heartbeats
  if (line.includes('DEBUG') && (line.includes('database') || line.includes('config') || line.includes('service') || line.includes('async_jobs'))) {
    return;
  }

  // 5. Important Errors, Criticals, and Tracebacks
  if (
    line.toUpperCase().includes('ERROR') || 
    line.toUpperCase().includes('CRITICAL') || 
    line.includes('Traceback') || 
    line.includes('Exception:') || 
    line.toUpperCase().includes('FAILED')
  ) {
    log(serviceName, `[ERROR] ${line}`, colors.red);
    return;
  }

  // 6. Warnings
  if (
    line.toUpperCase().includes('WARNING') || 
    line.toUpperCase().includes('WARN')
  ) {
    log(serviceName, `[WARNING] ${line}`, colors.yellow);
    return;
  }

  // 7. Action/State Success Indicators
  if (
    line.toUpperCase().includes('SUCCESS') || 
    line.toUpperCase().includes('ESTABLISHED') || 
    line.includes('started.') ||
    line.includes('complete')
  ) {
    log(serviceName, `[SUCCESS] ${line}`, colors.green);
    return;
  }

  // 8. Clean server active/start ports info
  if (line.includes('Uvicorn running on')) {
    const urlMatch = line.match(/http:\/\/[\d\.]+:(\d+)/);
    const port = urlMatch ? urlMatch[1] : '';
    log(serviceName, `[INFO] API Server active on port ${port}`, colors.green);
    return;
  }
  if (line.includes('Local:') && line.includes('http')) {
    log(serviceName, `[INFO] Frontend Dev Server active at http://localhost:5173/`, colors.cyan);
    return;
  }

  // 9. General INFO output logs (with standard info text simplified)
  let displayLine = line;
  if (line.startsWith('INFO:')) {
    displayLine = line.replace(/^INFO:\s+/, '');
  }

  // Skip quiet background HTTP accesses to keep the log clean
  if (displayLine.includes('GET ') || displayLine.includes('POST ') || displayLine.includes('PUT ') || displayLine.includes('DELETE ')) {
    return;
  }

  // Log other meaningful messages
  log(serviceName, `[INFO] ${displayLine}`, serviceColor);
}

// Spawn Service Process
function startService(key) {
  const service = SERVICES[key];
  if (service.restarting) return;

  log(service.name, `[INFO] Launching service ${service.name}...`, colors.bright + service.color);

  // Spawn child process (detached on Linux for process group management)
  service.process = spawn(service.command, service.args, {
    cwd: service.cwd,
    shell: false,
    detached: !isWindows,
    env: { ...process.env, FORCE_COLOR: 'true' }
  });

  log(service.name, `[SUCCESS] Process spawned for ${service.name} (PID ${service.process.pid})`, service.color);

  let stdoutBuffer = '';
  service.process.stdout.on('data', (data) => {
    stdoutBuffer += data.toString();
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop();
    lines.forEach(line => {
      parseAndFormatLogLine(service.name, line, service.color);
    });
  });

  let stderrBuffer = '';
  service.process.stderr.on('data', (data) => {
    stderrBuffer += data.toString();
    const lines = stderrBuffer.split('\n');
    stderrBuffer = lines.pop();
    lines.forEach(line => {
      parseAndFormatLogLine(service.name, line, service.color);
    });
  });

  // Handle crash/exit
  service.process.on('close', (code) => {
    if (service.restarting || isShuttingDown) return;
    log(service.name, `[ERROR] Process for ${service.name} exited unexpectedly with code ${code}`, colors.bright + colors.red);
    restartService(key);
  });

  service.process.on('error', (err) => {
    if (isShuttingDown) return;
    log(service.name, `[ERROR] Process error on ${service.name}: ${err.message}`, colors.bright + colors.red);
  });
}

// Safe Process Tree Kill (cross-platform)
function killProcessTree(pid, callback) {
  log('Supervisor', `[INFO] Terminating process tree for PID ${pid}...`, colors.bright + colors.red);
  if (isWindows) {
    exec(`taskkill /F /T /PID ${pid}`, () => { if (callback) callback(); });
  } else {
    // On Linux: kill the whole process group
    try { process.kill(-pid, 'SIGTERM'); } catch (_) {}
    setTimeout(() => {
      try { process.kill(-pid, 'SIGKILL'); } catch (_) {}
      if (callback) callback();
    }, 1500);
  }
}

// Clean Restart Logic
function restartService(key) {
  const service = SERVICES[key];
  if (service.restarting) return;
  service.restarting = true;
  service.failCount = 0;

  log(service.name, `[WARNING] Initiating clean restart for ${service.name}...`, colors.bright + colors.yellow);

  const cleanStart = () => {
    service.process = null;
    service.restarting = false;
    startService(key);
  };

  if (service.process && service.process.pid) {
    killProcessTree(service.process.pid, cleanStart);
  } else {
    cleanStart();
  }
}

// Health Check Logic
function checkHealth(key) {
  return new Promise((resolve) => {
    const service = SERVICES[key];
    if (service.restarting || !service.process) {
      resolve('RESTARTING');
      return;
    }

    const url = service.healthUrl;
    const req = http.get(url, (res) => {
      res.resume(); // CRITICAL: consume data to release standard HTTP socket pool!
      if (res.statusCode === service.expectedStatus || res.statusCode === 302 || res.statusCode === 401 || res.statusCode === 404) {
        service.failCount = 0;
        resolve('OK');
      } else {
        handleHealthFailure(key, `Status code: ${res.statusCode}`);
        resolve('ERROR');
      }
    });

    req.on('error', (err) => {
      handleHealthFailure(key, `Offline: ${err.message}`);
      resolve('OFFLINE');
    });

    req.on('timeout', () => {
      req.destroy();
      handleHealthFailure(key, 'Timed out');
      resolve('TIMEOUT');
    });

    req.setTimeout(5000);
  });
}

function handleHealthFailure(key, reason) {
  const service = SERVICES[key];
  if (service.restarting) return;

  service.failCount++;
  log('HealthGuard', `[WARNING] ${service.name} failed check [${service.failCount}/3]. Reason: ${reason}`, colors.yellow);

  if (service.failCount >= 3) {
    log('HealthGuard', `[CRITICAL] ${service.name} is offline. Restarting...`, colors.red);
    restartService(key);
  }
}

// ── Pre-startup: Free occupied ports ─────────────────────────────────────────
function freePort(port) {
  return new Promise((resolve) => {
    if (isWindows) {
      exec(`FOR /F "tokens=5" %a IN ('netstat -ano ^| findstr :${port}') DO taskkill /F /PID %a`, () => resolve());
    } else {
      exec(`fuser -k ${port}/tcp 2>/dev/null || lsof -ti :${port} | xargs kill -9 2>/dev/null || true`, () => resolve());
    }
  });
}

async function freePorts() {
  const ports = [8111, 8004, 8010];
  log('Supervisor', `[INFO] Freeing ports ${ports.join(', ')} from stale processes...`, colors.yellow);
  await Promise.all(ports.map(freePort));
  await new Promise(r => setTimeout(r, 800)); // brief settle time
  log('Supervisor', '[INFO] Ports cleared. Launching services...', colors.blue);
}

// ── Bootstrapping: Start all services on startup ──
log('Supervisor', '[INFO] Initializing all microservices...', colors.bright + colors.blue);
freePorts().then(() => {
  Object.keys(SERVICES).forEach(key => startService(key));
});

// Periodic Health Checker Matrix: Runs every 25 seconds (with a 15-second startup warm-up delay)
setTimeout(() => {
  setInterval(async () => {
    const results = {};
    let allOk = true;
    for (const key of Object.keys(SERVICES)) {
      const status = await checkHealth(key);
      results[key] = status;
      if (status !== 'OK') {
        allOk = false;
      }
    }

    // Only log status if some service has failed to prevent log spam
    if (!allOk) {
      const statusMatrix = Object.keys(SERVICES).map(key => {
        const status = results[key];
        const service = SERVICES[key];
        return `${service.name}: ${status}`;
      }).join(' | ');
      
      // De-duplicate: Only print status matrix if it has changed from the last warning check
      if (statusMatrix !== lastStatusMatrix) {
        log('HealthGuard', `[WARNING] Systems Status Matrix: ${statusMatrix}`, colors.yellow);
        lastStatusMatrix = statusMatrix;
      }
    } else {
      lastStatusMatrix = ''; // Clear matrix memory when fully healthy
    }
  }, 25000);
}, 15000); // 15s warm-up delay

// Graceful supervisor shutdown
process.on('SIGINT', () => {
  isShuttingDown = true;
  log('Supervisor', '[INFO] Shutting down supervisor. Terminating child processes...', colors.bright + colors.red);

  const killPromises = Object.keys(SERVICES).map(key => {
    return new Promise((resolve) => {
      const service = SERVICES[key];
      service.restarting = true; // prevent restart loop
      if (service.process && service.process.pid) {
        killProcessTree(service.process.pid, resolve);
      } else {
        resolve();
      }
    });
  });

  Promise.all(killPromises).then(() => {
    log('Supervisor', '[SUCCESS] All child processes terminated safely. Goodbye.', colors.green);
    process.exit(0);
  });
});
