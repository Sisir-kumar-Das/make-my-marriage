import { initials } from '../apps/web/src/features/profile/avatar-data.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createProfileService } from '../apps/api/src/auth/profile.js';
import { registerSchema } from '../apps/api/src/auth/validation.js';

const id = 'a'.repeat(24);
const version = `"${id}:0"`;

test('profile writes reject another account, a missing version and invalid fields before database access', async () => {
  const profile = createProfileService({
    database: { connect: () => assert.fail('Unexpected database access') },
  });
  await assert.rejects(profile.update(id, { phone: '' }, undefined), {
    status: 428,
    code: 'PROFILE_VERSION_REQUIRED',
  });
  await assert.rejects(
    profile.update(id, { phone: '' }, `"${'b'.repeat(24)}:0"`),
    { status: 409, code: 'PROFILE_ACCOUNT_CHANGED' },
  );
  for (const payload of [
    {},
    { email: 'other@example.test' },
    { userId: 'someone-else', displayName: 'Asha' },
    { displayName: 'A' },
    { phone: '987654321' },
    { phone: '------' },
    { phone: '+1 9876543210' },
  ]) {
    await assert.rejects(profile.update(id, payload, version), {
      status: 400,
      code: 'INVALID_PROFILE',
    });
  }
});

test('profile and registration reject hidden names with clear field messages', async () => {
  const profile = createProfileService({
    database: { connect: () => assert.fail('Unexpected database access') },
  });
  const registration = { email: 'owner@example.test', password: 'Example123' };
  const hidden =
    'Use visible characters in your display name and remove any hidden formatting.';
  for (const [name, message] of [
    ['  ', 'Enter a display name with at least 2 characters.'],
    ['A'.repeat(101), 'Use 100 characters or fewer for your display name.'],
    ['Asha\u202Egnp', hidden],
    ['Ad\u200Dmin', hidden],
    ['Ad\u200Cmin', hidden],
    ['A\u094D\u200DB', hidden],
    ['क्\u200DMin', hidden],
    ['Ad\u0301\u200Dmin', hidden],
    ['\u200B\u200B', hidden],
    ['Asha\u2066Das\u2069', hidden],
    ['\u0301\u0302', hidden],
    ['A\u034F', hidden],
    ['\u2800\u2800', hidden],
  ]) {
    const result = registerSchema.safeParse({ ...registration, name });
    assert.equal(result.success, false);
    assert.deepEqual(
      result.error.issues.map((issue) => issue.message),
      [message],
    );
    await assert.rejects(profile.update(id, { displayName: name }, version), {
      status: 400,
      code: 'INVALID_PROFILE',
      details: { displayName: [message] },
    });
  }
  for (const name of [
    'ସିଶିର ଦାସ',
    'श्रेया',
    'लक्ष्\u200Dमी',
    'क्\u200D',
    'क्\u200D शर्मा',
    'র\u200D্যাব',
    'ശ്രീമാന്\u200D',
    'ଙ\u200D୍କ',
    'ක්\u200Dර',
    'زهرا\u200Cحسینی',
    'Zoë',
    'Anya 👩🏽\u200D💻',
  ]) {
    assert.equal(
      registerSchema.parse({ ...registration, name: ` ${name} ` }).name,
      name,
    );
  }
});

test('a legacy profile update normalizes phone and an unchanged retry performs no second write', async () => {
  const user = {
    _id: id,
    email: 'owner@example.test',
    profile: { displayName: 'Asha' },
  };
  const query = (value) => ({ select: () => ({ lean: async () => value }) });
  let writes = 0;
  const User = {
    findOne: () => query(user),
    findOneAndUpdate(filter, update) {
      assert.equal(filter._id, id);
      assert.equal(filter.status, 'ACTIVE');
      assert.ok(
        filter.$or.some(
          (branch) => branch['profile.detailsVersion']?.$exists === false,
        ),
      );
      if (writes) return query(null);
      writes++;
      assert.deepEqual(update.$set, {
        'profile.displayName': 'Asha Das',
        'profile.phone': '+919876543210',
      });
      user.profile = {
        displayName: 'Asha Das',
        phone: '+919876543210',
        detailsVersion: 1,
      };
      return query(user);
    },
  };
  const profiles = createProfileService({
    database: {
      connect: async () => ({ models: { User, AuthToken: {}, Session: {} } }),
    },
  });
  assert.equal((await profiles.read(id)).phone, null);
  const patch = { displayName: ' Asha Das ', phone: '+91 98765-43210' };
  const saved = await profiles.update(id, patch, version);
  assert.deepEqual(await profiles.update(id, patch, version), saved);
  assert.equal(saved.version, `"${id}:1"`);
  await assert.rejects(
    profiles.update(id, { displayName: 'Another name' }, version),
    { code: 'PROFILE_CHANGED' },
  );
  assert.equal(writes, 1);
});

test('avatar initials keep each first grapheme intact', () => {
  assert.equal(initials('  anita das  '), 'AD');
  assert.equal(initials('क्ष कुमार'), 'क्षकु');
  assert.equal(initials('র্‍যাব রফিক'), 'র্‍যার');
  assert.equal(initials('👩🏽‍💻 Anya'), '👩🏽‍💻A');
});
