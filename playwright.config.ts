import { defineConfig } from '@playwright/test';
import { browserOptions } from './src/pdf/browser';
export default defineConfig({testDir:'tests',testMatch:'**/*.e2e.ts',workers:1,timeout:90000,use:{baseURL:'http://127.0.0.1:5174',headless:true,launchOptions:browserOptions()},webServer:{command:'npm run dev',url:'http://127.0.0.1:5174/api/projects',reuseExistingServer:false,env:{PORT:'5174',WORKSHEET_PROJECTS:'.tmp/e2e-projects'},timeout:30000}});
