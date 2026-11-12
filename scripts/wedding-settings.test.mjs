import assert from 'node:assert/strict';
import test from 'node:test';
import { weddingSettingsSchema } from '../apps/api/src/weddings/validation.js';
import { createWeddingService } from '../apps/api/src/weddings/service.js';
import {
  settingsChanges,
  settingsDraft,
  settingsFields,
  settingsBudgetMinor,
  settingsBudgetLabel,
} from '../apps/web/src/features/weddings/settings-data.js';
import { createWeddingSchema } from '../apps/api/src/weddings/validation.js';
import {
  setupSchema,
  weddingToday,
} from '../apps/web/src/features/weddings/form-data.js';

const wedding = {
  id: 'a'.repeat(24),
  name: 'Our celebration',
  brideName: 'Priya',
  groomName: 'Rahul',
  mainDate: '2020-01-01',
  tradition: 'ODIA',
  location: { city: 'Puri', state: 'Odisha' },
};
test('settings allow only the approved partial fields and exact optional INR money', () => {
  for (const payload of [
    {},
    { mainDate: '2030-01-01' },
    { timezone: 'UTC' },
    { role: 'ADMIN' },
    { coverMediaId: 'b'.repeat(24) },
    { location: { city: 'Puri', state: 'Odisha', countryCode: 'US' } },
    { name: '\n' },
    { brideName: 'A' },
    { tradition: 'UNKNOWN' },
    { estimatedBudget: { amountMinor: 1.2, currency: 'INR' } },
    { estimatedBudget: { amountMinor: -1, currency: 'INR' } },
    {
      estimatedBudget: {
        amountMinor: Number.MAX_SAFE_INTEGER + 1,
        currency: 'INR',
      },
    },
    { estimatedBudget: { amountMinor: 123, currency: 'USD' } },
  ])
    assert.equal(
      weddingSettingsSchema.safeParse(payload).success,
      false,
      JSON.stringify(payload),
    );
  for (const payload of [
    { name: ' Our day ' },
    { estimatedBudget: null },
    {
      estimatedBudget: {
        amountMinor: Number.MAX_SAFE_INTEGER,
        currency: 'INR',
      },
    },
  ])
    assert.equal(weddingSettingsSchema.safeParse(payload).success, true);
});
test('settings retain custom titles, accept existing past weddings and round-trip every paisa', () => {
  for (const amountMinor of [
    0,
    1,
    99,
    100,
    123456789,
    Number.MAX_SAFE_INTEGER,
  ]) {
    const saved = {
      ...wedding,
      estimatedBudget: { amountMinor, currency: 'INR' },
    };
    const draft = settingsDraft(saved);
    assert.equal(settingsFields.safeParse(draft).success, true);
    assert.deepEqual(settingsChanges(saved, draft), {});
    assert.deepEqual(settingsChanges(saved, { ...draft, budget: '' }), {
      estimatedBudget: null,
    });
  }
  const draft = settingsDraft(wedding);
  assert.deepEqual(settingsChanges(wedding, { ...draft, brideName: 'Anya' }), {
    brideName: 'Anya',
  });
  assert.deepEqual(settingsChanges(wedding, { ...draft, budget: '0.01' }), {
    estimatedBudget: { amountMinor: 1, currency: 'INR' },
  });
  assert.deepEqual(settingsChanges(wedding, { ...draft, city: 'Cuttack' }), {
    location: { city: 'Cuttack', state: 'Odisha' },
  });
});
test('settings reject malformed writes and missing versions or keys before database access', async () => {
  const service = createWeddingService({
    database: { connect: () => assert.fail('Unexpected database access') },
  });
  const key = 'settings-test-key-12345';
  for (const header of ['W/"1"', '"abc"', '"-1"', '"9007199254740992"'])
    await assert.rejects(
      service.update(
        'b'.repeat(24),
        wedding.id,
        { name: 'Our wedding' },
        header,
        key,
      ),
      { status: 428, code: 'VERSION_REQUIRED' },
    );
  await assert.rejects(
    service.update(
      'b'.repeat(24),
      wedding.id,
      { name: 'Our day' },
      undefined,
      key,
    ),
    { status: 428 },
  );
  await assert.rejects(
    service.update(
      'b'.repeat(24),
      wedding.id,
      { name: 'Our day' },
      '"0"',
      undefined,
    ),
    { status: 400 },
  );
  await assert.rejects(
    service.update(
      'b'.repeat(24),
      wedding.id,
      { mainDate: '2030-01-01' },
      '"0"',
      key,
    ),
    { status: 400 },
  );
});

test('settings and setup reject hidden formatting while preserving script shaping and title length', () => {
  const draft = settingsDraft(wedding);
  const input = {
    ...wedding,
    mainDate: weddingToday(),
    timezone: 'Asia/Kolkata',
    location: { ...wedding.location, countryCode: 'IN' },
  };
  delete input.id;
  for (const name of [
    'A\u202Eb',
    'A\u2066b',
    'A\u200Bb',
    'Ad\u200Dmin',
    '\u2800\u2800',
  ]) {
    assert.equal(
      weddingSettingsSchema.safeParse({ name }).success,
      false,
      name,
    );
    assert.equal(
      settingsFields.safeParse({ ...draft, name }).success,
      false,
      name,
    );
    assert.equal(
      createWeddingSchema.safeParse({ ...input, name }).success,
      false,
      name,
    );
    assert.equal(
      setupSchema.safeParse({ ...draft, name, mainDate: weddingToday() })
        .success,
      false,
      name,
    );
  }
  for (const name of [
    'ସିଶିର ଦାସ',
    'लक्ष्\u200Dमी',
    'র\u200D্যাব',
    'ശ്രീമാന്\u200D',
    'زهرا\u200Cحسینی',
    'Our celebration 👩🏽\u200D💻',
    'A'.repeat(160),
  ]) {
    assert.equal(weddingSettingsSchema.safeParse({ name }).success, true, name);
    assert.equal(
      settingsFields.safeParse({ ...draft, name }).success,
      true,
      name,
    );
    assert.equal(
      createWeddingSchema.safeParse({ ...input, name }).success,
      true,
      name,
    );
  }
});

test('formatted INR entry accepts exact grouped money and ordinary decimal shorthand', () => {
  for (const [input, expected] of [
    ['₹ 35,00,000 INR', 350000000],
    ['1,23,456', 12345600],
    ['1,234,567.89', 123456789],
    ['.5', 50],
    ['5.', 500],
    ['0', 0],
    ['₹9,00,71,99,25,47,409.91 INR', Number.MAX_SAFE_INTEGER],
    ['', undefined],
  ])
    assert.equal(settingsBudgetMinor(input), expected, input);
  for (const input of [
    '1,23,45',
    '12,345,67',
    '-1',
    '1e3',
    '₹ INR',
    '5.123',
    '90071992547409.92',
    '1,,000',
    '1.2.3',
  ])
    assert.equal(settingsBudgetMinor(input), null, input);
  for (const amount of [0, 1, 99, 100, Number.MAX_SAFE_INTEGER])
    assert.equal(settingsBudgetMinor(settingsBudgetLabel(amount)), amount);
});

test('commas in fractional amounts never get normalized into valid money', () => {
  for (const prefix of ['', '₹ ', 'INR '])
    for (const amount of [
      '1.2,3',
      '1,000.5,0',
      '1,000.50,',
      '.5,',
      '1.,',
      '1.2.3',
    ]) {
      const value = prefix + amount;
      assert.equal(settingsBudgetMinor(value), null, value);
      assert.equal(
        settingsFields.safeParse({ ...settingsDraft(wedding), budget: value })
          .success,
        false,
        value,
      );
    }
});
