const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const backendDir = path.resolve(__dirname, '..');

// Fix Windows-specific Wrangler registry path warning before spawning server
const appData = process.env.APPDATA || (process.platform === 'win32' 
  ? path.join(os.homedir(), 'AppData', 'Roaming') 
  : path.join(os.homedir(), '.config'));
const registryDir = path.join(appData, 'xdg.config', '.wrangler', 'registry');

try {
  if (!fs.existsSync(registryDir)) {
    fs.mkdirSync(registryDir, { recursive: true });
    console.log(`[Setup] Created Wrangler registry directory: ${registryDir}`);
  }
} catch (err) {
  console.warn('[Setup Warning] Failed to create Wrangler registry directory:', err.message);
}

console.log('Booting Wrangler local worker server...');
const wrangler = spawn('npx', ['wrangler', 'dev', '--port', '8787'], {
  cwd: backendDir,
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe']
});

let isReady = false;
const timeout = setTimeout(() => {
  if (!isReady) {
    console.error('Wrangler dev server startup timed out after 30s.');
    wrangler.kill();
    process.exit(1);
  }
}, 30000);

wrangler.stdout.on('data', (data) => {
  const line = data.toString();
  console.log('[Wrangler]:', line.trim());
  
  if (line.includes('Ready on http://127.0.0.1:8787') || line.includes('Ready on http://localhost:8787')) {
    isReady = true;
    clearTimeout(timeout);
    runTests();
  }
});

wrangler.stderr.on('data', (data) => {
  const line = data.toString();
  console.error('[Wrangler Error]:', line.trim());
});

function runTests() {
  console.log('Starting execution of automated test cases...');
  
  const testSuite = spawn('node', ['--test', 'tests/worker.test.js'], {
    cwd: backendDir,
    shell: true,
    stdio: 'inherit'
  });

  testSuite.on('close', (code) => {
    console.log(`\nTest suite finished execution with exit code: ${code}`);
    console.log('Stopping Wrangler server processes...');
    wrangler.kill();
    process.exit(code);
  });
}
