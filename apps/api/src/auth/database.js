import mongoose from 'mongoose';
import { ApiError } from '../lib/api-error.js';
import { authModels } from './models.js';
import { weddingModels } from '../weddings/models.js';
import { mediaModel } from '../media/models.js';
import { eventModels } from '../events/models.js';
import { taskModels } from '../tasks/models.js';
import { checklistModels } from '../checklist/models.js';

export function createAuthDatabase(settings) {
  let connection;
  let pending;

  async function connect() {
    if (!settings.mongodbUri) {
      throw new ApiError(
        503,
        'AUTH_UNAVAILABLE',
        'Registration is temporarily unavailable. Please try again later.',
      );
    }
    if (connection?.readyState === 1) return connection;
    if (!pending) {
      pending = (async () => {
        const candidate = mongoose.createConnection(settings.mongodbUri, {
          dbName: settings.mongodbDbName,
          serverSelectionTimeoutMS: 4000,
          maxPoolSize: 5,
          bufferCommands: false,
        });
        // Never log driver errors: connection messages can contain URI details.
        candidate.on('error', () => {});
        try {
          await candidate.asPromise();
          const { User, AuthToken, Session } = authModels(candidate);
          await User.init();
          await AuthToken.init();
          await Session.init();
          await mediaModel(candidate).init();
          for (const model of Object.values(eventModels(candidate)))
            await model.init();
          for (const model of Object.values(taskModels(candidate)))
            await model.init();
          for (const model of Object.values(checklistModels(candidate)))
            await model.init();
          await Promise.all(
            Object.values(weddingModels(candidate)).map((model) =>
              model.init(),
            ),
          );
          connection = candidate;
          return candidate;
        } catch {
          await candidate.close().catch(() => {});
          throw new ApiError(
            503,
            'AUTH_UNAVAILABLE',
            'Registration is temporarily unavailable. Please try again later.',
          );
        }
      })().finally(() => {
        pending = undefined;
      });
    }
    return pending;
  }

  async function close() {
    if (pending) await pending.catch(() => {});
    if (connection) await connection.close();
    connection = undefined;
  }

  return { connect, close };
}
