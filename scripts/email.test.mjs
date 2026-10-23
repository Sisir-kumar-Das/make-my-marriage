import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import { config } from '../apps/api/src/config.js';
import {
  createVerificationSender,
  createResetSender,
  createPasswordChangedSender,
  emailConfigured,
} from '../apps/api/src/auth/email.js';
import { createAuthService } from '../apps/api/src/auth/service.js';

const settings = {
  ...config,
  emailProvider: 'gmail',
  smtpUser: 'fixture@gmail.com',
  smtpAppPassword: 'testonlypassword',
  // Gmail must not depend on old Resend credentials or its sender address.
  resendApiKey: '',
  emailFrom: 'Old sender <onboarding@resend.dev>',
  mongodbUri: 'fake-database-config',
};
const input = {
  email: 'recipient@example.com',
  token: 'raw-single-use-token',
  tokenHash: 'hash-only',
};
const noHttp = async () => assert.fail('SMTP must never fall back to HTTP.');

test('Gmail sends all three authentication messages with the account sender and trusted fragment links', async () => {
  const messages = [];
  const transports = [];
  const dependencies = {
    request: noHttp,
    createTransport(options) {
      transports.push(options);
      return {
        async sendMail(message) {
          messages.push(message);
          return { accepted: [input.email], rejected: [] };
        },
      };
    },
  };
  for (const factory of [
    createVerificationSender,
    createResetSender,
    createPasswordChangedSender,
  ])
    await factory(settings, dependencies)(input);
  assert.equal(messages.length, 3);
  for (const message of messages) {
    assert.deepEqual(message.from, {
      name: 'Make My Marriage',
      address: settings.smtpUser,
    });
    assert.deepEqual(message.to, [input.email]);
    assert.ok(!JSON.stringify(message).includes(input.tokenHash));
    assert.equal(message.headers, undefined);
  }
  for (const [index, path] of [
    [0, '/verify-email'],
    [1, '/reset-password'],
  ]) {
    const link = new URL(messages[index].text.match(/https?:\/\/[^\s]+/)[0]);
    assert.equal(link.origin, settings.webOrigin);
    assert.equal(link.pathname, path);
    assert.equal(link.search, '');
    assert.equal(
      new URLSearchParams(link.hash.slice(1)).get('token'),
      input.token,
    );
  }
  assert.ok(!messages[2].text.includes(input.token));
  for (const transport of transports) {
    assert.equal(transport.host, 'smtp.gmail.com');
    assert.equal(transport.port, 465);
    assert.equal(transport.secure, true);
    assert.deepEqual(transport.auth, {
      user: settings.smtpUser,
      pass: settings.smtpAppPassword,
    });
    assert.deepEqual(transport.tls, {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
    });
    for (const key of [
      'dnsTimeout',
      'connectionTimeout',
      'greetingTimeout',
      'socketTimeout',
    ])
      assert.ok(transport[key] > 0 && transport[key] <= 8000);
    assert.equal(transport.logger, false);
    assert.equal(transport.debug, false);
    assert.equal(transport.pool, false);
    assert.equal(transport.disableFileAccess, true);
    assert.equal(transport.disableUrlAccess, true);
  }
});

test('SMTP rejection and private transport errors have one safe error, no logging and no automatic retries', async (t) => {
  const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args));
  t.mock.method(console, 'warn', (...args) => logs.push(args));
  for (const result of [
    { accepted: [], rejected: [input.email] },
    { accepted: [input.email], rejected: ['another@example.com'] },
    undefined,
    new Error(
      `${settings.smtpUser} ${settings.smtpAppPassword} ${input.token} private SMTP response`,
    ),
  ]) {
    let attempts = 0;
    const sender = createResetSender(settings, {
      request: noHttp,
      createTransport: () => ({
        async sendMail() {
          attempts++;
          if (result instanceof Error) throw result;
          return result;
        },
      }),
    });
    await assert.rejects(sender(input), (error) => {
      assert.equal(error.code, 'EMAIL_UNAVAILABLE');
      assert.equal(error.status, 503);
      for (const value of [
        settings.smtpUser,
        settings.smtpAppPassword,
        input.token,
        'private SMTP response',
      ])
        assert.ok(!JSON.stringify(error).includes(value));
      return true;
    });
    assert.equal(attempts, 1);
  }
  assert.deepEqual(logs, []);
});

test('one sender safely reuses its transport for an explicit later attempt after failure', async () => {
  let created = 0;
  let attempts = 0;
  const sender = createVerificationSender(settings, {
    request: noHttp,
    createTransport() {
      created++;
      return {
        async sendMail() {
          if (++attempts === 1) throw new Error('Temporary SMTP failure');
          return { accepted: [input.email], rejected: [] };
        },
      };
    },
  });
  await assert.rejects(sender(input), { code: 'EMAIL_UNAVAILABLE' });
  assert.equal(attempts, 1);
  await sender(input);
  assert.equal(attempts, 2);
  assert.equal(created, 1);
});

test('provider configuration is explicit and incomplete SMTP never connects or uses Resend credentials', async () => {
  assert.equal(emailConfigured(settings), true);
  assert.equal(
    emailConfigured({
      emailProvider: 'resend',
      resendApiKey: 'test',
      emailFrom: 'sender@example.com',
    }),
    true,
  );
  for (const patch of [
    { smtpUser: '' },
    { smtpUser: 'not-an-email' },
    { smtpUser: 'fixture@example.com' },
    { smtpUser: 'fixture@gmail.com\r\nBcc: other@example.com' },
    { smtpAppPassword: '' },
    { smtpAppPassword: 'short' },
    { emailProvider: 'unknown' },
  ]) {
    const invalid = { ...settings, ...patch, resendApiKey: 'old-test-key' };
    assert.equal(emailConfigured(invalid), false);
    await assert.rejects(
      createVerificationSender(invalid, {
        request: noHttp,
        createTransport: () =>
          assert.fail('Invalid configuration reached SMTP.'),
      })(input),
      { code: 'EMAIL_UNAVAILABLE' },
    );
  }
});

test('registration, resend and recovery accept Gmail-only settings; missing settings fail before database access', async () => {
  let reads = 0;
  const connection = {
    models: {
      User: {
        exists: async () => true,
        findOne: () => ({ lean: async () => null }),
      },
      AuthToken: {},
      Session: {},
    },
  };
  const database = {
    async connect() {
      reads++;
      return connection;
    },
    async close() {},
  };
  const service = createAuthService({
    settings,
    database,
    sendVerification: noHttp,
    sendReset: noHttp,
  });
  await assert.rejects(
    service.register({
      name: 'Existing user',
      email: input.email,
      password: 'Wedding123',
    }),
    { status: 409, code: 'EMAIL_ALREADY_REGISTERED' },
  );
  await service.resend({ email: input.email });
  await service.forgotPassword({ email: input.email });
  await service.drainRecovery();
  assert.equal(reads, 3);
  await service.close();
  const invalid = createAuthService({
    settings: { ...settings, smtpAppPassword: '' },
    database,
    sendVerification: noHttp,
    sendReset: noHttp,
  });
  for (const method of ['register', 'resend', 'forgotPassword'])
    await assert.rejects(invalid[method]({ email: input.email }), {
      code: 'AUTH_UNAVAILABLE',
    });
  assert.equal(reads, 3);
  await invalid.close();
});

test('environment parsing accepts grouped Google App Passwords without printing credentials and rejects unknown providers', () => {
  const script = `import { config } from './apps/api/src/config.js'; import { emailConfigured } from './apps/api/src/auth/email.js'; console.log(JSON.stringify({provider:config.emailProvider, normalized:config.smtpUser === 'fixture@gmail.com', passwordLength:config.smtpAppPassword.length, ready:emailConfigured(config)}));`;
  const env = {
    ...process.env,
    EMAIL_PROVIDER: 'gmail',
    SMTP_USER: ' FIXTURE@GMAIL.COM ',
    SMTP_APP_PASSWORD: 'test only pass word',
  };
  const output = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    { env, encoding: 'utf8' },
  );
  assert.deepEqual(JSON.parse(output), {
    provider: 'gmail',
    normalized: true,
    passwordLength: 16,
    ready: true,
  });
  const invalid = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      env: { ...env, EMAIL_PROVIDER: 'private-invalid-value' },
      encoding: 'utf8',
    },
  );
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /EMAIL_PROVIDER must be resend or gmail/);
  assert.ok(!invalid.stderr.includes('private-invalid-value'));
  assert.ok(!invalid.stderr.includes(env.SMTP_APP_PASSWORD));
});
