import { defineConfig } from '@neon/config/v1';
import { bundleNeon } from './scripts/bundle-neon.mjs';

export default defineConfig({
  // Declare your Neon services here
  auth: false,
  functions: {
    api: {
      name: 'ViotechPM API',
      source: './server/src/neon.ts',
      bundler: bundleNeon,
      env: {
        NODE_ENV: 'production',
        CLIENT_ORIGIN: 'https://viotechpm.vercel.app',
        TRUST_PROXY: '1',
        COOKIE_SAME_SITE: 'none',
        DOCUMENTS_ENABLED: 'false',
        REMINDERS_ENABLED: 'false',
        PRODUCTION_READY_ACK: 'true',
        HOSTED_TEST_MODE: 'true',
        TEST_ADMIN_EMAIL: 'admin@viotech.local',
        SESSION_SECRET: process.env.SESSION_SECRET!,
        DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL!,
        REALTIME_DATABASE_URL: process.env.REALTIME_DATABASE_URL!,
      },
    },
  },
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: '7d' };
    }
    // Existing branch: no changes
    return {};
  },
});
