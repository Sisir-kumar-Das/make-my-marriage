import { app, authService, mediaService } from './app.js';
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

server.on('error', (error) => {
  console.error(`API could not start: ${error.message}`);
  process.exitCode = 1;
});

function shutdown() {
  clearTimeout(firstCleanup);
  clearInterval(cleanupTimer);
  server.close(async () => {
    mediaService.close();
    await authService.close().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
