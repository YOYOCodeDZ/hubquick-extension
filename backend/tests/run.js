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
// Ensure Wrangler has variables bound in Miniflare (Wrangler reads .dev.vars file)
const devVarsPath = path.join(backendDir, '.dev.vars');
let originalDevVars = null;
const hasExistingDevVars = fs.existsSync(devVarsPath);

if (hasExistingDevVars) {
  try {
    originalDevVars = fs.readFileSync(devVarsPath, 'utf8');
    if (!originalDevVars.includes('STRIPE_WEBHOOK_SECRET')) {
      const updated = originalDevVars + '\nSTRIPE_WEBHOOK_SECRET="whsec_b0436f8c697e3202c5071498c95e681a758fa42e6f5526ab3b5b21e74e3c4c04"\n';
      fs.writeFileSync(devVarsPath, updated);
      console.log('[Setup] Appended STRIPE_WEBHOOK_SECRET to existing .dev.vars for testing.');
    } else {
      console.log('[Setup] Existing .dev.vars already contains STRIPE_WEBHOOK_SECRET.');
    }
  } catch (err) {
    console.warn('[Setup Warning] Failed to handle existing .dev.vars:', err.message);
  }
} else {
  try {
    fs.writeFileSync(devVarsPath, 'ENVIRONMENT="development"\nSTRIPE_WEBHOOK_SECRET="whsec_b0436f8c697e3202c5071498c95e681a758fa42e6f5526ab3b5b21e74e3c4c04"\n');
    console.log('[Setup] Created temporary .dev.vars for CI testing.');
  } catch (err) {
    console.warn('[Setup Warning] Failed to create temporary .dev.vars:', err.message);
  }
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

    // Restore or clean up .dev.vars
    if (hasExistingDevVars) {
      if (originalDevVars !== null) {
        try {
          fs.writeFileSync(devVarsPath, originalDevVars);
          console.log('[Setup] Restored original .dev.vars.');
        } catch (err) {
          console.warn('[Setup Warning] Failed to restore original .dev.vars:', err.message);
        }
      }
    } else {
      if (fs.existsSync(devVarsPath)) {
        try {
          fs.unlinkSync(devVarsPath);
          console.log('[Setup] Cleaned up temporary .dev.vars.');
        } catch (err) {
          console.warn('[Setup Warning] Failed to remove temporary .dev.vars:', err.message);
        }
      }
    }
    process.exit(code);
  });
}
