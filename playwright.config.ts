import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Always use a separate server and ledger; never the owner's data or credentials.
const dataDir=process.env.E2E_DATA_DIR || mkdtempSync(join(tmpdir(),'ok-dashboard-e2e-'));
process.env.E2E_DATA_DIR=dataDir;
export default defineConfig({testDir:'./tests/e2e',workers:1,use:{baseURL:'http://127.0.0.1:5180',headless:true},webServer:{command:'npm run build && node server/index.mjs',url:'http://127.0.0.1:5180',reuseExistingServer:false,env:{API_PORT:'5180',DATA_DIR:dataDir,STRIPE_SECRET_KEY:'',MERCURY_API_TOKEN:'',GCP_BILLING_PROJECT:'',CLOUDFLARE_API_TOKEN:''},timeout:30000},reporter:'list'});
