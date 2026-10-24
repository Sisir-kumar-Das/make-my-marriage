import { config } from '../apps/api/src/config.js';
import { createAuthDatabase } from '../apps/api/src/auth/database.js';
import { createMediaService } from '../apps/api/src/media/service.js';
const database = createAuthDatabase(config);
const media = createMediaService({ database, settings: config });
try {
  await media.cleanup();
  console.log('Bounded media cleanup completed.');
} catch {
  console.error('Media cleanup could not complete.');
  process.exitCode = 1;
} finally {
  media.close();
  await database.close();
}
