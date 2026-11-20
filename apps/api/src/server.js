import {
  app,
  authService,
  mediaService,
  taskService,
  weddingService,
} from './app.js';
import { config } from './config.js';

const server = app.listen(config.port, '127.0.0.1', () => {
  console.info(`API listening at http://localhost:${config.port}/api/v1`);
});
const cleanup = () =>
  mediaService
    .cleanup()
    .catch(() => console.error('Media cleanup will retry later.'));
const firstCleanup = setTimeout(cleanup, 30000);
const cleanupTimer = setInterval(cleanup, 15 * 60 * 1000);
firstCleanup.unref();
cleanupTimer.unref();

const extendRepeats = () =>
  taskService
    .pumpRecurrence()
    .catch(() => console.error('Repeat generation will retry later.'));
const firstRepeats = setTimeout(extendRepeats, 5000);
const repeatTimer = setInterval(extendRepeats, 15 * 60 * 1000);
firstRepeats.unref();
repeatTimer.unref();
const purge = () =>
  weddingService
    .purge()
    .catch(() => console.error('Wedding purge will retry later.'));
const firstPurge = setTimeout(purge, 45000);
const purgeTimer = setInterval(purge, 60000);
firstPurge.unref();
purgeTimer.unref();

server.on('error', (error) => {
  console.error(`API could not start: ${error.message}`);
  process.exitCode = 1;
});

function shutdown() {
  clearTimeout(firstCleanup);
  clearTimeout(firstRepeats);
  clearInterval(repeatTimer);
  clearInterval(cleanupTimer);
  clearTimeout(firstPurge);
  clearInterval(purgeTimer);
  server.close(async () => {
    mediaService.close();
    await taskService.close().catch(() => {});
    await weddingService.close().catch(() => {});
    await authService.close().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
