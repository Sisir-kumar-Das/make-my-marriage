import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { config } from '../apps/api/src/config.js';
import { createAuthDatabase } from '../apps/api/src/auth/database.js';
import { authModels } from '../apps/api/src/auth/models.js';
import { weddingModels } from '../apps/api/src/weddings/models.js';
import { eventModels } from '../apps/api/src/events/models.js';
import { invitationModels } from '../apps/api/src/invitations/models.js';
import { createWeddingService } from '../apps/api/src/weddings/service.js';
import { createInvitationService } from '../apps/api/src/invitations/service.js';
import { createMemberService } from '../apps/api/src/members/service.js';
import { createAuthService } from '../apps/api/src/auth/service.js';
import { hashInvitation } from '../apps/api/src/invitations/tokens.js';

test(
  'Atlas invitations: atomic joins, permissions, lifecycle, email isolation and retries',
  { skip: !config.mongodbUri && 'Set private MONGODB_URI.' },
  async (t) => {
    const settings = {
      ...config,
      jwtSecret: 'disposable-invitation-secret-'.repeat(3),
      mongodbDbName: 'mmm_invitation_test_' + randomBytes(8).toString('hex'),
    };
    const database = createAuthDatabase(settings);
    let connection;
    try {
      connection = await database.connect();
      const { User, AuthToken } = authModels(connection),
        { Wedding, WeddingMember } = weddingModels(connection),
        { MemberInvitation, InvitationWriteRequest } =
          invitationModels(connection),
        { Activity } = eventModels(connection);
      let instant = new Date('2026-10-28T12:00:00Z'),
        failMail = false;
      const emails = [];
      const invitations = createInvitationService({
        database,
        settings,
        now: () => instant,
        sendInvitation: async (mail) => {
          if (failMail) throw new Error('Private SMTP failure');
          emails.push(mail);
        },
      });
      const weddings = createWeddingService({ database, now: () => instant });
      const members = createMemberService({ database });
      async function user(name, patch = {}) {
        const email = name.toLowerCase() + '@invitation-test.example.com';
        const row = await User.create({
          email,
          emailNormalized: email,
          passwordHash: 'not-used-for-sign-in',
          emailVerifiedAt: instant,
          profile: { displayName: name },
          ...patch,
        });
        return { id: String(row._id), email };
      }
      const creator = await user('Creator'),
        family = await user('Family'),
        viewer = await user('Viewer'),
        stranger = await user('Stranger'),
        otherAdmin = await user('OtherAdmin');
      const weddingInput = {
        name: 'Anya weds Kabir',
        brideName: 'Anya',
        groomName: 'Kabir',
        mainDate: '2028-02-20',
        tradition: 'ODIA',
        location: { city: 'Cuttack', state: 'Odisha', countryCode: 'IN' },
      };
      const wid = (
        await weddings.create(creator.id, weddingInput, randomUUID())
      ).wedding.id;
      const otherWid = (
        await weddings.create(otherAdmin.id, weddingInput, randomUUID())
      ).wedding.id;
      for (const [person, role] of [
        [family, 'FAMILY_MEMBER'],
        [viewer, 'VIEWER'],
      ])
        await WeddingMember.create({
          weddingId: wid,
          userId: person.id,
          role,
          relationship: 'Friend',
          joinedAt: instant,
          createdBy: creator.id,
        });
      const draft = (email, patch = {}) => ({
        email,
        role: 'FAMILY_MEMBER',
        relationshipChoice: 'OTHER',
        customRelationship: 'Bride’s childhood friend',
        ...patch,
      });
      async function issue(person, patch = {}) {
        const response = await invitations.create(
          creator.id,
          wid,
          draft(person.email, patch),
          randomUUID(),
        );
        const token = new URL(
          (await invitations.copyLink(creator.id, wid, response.invitation.id))
            .url,
        ).hash.slice('#token='.length);
        return { ...response.invitation, token };
      }
      await t.test(
        'only current verified Admins manage invitations; list/copy never leak to Family/Viewer/outsiders',
        async () => {
          for (const person of [family, viewer, stranger]) {
            await assert.rejects(invitations.list(person.id, wid), {
              code: 'ADMIN_REQUIRED',
            });
            await assert.rejects(
              invitations.create(
                person.id,
                wid,
                draft('nobody@example.com'),
                randomUUID(),
              ),
              { code: 'ADMIN_REQUIRED' },
            );
          }
          const count = await MemberInvitation.countDocuments();
          assert.equal(count, 0);
          await User.updateOne(
            { _id: creator.id },
            { $set: { status: 'DISABLED' } },
          );
          await assert.rejects(invitations.list(creator.id, wid), {
            code: 'SESSION_EXPIRED',
          });
          await User.updateOne(
            { _id: creator.id },
            { $set: { status: 'ACTIVE' } },
          );
        },
      );
      const recipient = await user('Recipient');
      let issued, originalKey;
      await t.test(
        'creation is explicit, duplicate-safe, hash-only and does not create membership; exact replay sends no additional email',
        async () => {
          const input = draft(' RECIPIENT@INVITATION-TEST.EXAMPLE.COM ');
          originalKey = randomUUID();
          const first = await invitations.create(
            creator.id,
            wid,
            input,
            originalKey,
          );
          assert.equal(first.invitation.delivery, 'SUBMITTED');
          const replay = await invitations.create(
            creator.id,
            wid,
            input,
            originalKey,
          );
          assert.equal(first.invitation.id, replay.invitation.id);
          assert.equal(emails.length, 1);
          assert.equal(
            await WeddingMember.countDocuments({ userId: recipient.id }),
            0,
          );
          assert.equal(await Wedding.countDocuments(), 2);
          const saved = await MemberInvitation.findById(first.invitation.id)
            .select('+nonce +tokenHash')
            .lean();
          assert.equal(saved.tokenHash, hashInvitation(emails[0].token));
          assert.equal(JSON.stringify(saved).includes(emails[0].token), false);
          assert.equal(saved.relationship, 'Bride’s childhood friend');
          await assert.rejects(
            invitations.create(
              creator.id,
              wid,
              draft(recipient.email),
              randomUUID(),
            ),
            { code: 'INVITATION_EXISTS' },
          );
          await assert.rejects(
            invitations.create(
              creator.id,
              wid,
              draft(recipient.email, { role: 'ADMIN' }),
              originalKey,
            ),
            { code: 'IDEMPOTENCY_CONFLICT' },
          );
          const list = await invitations.list(creator.id, wid);
          assert.equal(list.pendingCount, 1);
          assert.equal(JSON.stringify(list).includes(saved.nonce), false);
          assert.equal(JSON.stringify(list).includes(saved.tokenHash), false);
          issued = { ...first.invitation, token: emails[0].token };
        },
      );
      await t.test(
        'preview gives minimal metadata and continuation is limited to the matching pending email',
        async () => {
          const preview = await invitations.preview({ token: issued.token });
          assert.equal(preview.state, 'PENDING');
          assert.equal(preview.email, recipient.email);
          assert.equal(preview.inviterName, 'Creator');
          for (const privateField of [
            'passwordHash',
            'tokenHash',
            'nonce',
            'invitedBy',
            'acceptedBy',
          ])
            assert.equal(Object.hasOwn(preview, privateField), false);
          assert.deepEqual(
            await invitations.preview({ token: 'Z'.repeat(43) }),
            { state: 'INVALID' },
          );
          assert.equal(
            await invitations.verificationContinuation(
              recipient.email,
              issued.token,
            ),
            issued.token,
          );
          assert.equal(
            await invitations.verificationContinuation(
              stranger.email,
              issued.token,
            ),
            undefined,
          );
        },
      );
      await t.test(
        'matching verified account and explicit acceptance are required; membership and invitation/history commit atomically',
        async () => {
          await assert.rejects(
            invitations.accept(
              stranger.id,
              { token: issued.token },
              randomUUID(),
            ),
            { code: 'INVITATION_EMAIL_MISMATCH' },
          );
          await User.updateOne(
            { _id: recipient.id },
            { $set: { emailVerifiedAt: null } },
          );
          await assert.rejects(
            invitations.accept(
              recipient.id,
              { token: issued.token },
              randomUUID(),
            ),
            { code: 'SESSION_EXPIRED' },
          );
          await User.updateOne(
            { _id: recipient.id },
            { $set: { emailVerifiedAt: instant } },
          );
          const key = randomUUID();
          const results = await Promise.all([
            invitations.accept(recipient.id, { token: issued.token }, key),
            invitations.accept(recipient.id, { token: issued.token }, key),
          ]);
          assert.equal(results[0].accepted, true);
          assert.deepEqual(results[0], results[1]);
          assert.equal(
            await WeddingMember.countDocuments({
              userId: recipient.id,
              status: 'ACTIVE',
            }),
            1,
          );
          const member = await WeddingMember.findOne({
            userId: recipient.id,
          }).lean();
          assert.equal(member.role, 'FAMILY_MEMBER');
          assert.equal(member.relationship, 'Bride’s childhood friend');
          assert.equal(
            await Activity.countDocuments({
              action: 'INVITATION_ACCEPT',
              entityId: issued.id,
            }),
            1,
          );
          assert.equal(
            (await invitations.preview({ token: issued.token })).state,
            'ACCEPTED',
          );
          await assert.rejects(
            invitations.accept(
              recipient.id,
              { token: issued.token },
              randomUUID(),
            ),
            { code: 'INVITATION_ACCEPTED' },
          );
          const directory = await members.list(creator.id, wid);
          assert.equal(directory.counts.ALL, 4);
          assert.equal((await weddings.current(recipient.id)).wedding.id, wid);
          await WeddingMember.updateOne(
            { userId: recipient.id },
            { $set: { status: 'REMOVED' } },
          );
          await assert.rejects(
            invitations.accept(recipient.id, { token: issued.token }, key),
            { code: 'INVITATION_NOT_FOUND' },
          );
          await WeddingMember.updateOne(
            { userId: recipient.id },
            { $set: { status: 'ACTIVE' } },
          );
        },
      );
      await t.test(
        'resend cooldown persists; rotation invalidates old link and replay does not send again; revoke blocks copy and acceptance',
        async () => {
          const person = await user('Rotate');
          const invite = await issue(person);
          await assert.rejects(
            invitations.resend(
              creator.id,
              wid,
              invite.id,
              { version: invite.version },
              randomUUID(),
            ),
            { code: 'INVITATION_COOLDOWN' },
          );
          instant = new Date(instant.getTime() + 46000);
          const key = randomUUID(),
            before = emails.length;
          const next = await invitations.resend(
            creator.id,
            wid,
            invite.id,
            { version: invite.version },
            key,
          );
          await invitations.resend(
            creator.id,
            wid,
            invite.id,
            { version: invite.version },
            key,
          );
          assert.equal(emails.length, before + 1);
          assert.equal(
            (await invitations.preview({ token: invite.token })).state,
            'INVALID',
          );
          const fresh = emails.at(-1).token;
          assert.equal(
            (await invitations.preview({ token: fresh })).state,
            'PENDING',
          );
          assert.equal(
            new Date(next.invitation.expiresAt).getTime(),
            instant.getTime() + 7 * 86400000,
          );
          const revoked = await invitations.revoke(
            creator.id,
            wid,
            invite.id,
            { version: next.invitation.version },
            randomUUID(),
          );
          assert.equal(revoked.invitation.status, 'REVOKED');
          assert.equal(
            (await invitations.preview({ token: fresh })).state,
            'REVOKED',
          );
          await assert.rejects(
            invitations.copyLink(creator.id, wid, invite.id),
            { code: 'INVITATION_NOT_FOUND' },
          );
          await assert.rejects(
            invitations.accept(person.id, { token: fresh }, randomUUID()),
            { code: 'INVITATION_REVOKED' },
          );
        },
      );
      await t.test(
        'expiry is exact without a worker; expired invites can be resent, stale versions cannot overwrite',
        async () => {
          const person = await user('Expires'),
            invite = await issue(person);
          instant = new Date(invite.expiresAt);
          assert.equal(
            (await invitations.preview({ token: invite.token })).state,
            'EXPIRED',
          );
          await assert.rejects(
            invitations.accept(
              person.id,
              { token: invite.token },
              randomUUID(),
            ),
            { code: 'INVITATION_EXPIRED' },
          );
          const fresh = await invitations.resend(
            creator.id,
            wid,
            invite.id,
            { version: invite.version },
            randomUUID(),
          );
          assert.equal(fresh.invitation.status, 'PENDING');
          await assert.rejects(
            invitations.revoke(
              creator.id,
              wid,
              invite.id,
              { version: invite.version },
              randomUUID(),
            ),
            { code: 'INVITATION_CHANGED' },
          );
        },
      );
      await t.test(
        'SMTP failure retains an explicit shareable invitation and retry receipts never resend mail',
        async (sub) => {
          sub.mock.method(console, 'error', () => {});
          failMail = true;
          const person = await user('MailFailure'),
            before = emails.length,
            key = randomUUID();
          const response = await invitations.create(
            creator.id,
            wid,
            draft(person.email),
            key,
          );
          assert.equal(response.invitation.delivery, 'FAILED');
          assert.ok(
            (
              await invitations.copyLink(
                creator.id,
                wid,
                response.invitation.id,
              )
            ).url,
          );
          await invitations.create(creator.id, wid, draft(person.email), key);
          assert.equal(emails.length, before);
          failMail = false;
        },
      );
      await t.test(
        'one-wedding limit and concurrent different invitations cannot attach an account twice',
        async () => {
          const inviteOther = await invitations.create(
            creator.id,
            wid,
            draft(otherAdmin.email),
            randomUUID(),
          );
          const tokenOther = emails.at(-1).token;
          await assert.rejects(
            invitations.accept(
              otherAdmin.id,
              { token: tokenOther },
              randomUUID(),
            ),
            { code: 'WEDDING_ALREADY_EXISTS' },
          );
          assert.equal(
            (await MemberInvitation.findById(inviteOther.invitation.id)).status,
            'PENDING',
          );
          const raceUser = await user('Race');
          const first = await issue(raceUser);
          await invitations.create(
            otherAdmin.id,
            otherWid,
            draft(raceUser.email),
            randomUUID(),
          );
          const second = emails.at(-1).token;
          const results = await Promise.allSettled([
            invitations.accept(
              raceUser.id,
              { token: first.token },
              randomUUID(),
            ),
            invitations.accept(raceUser.id, { token: second }, randomUUID()),
          ]);
          assert.equal(
            results.filter((item) => item.status === 'fulfilled').length,
            1,
          );
          assert.equal(
            await WeddingMember.countDocuments({
              userId: raceUser.id,
              status: 'ACTIVE',
            }),
            1,
          );
          assert.equal(
            results.find((item) => item.status === 'rejected').reason.code,
            'WEDDING_ALREADY_EXISTS',
          );
        },
      );
      await t.test(
        'current Admin authority precedes receipt replay, and departed issuers do not sign out recipients',
        async () => {
          const person = await user('IssuerGone'),
            invite = await issue(person);
          await WeddingMember.updateOne(
            { weddingId: wid, userId: creator.id },
            { $set: { role: 'FAMILY_MEMBER' } },
          );
          await assert.rejects(
            invitations.create(
              creator.id,
              wid,
              draft(' RECIPIENT@INVITATION-TEST.EXAMPLE.COM '),
              originalKey,
            ),
            { code: 'ADMIN_REQUIRED' },
          );
          assert.equal(
            (await invitations.preview({ token: invite.token })).state,
            'UNAVAILABLE',
          );
          await assert.rejects(
            invitations.accept(
              person.id,
              { token: invite.token },
              randomUUID(),
            ),
            { code: 'INVITATION_UNAVAILABLE' },
          );
          await WeddingMember.updateOne(
            { weddingId: wid, userId: creator.id },
            { $set: { role: 'ADMIN' } },
          );
        },
      );
      await t.test(
        'audit failure rolls back invitation consumption and membership; a retry can then succeed',
        async (sub) => {
          const person = await user('Rollback'),
            invite = await issue(person),
            key = randomUUID();
          const original = Activity.create;
          sub.mock.method(Activity, 'create', async () => {
            throw new Error('Injected audit failure');
          });
          await assert.rejects(
            invitations.accept(person.id, { token: invite.token }, key),
          );
          assert.equal(
            await WeddingMember.countDocuments({ userId: person.id }),
            0,
          );
          assert.equal(
            (await MemberInvitation.findById(invite.id)).status,
            'PENDING',
          );
          assert.equal(
            await InvitationWriteRequest.countDocuments({ userId: person.id }),
            0,
          );
          Activity.create = original;
          assert.equal(
            (await invitations.accept(person.id, { token: invite.token }, key))
              .accepted,
            true,
          );
        },
      );
      await t.test(
        'verification registration/resend passes continuation only for the matching invitation without changing generic response rules',
        async () => {
          const email = 'new-account@invitation-test.example.com';
          await invitations.create(creator.id, wid, draft(email), randomUUID());
          const token = emails.at(-1).token;
          const verifiedMail = [];
          const auth = createAuthService({
            database,
            settings,
            now: () => instant,
            verificationContinuation: invitations.verificationContinuation,
            sendVerification: async (value) => verifiedMail.push(value),
            sendReset: async () => {},
            sendPasswordChanged: async () => {},
          });
          await auth.register({
            name: 'New Invitee',
            email,
            password: 'Password123',
            invitation: token,
          });
          assert.equal(verifiedMail.at(-1).invitation, token);
          const account = await User.findOne({ emailNormalized: email });
          assert.equal(
            await WeddingMember.countDocuments({ userId: account._id }),
            0,
          );
          await auth.verify({ token: verifiedMail.at(-1).token });
          assert.ok((await User.findById(account._id)).emailVerifiedAt);
          await assert.rejects(
            auth.register({
              name: 'Duplicate',
              email,
              password: 'NewPassword123',
              invitation: token,
            }),
            { code: 'EMAIL_ALREADY_REGISTERED' },
          );
          assert.equal(
            await AuthToken.countDocuments({ userId: account._id }),
            1,
          );
        },
      );
      await t.test(
        'a current replacement Admin can resend an unavailable issuer’s invitation',
        async () => {
          const person = await user('NewIssuer');
          const invite = await issue(person);
          await WeddingMember.create({
            weddingId: wid,
            userId: stranger.id,
            role: 'ADMIN',
            relationship: 'Planner',
            status: 'ACTIVE',
            joinedAt: instant,
            createdBy: creator.id,
          });
          await WeddingMember.updateOne(
            { weddingId: wid, userId: creator.id },
            { $set: { role: 'FAMILY_MEMBER' } },
          );
          instant = new Date(instant.getTime() + 46000);
          await invitations.resend(
            stranger.id,
            wid,
            invite.id,
            { version: invite.version },
            randomUUID(),
          );
          const fresh = emails.at(-1).token;
          assert.equal(
            (await invitations.preview({ token: fresh })).state,
            'PENDING',
          );
          assert.equal(
            (
              await invitations.accept(
                person.id,
                { token: fresh },
                randomUUID(),
              )
            ).accepted,
            true,
          );
          await WeddingMember.updateOne(
            { weddingId: wid, userId: creator.id },
            { $set: { role: 'ADMIN' } },
          );
        },
      );
      await t.test(
        'concurrent creation with the same key produces one invitation and one mail submission',
        async () => {
          const person = await user('ConcurrentCreate');
          const key = randomUUID(),
            before = emails.length;
          const results = await Promise.all([
            invitations.create(creator.id, wid, draft(person.email), key),
            invitations.create(creator.id, wid, draft(person.email), key),
          ]);
          assert.equal(results[0].invitation.id, results[1].invitation.id);
          assert.equal(emails.length, before + 1);
          assert.equal(
            await MemberInvitation.countDocuments({
              emailNormalized: person.email,
            }),
            1,
          );
          assert.equal(results.filter((value) => value.replayed).length, 1);
        },
      );
      await t.test(
        'invitation lists are bounded and tenant-scoped; no plaintext tokens/private receipts in audit',
        async () => {
          const list = await invitations.list(creator.id, wid, { page: '999' });
          assert.ok(list.invitations.length <= 10);
          assert.equal(list.pagination.page, list.pagination.totalPages);
          await assert.rejects(invitations.list(otherAdmin.id, wid), {
            code: 'ADMIN_REQUIRED',
          });
          const audits = await Activity.find({
            entityType: 'MEMBER_INVITATION',
          }).lean();
          assert.ok(audits.length);
          for (const mail of emails)
            assert.equal(JSON.stringify(audits).includes(mail.token), false);
        },
      );
    } finally {
      if (
        connection &&
        /^mmm_invitation_test_[a-f0-9]{16}$/.test(settings.mongodbDbName)
      )
        await connection.dropDatabase();
      await database.close();
    }
  },
);
