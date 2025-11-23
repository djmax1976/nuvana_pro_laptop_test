#!/usr/bin/env node

/**
 * Stable development server launcher
 * Manages both frontend and backend with proper cleanup
 */

const { spawn } = require('child_process');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const FRONTEND_PORT = 3000;
const BACKEND_PORT = 3001;

let frontendProcess = null;
let backendProcess = null;
let shuttingDown = false;

// Kill processes on specific ports (Windows-compatible)
async function killPort(port) {
  try {
    if (process.platform === 'win32') {
      // Windows: Find and kill process on port
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
      const lines = stdout.split('\n').filter(line => line.includes('LISTENING'));

      for (const line of lines) {
        const match = line.trim().split(/\s+/);
        const pid = match[match.length - 1];
        if (pid && !isNaN(pid)) {
          console.log(`Killing process ${pid} on port ${port}`);
          await execAsync(`taskkill /F /PID ${pid}`).catch(() => {});
        }
      }
    } else {
      // Unix: Use lsof and kill
      await execAsync(`lsof -ti:${port} | xargs kill -9`).catch(() => {});
    }
  } catch (error) {
    // Ignore errors - port might not be in use
  }
}

// Start a process with proper logging
function startProcess(name, command, args, cwd = process.cwd()) {
  console.log(`\n🚀 Starting ${name}...`);

  const proc = spawn(command, args, {
    cwd,
    stdio: 'pipe',
    shell: true,
    env: { ...process.env }
  });

  proc.stdout.on('data', (data) => {
    const output = data.toString();
    console.log(`[${name}] ${output.trim()}`);
  });

  proc.stderr.on('data', (data) => {
    const output = data.toString();
    // Filter out noise
    if (!output.includes('webpack.cache') &&
        !output.includes('DeprecationWarning') &&
        !output.includes('DEP0060')) {
      console.error(`[${name}] ${output.trim()}`);
    }
  });

  proc.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\n❌ ${name} exited with code ${code}`);
      // Auto-restart backend if it crashes unexpectedly
      if (name === 'Backend' && !shuttingDown) {
        console.log(`\n🔄 Restarting ${name} in 2 seconds...`);
        setTimeout(() => {
          if (!shuttingDown) {
            backendProcess = startProcess('Backend', 'npm', ['run', 'dev:backend']);
          }
        }, 2000);
      }
    }
  });

  proc.on('error', (error) => {
    console.error(`\n❌ ${name} error:`, error.message);
  });

  return proc;
}

// Graceful shutdown
async function shutdown() {
  shuttingDown = true;
  console.log('\n\n🛑 Shutting down development servers...');

  if (frontendProcess) {
    console.log('Stopping frontend...');
    frontendProcess.kill('SIGTERM');
  }

  if (backendProcess) {
    console.log('Stopping backend...');
    backendProcess.kill('SIGTERM');
  }

  // Give processes time to clean up
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Force kill if still running
  await killPort(FRONTEND_PORT);
  await killPort(BACKEND_PORT);

  console.log('✅ Cleanup complete');
  process.exit(0);
}

// Main startup sequence
async function start() {
  console.log('🔧 Nuvana Pro Development Environment');
  console.log('=====================================\n');

  // Clean up any existing processes
  console.log('Checking for existing processes...');
  await killPort(FRONTEND_PORT);
  await killPort(BACKEND_PORT);

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Start backend
  backendProcess = startProcess(
    'Backend',
    'npm',
    ['run', 'dev:backend']
  );

  // Wait for backend to be ready with health check
  console.log('Waiting for backend to start...');
  let backendReady = false;
  const maxAttempts = 15;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
      const http = require('http');
      await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${BACKEND_PORT}/api/health`, (res) => {
          if (res.statusCode === 200) {
            backendReady = true;
            resolve();
          } else {
            reject();
          }
        });
        req.on('error', reject);
        req.setTimeout(2000, () => reject());
      });

      if (backendReady) {
        console.log('✅ Backend is ready');
        break;
      }
    } catch (error) {
      // Backend not ready yet, continue waiting
      if (i === maxAttempts - 1) {
        console.warn('⚠️  Backend health check timeout, continuing anyway...');
      }
    }
  }

  // Start frontend
  frontendProcess = startProcess(
    'Frontend',
    'npm',
    ['run', 'dev:frontend']
  );

  console.log('\n✅ Development servers starting...');
  console.log(`\n📱 Frontend: http://localhost:${FRONTEND_PORT}`);
  console.log(`⚙️  Backend:  http://localhost:${BACKEND_PORT}`);
  console.log('\nPress Ctrl+C to stop all servers\n');
}

// Handle signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('\n❌ Uncaught exception:', error);
  shutdown();
});

process.on('unhandledRejection', (error) => {
  console.error('\n❌ Unhandled rejection:', error);
  shutdown();
});

// Start the servers
start().catch((error) => {
  console.error('Failed to start:', error);
  shutdown();
});
