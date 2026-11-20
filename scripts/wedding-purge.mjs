import { config } from '../apps/api/src/config.js';
import { createAuthDatabase } from '../apps/api/src/auth/database.js';
import { createWeddingService } from '../apps/api/src/weddings/service.js';
const database = createAuthDatabase(config);
const weddings = createWeddingService({ database, settings: config });
try {
  console.log(JSON.stringify(await weddings.purge()));
} catch {
  console.error(
    'Wedding purge paused; check runtime connectivity/storage and retry.',
  );
  process.exitCode = 1;
} finally {
  await weddings.close();
  await database.close();
}
