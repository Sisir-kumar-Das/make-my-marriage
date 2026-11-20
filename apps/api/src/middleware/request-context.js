import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

export function requestContext(req, res, next) {
  req.requestId = randomUUID();
  res.setHeader('x-request-id', req.requestId);
  const startedAt = performance.now();

  res.on('finish', () => {
    console.info(
      JSON.stringify({
        requestId: req.requestId,
        method: req.method,
        route: req.route?.path ?? 'unmatched',
        status: res.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      }),
    );
  });
  next();
}
