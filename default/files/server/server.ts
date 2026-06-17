import { createApp, lakebase, server } from '@databricks/appkit';
import { setupReferralRoutes } from './routes/referral-routes';

createApp({
  plugins: [
    lakebase(),
    server(),
  ],
  async onPluginsReady(appkit) {
    await setupReferralRoutes(appkit);
  },
}).catch(console.error);
