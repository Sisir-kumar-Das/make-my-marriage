import { app } from './app.js';
import { config } from './config.js';

const server = app.listen(config.port, '127.0.0.1', () => {
  console.info(`API listening at http://localhost:${config.port}/api/v1`);
});

server.on('error', (error) => {
  console.error(`API could not start: ${error.message}`);
  process.exitCode = 1;
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
