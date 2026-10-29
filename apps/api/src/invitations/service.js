import { Types } from 'mongoose';
import { ApiError } from '../lib/api-error.js';
import { authModels } from '../auth/models.js';
import { weddingModels } from '../weddings/models.js';
import { eventModels } from '../events/models.js';
import { idempotencyKeySchema } from '../weddings/validation.js';
import { invitationModels } from './models.js';
import {
  invitationInput,
  invitationChange,
  invitationTokenInput,
  invitationPage,
  tokenSchema,
} from './validation.js';
import {
  hashInvitation,
  invitationToken,
  newInvitationToken,
  invitationUrl,
} from './tokens.js';

const validId = (value) =>
  typeof value === 'string' && /^[a-f\d]{24}$/.test(value);
const missing = () =>
  new ApiError(
    404,
    'INVITATION_NOT_FOUND',
    'This invitation is not available.',
  );
const invalid = (code, message) => new ApiError(409, code, message);
const transactionOptions = {
  readConcern: { level: 'snapshot' },
  maxCommitTimeMS: 5000,
};
function parse(schema, input) {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Please check the invitation details.',
      {
        fields: Object.fromEntries(
          parsed.error.issues.map((issue) => [
            issue.path[0] || 'form',
            issue.message,
          ]),
        ),
      },
    );
  return parsed.data;
}
export function invitationState(invite, instant) {
  return invite.status === 'PENDING' && new Date(invite.expiresAt) <= instant
    ? 'EXPIRED'
    : invite.status;
}
export function invitationRow(invite, instant) {
  return {
    id: String(invite._id),
    email: invite.email,
    role: invite.role,
    relationship: invite.relationship,
    status: invitationState(invite, instant),
    expiresAt: new Date(invite.expiresAt).toISOString(),
    createdAt: new Date(invite.createdAt).toISOString(),
    lastSentAt: new Date(invite.lastSentAt).toISOString(),
    delivery: invite.delivery,
    version: invite.__v || 0,
    retryAfterSeconds: Math.max(
      0,
      Math.ceil(
        (new Date(invite.lastSentAt).getTime() + 45000 - instant.getTime()) /
          1000,
      ),
    ),
  };
}
export function createInvitationService({
  database,
  settings,
  sendInvitation,
  now = () => new Date(),
}) {
  async function account(connection, userId, session, lock = false) {
    const { User } = authModels(connection);
    const query = {
      _id: userId,
      status: 'ACTIVE',
      emailVerifiedAt: { $ne: null },
    };
    const user = lock
      ? await User.findOneAndUpdate(
          query,
          { $inc: { __v: 1 } },
          { session, returnDocument: 'after' },
        ).lean()
      : await User.findOne(query).session(session).lean();
    if (!user)
      throw new ApiError(401, 'SESSION_EXPIRED', 'Please sign in to continue.');
    return user;
  }
  async function admin(connection, userId, weddingId, session, lock = false) {
    if (!validId(weddingId)) throw missing();
    const user = await account(connection, userId, session, lock);
    const { Wedding, WeddingMember } = weddingModels(connection);
    const query = { userId, weddingId, status: 'ACTIVE', role: 'ADMIN' };
    const member = lock
      ? await WeddingMember.findOneAndUpdate(
          query,
          { $inc: { __v: 1 } },
          { session, returnDocument: 'after' },
        ).lean()
      : await WeddingMember.findOne(query).session(session).lean();
    if (!member)
      throw new ApiError(
        403,
        'ADMIN_REQUIRED',
        'Only an Admin can manage invitations.',
      );
    const wedding = lock
      ? await Wedding.findOneAndUpdate(
          { _id: weddingId, deletedAt: null },
          { $inc: { memberRevision: 1 } },
          { session, returnDocument: 'after' },
        ).lean()
      : await Wedding.findOne({ _id: weddingId, deletedAt: null })
          .session(session)
          .lean();
    if (!wedding) throw missing();
    return { user, wedding };
  }
  async function list(userId, weddingId, raw = {}) {
    const { page } = parse(invitationPage, raw);
    const connection = await database.connect();
    const { MemberInvitation } = invitationModels(connection);
    let result;
    await connection.transaction(async (session) => {
      await admin(connection, userId, weddingId, session);
      const total = await MemberInvitation.countDocuments({
        weddingId,
      }).session(session);
      const pendingCount = await MemberInvitation.countDocuments({
        weddingId,
        status: 'PENDING',
        expiresAt: { $gt: now() },
      }).session(session);
      const totalPages = Math.ceil(total / 10),
        selected = Math.min(page, Math.max(1, totalPages));
      const rows = await MemberInvitation.find({ weddingId })
        .sort({ createdAt: -1, _id: -1 })
        .skip((selected - 1) * 10)
        .limit(10)
        .session(session)
        .lean();
      result = {
        invitations: rows.map((row) => invitationRow(row, now())),
        pendingCount,
        pagination: { page: selected, total, totalPages },
      };
    }, transactionOptions);
    return result;
  }
  async function copyLink(userId, weddingId, id) {
    if (!validId(id)) throw missing();
    const connection = await database.connect();
    let result;
    await connection.transaction(async (session) => {
      await admin(connection, userId, weddingId, session);
      const invite = await invitationModels(connection)
        .MemberInvitation.findOne({ _id: id, weddingId })
        .select('+nonce +tokenHash')
        .session(session)
        .lean();
      if (!invite || invitationState(invite, now()) !== 'PENDING')
        throw missing();
      const token = invitationToken(settings, invite._id, invite.nonce);
      if (hashInvitation(token) !== invite.tokenHash) throw missing();
      result = { url: invitationUrl(settings.webOrigin, token) };
    }, transactionOptions);
    return result;
  }
  // No account lookup is disclosed by this continuation helper.
  async function verificationContinuation(email, token) {
    if (!tokenSchema.safeParse(token).success) return undefined;
    const connection = await database.connect();
    const invite = await invitationModels(connection)
      .MemberInvitation.findOne({
        tokenHash: hashInvitation(token),
        emailNormalized: email,
        status: 'PENDING',
        expiresAt: { $gt: now() },
      })
      .lean();
    return invite ? token : undefined;
  }
  async function preview(raw) {
    const { token } = parse(invitationTokenInput, raw);
    const connection = await database.connect();
    let result;
    await connection.transaction(async (session) => {
      const invite = await invitationModels(connection)
        .MemberInvitation.findOne({ tokenHash: hashInvitation(token) })
        .select('+nonce +tokenHash')
        .session(session)
        .lean();
      if (!invite) {
        result = { state: 'INVALID' };
        return;
      }
      if (
        hashInvitation(invitationToken(settings, invite._id, invite.nonce)) !==
        invite.tokenHash
      ) {
        result = { state: 'INVALID' };
        return;
      }
      const state = invitationState(invite, now());
      if (state !== 'PENDING') {
        result = { state };
        return;
      }
      const { Wedding, WeddingMember } = weddingModels(connection);
      const wedding = await Wedding.findOne({
        _id: invite.weddingId,
        deletedAt: null,
      })
        .select('name mainDate location')
        .session(session)
        .lean();
      const issuer = await WeddingMember.findOne({
        weddingId: invite.weddingId,
        userId: invite.invitedBy,
        status: 'ACTIVE',
        role: 'ADMIN',
      })
        .session(session)
        .lean();
      const person =
        issuer &&
        (await authModels(connection)
          .User.findOne({
            _id: invite.invitedBy,
            status: 'ACTIVE',
            emailVerifiedAt: { $ne: null },
          })
          .select('profile.displayName')
          .session(session)
          .lean());
      if (!wedding || !person) {
        result = { state: 'UNAVAILABLE' };
        return;
      }
      result = {
        state,
        email: invite.email,
        role: invite.role,
        relationship: invite.relationship,
        expiresAt: new Date(invite.expiresAt).toISOString(),
        inviterName: person.profile.displayName,
        wedding: {
          name: wedding.name,
          mainDate: wedding.mainDate,
          city: wedding.location?.city || '',
        },
      };
    }, transactionOptions);
    return result;
  }
  async function dispatch(connection, invite, weddingName) {
    const { MemberInvitation } = invitationModels(connection);
    let delivery = 'FAILED';
    try {
      const token = invitationToken(settings, invite._id, invite.nonce);
      await sendInvitation({
        email: invite.email,
        token,
        tokenHash: invite.tokenHash,
        weddingName,
        role: invite.role,
        relationship: invite.relationship,
      });
      delivery = 'SUBMITTED';
    } catch {
      console.error('Invitation email submission failed.');
    }
    // A late SMTP result must not update a newer resend/revoked/accepted generation.
    await MemberInvitation.updateOne(
      { _id: invite._id, tokenHash: invite.tokenHash, status: 'PENDING' },
      { $set: { delivery } },
    ).catch(() => {});
    return delivery;
  }
  async function write(operation, userId, weddingId, id, raw, key) {
    const input = parse(
      operation === 'CREATE'
        ? invitationInput
        : operation === 'ACCEPT'
          ? invitationTokenInput
          : invitationChange,
      raw,
    );
    if (!idempotencyKeySchema.safeParse(key).success)
      throw new ApiError(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Please retry this invitation action.',
      );
    if (operation !== 'ACCEPT' && (!validId(weddingId) || (id && !validId(id))))
      throw missing();
    const keyHash = hashInvitation(key),
      requestHash = hashInvitation(
        JSON.stringify([operation, weddingId || '', id || '', input]),
      );
    const connection = await database.connect();
    const { MemberInvitation, InvitationWriteRequest } =
      invitationModels(connection);
    const { Wedding, WeddingMember } = weddingModels(connection);
    const { User } = authModels(connection);
    let result, mail, weddingName;
    async function execute(session) {
      mail = null;
      let actor, wedding;
      if (operation === 'ACCEPT')
        actor = await account(connection, userId, session, true);
      else
        ({ user: actor, wedding } = await admin(
          connection,
          userId,
          weddingId,
          session,
          true,
        ));
      const receipt = await InvitationWriteRequest.findOne({
        userId,
        keyHash,
        expiresAt: { $gt: now() },
      })
        .session(session)
        .lean();
      if (receipt) {
        if (receipt.requestHash !== requestHash)
          throw invalid(
            'IDEMPOTENCY_CONFLICT',
            'This attempt used different details. Refresh before trying again.',
          );
        if (operation === 'ACCEPT') {
          const active = await WeddingMember.findOne({
            userId,
            weddingId: receipt.weddingId,
            status: 'ACTIVE',
          })
            .session(session)
            .lean();
          const live = await Wedding.findOne({
            _id: receipt.weddingId,
            deletedAt: null,
          })
            .session(session)
            .lean();
          if (!active || !live) throw missing();
        }
        result =
          operation === 'ACCEPT'
            ? receipt.result
            : { ...receipt.result, replayed: true };
        return;
      }
      const instant = now();
      let invite;
      if (operation === 'CREATE') {
        const existingUser = await User.findOne({
          emailNormalized: input.email,
        })
          .select('_id')
          .session(session)
          .lean();
        if (
          existingUser &&
          (await WeddingMember.exists({
            weddingId,
            userId: existingUser._id,
            status: 'ACTIVE',
          }).session(session))
        )
          throw invalid(
            'ALREADY_MEMBER',
            'This person already belongs to your wedding.',
          );
        await MemberInvitation.updateMany(
          {
            weddingId,
            emailNormalized: input.email,
            status: 'PENDING',
            expiresAt: { $lte: instant },
          },
          { $set: { status: 'EXPIRED' }, $inc: { __v: 1 } },
          { session },
        );
        if (
          await MemberInvitation.exists({
            weddingId,
            emailNormalized: input.email,
            status: 'PENDING',
          }).session(session)
        )
          throw invalid(
            'INVITATION_EXISTS',
            'A pending invitation already exists for this email. Use its Resend or Copy Link action.',
          );
        const inviteId = new Types.ObjectId();
        const issued = newInvitationToken(settings, inviteId);
        [invite] = await MemberInvitation.create(
          [
            {
              _id: inviteId,
              weddingId,
              email: input.email,
              emailNormalized: input.email,
              role: input.role,
              relationship:
                input.relationshipChoice === 'OTHER'
                  ? input.customRelationship
                  : input.relationshipChoice,
              ...issued,
              invitedBy: userId,
              expiresAt: new Date(instant.getTime() + 7 * 86400000),
              lastSentAt: instant,
            },
          ],
          { session },
        );
        mail = invite.toObject();
        weddingName = wedding.name;
      } else if (operation === 'ACCEPT') {
        invite = await MemberInvitation.findOne({
          tokenHash: hashInvitation(input.token),
        })
          .select('+nonce +tokenHash')
          .session(session);
        if (!invite) throw missing();
        const state = invitationState(invite, instant);
        if (
          hashInvitation(
            invitationToken(settings, invite._id, invite.nonce),
          ) !== invite.tokenHash
        )
          throw missing();
        if (state !== 'PENDING')
          throw invalid(
            `INVITATION_${state}`,
            `This invitation is ${state.toLowerCase()}. Open the latest invitation or contact the Admin.`,
          );
        if (actor.emailNormalized !== invite.emailNormalized)
          throw new ApiError(
            403,
            'INVITATION_EMAIL_MISMATCH',
            'Sign in using the exact email address this invitation was sent to.',
          );
        // Serialize account membership against wedding creation/other acceptance and issuing-Admin changes.
        try {
          await admin(
            connection,
            String(invite.invitedBy),
            String(invite.weddingId),
            session,
            true,
          );
        } catch (failure) {
          if ([401, 403, 404].includes(failure.status))
            throw invalid(
              'INVITATION_UNAVAILABLE',
              'The inviting Admin or wedding is no longer available. Contact the wedding Admin.',
            );
          throw failure;
        }
        wedding = await Wedding.findOne({
          _id: invite.weddingId,
          deletedAt: null,
        })
          .session(session)
          .lean();
        if (!wedding) throw missing();
        if (
          await WeddingMember.exists({ userId, status: 'ACTIVE' }).session(
            session,
          )
        )
          throw invalid(
            'WEDDING_ALREADY_EXISTS',
            'You already belong to a wedding. Open your existing workspace.',
          );
        const relationship =
          String(wedding.createdBy) === String(userId)
            ? null
            : invite.relationship?.trim();
        if (relationship === '') throw missing();
        if (String(wedding.createdBy) !== String(userId) && !relationship)
          throw missing();
        const previous = await WeddingMember.findOne({
          weddingId: invite.weddingId,
          userId,
        }).session(session);
        if (previous) {
          previous.set({
            role: invite.role,
            relationship,
            financeAccess: false,
            status: 'ACTIVE',
            joinedAt: instant,
            createdBy: invite.invitedBy,
          });
          await previous.save({ session });
        } else
          await WeddingMember.create(
            [
              {
                weddingId: invite.weddingId,
                userId,
                role: invite.role,
                relationship,
                financeAccess: false,
                status: 'ACTIVE',
                joinedAt: instant,
                createdBy: invite.invitedBy,
              },
            ],
            { session },
          );
        invite.set({
          status: 'ACCEPTED',
          acceptedAt: instant,
          acceptedBy: userId,
        });
        await invite.save({ session });
      } else {
        invite = await MemberInvitation.findOne({ _id: id, weddingId })
          .select('+nonce +tokenHash')
          .session(session);
        if (!invite) throw missing();
        if (invite.__v !== input.version)
          throw invalid(
            'INVITATION_CHANGED',
            'This invitation changed. Refresh the list before trying again.',
          );
        if (!['PENDING', 'EXPIRED'].includes(invitationState(invite, instant)))
          throw invalid(
            'INVITATION_CHANGED',
            'This invitation is no longer pending. Refresh the list.',
          );
        if (operation === 'RESEND') {
          const seconds = Math.ceil(
            (invite.lastSentAt.getTime() + 45000 - instant.getTime()) / 1000,
          );
          if (seconds > 0)
            throw new ApiError(
              429,
              'INVITATION_COOLDOWN',
              `Please wait ${seconds} seconds before resending.`,
              { retryAfterSeconds: seconds },
            );
          if (
            await MemberInvitation.exists({
              _id: { $ne: invite._id },
              weddingId,
              emailNormalized: invite.emailNormalized,
              status: 'PENDING',
            }).session(session)
          )
            throw invalid(
              'INVITATION_EXISTS',
              'A newer pending invitation exists. Use that invitation instead.',
            );
          invite.set({
            ...newInvitationToken(settings, invite._id),
            invitedBy: userId,
            status: 'PENDING',
            expiresAt: new Date(instant.getTime() + 7 * 86400000),
            lastSentAt: instant,
            sendCount: invite.sendCount + 1,
            delivery: 'PENDING',
          });
        } else invite.status = 'REVOKED';
        await invite.save({ session });
        if (operation === 'RESEND') {
          mail = invite.toObject();
          weddingName = wedding.name;
        }
      }
      const targetWedding = invite.weddingId;
      await eventModels(connection).Activity.create(
        [
          {
            weddingId: targetWedding,
            actorId: userId,
            action: `INVITATION_${operation}`,
            entityType: 'MEMBER_INVITATION',
            entityId: invite._id,
            displaySnapshot: { label: 'Wedding collaborator invitation' },
            createdAt: instant,
          },
        ],
        { session },
      );
      result =
        operation === 'ACCEPT'
          ? { accepted: true, weddingId: String(targetWedding) }
          : { invitation: invitationRow(invite, instant) };
      await InvitationWriteRequest.findOneAndUpdate(
        { userId, keyHash },
        {
          $set: {
            requestHash,
            operation,
            weddingId: targetWedding,
            invitationId: invite._id,
            result,
            expiresAt: new Date(instant.getTime() + 86400000),
          },
        },
        { upsert: true, session },
      );
    }
    // Retrying unique-index collisions observes the winning receipt/state, never repeats SMTP.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await connection.transaction(execute, transactionOptions);
        break;
      } catch (error) {
        if (error.code !== 11000 || attempt === 2) throw error;
      }
    }
    if (mail) {
      const delivery = await dispatch(connection, mail, weddingName);
      result = { ...result, invitation: { ...result.invitation, delivery } };
    }
    return result;
  }
  const safe =
    (operation) =>
    async (...args) => {
      try {
        return await operation(...args);
      } catch (failure) {
        if (failure instanceof ApiError) throw failure;
        // Driver/SMTP failures can contain recipient details. Never expose their messages/stacks.
        console.error('Invitation operation failed.');
        throw new ApiError(
          503,
          'INVITATION_UNAVAILABLE',
          'We could not complete this invitation request. Please retry.',
        );
      }
    };
  return {
    list: safe(list),
    copyLink: safe(copyLink),
    preview: safe(preview),
    verificationContinuation: safe(verificationContinuation),
    create: safe((userId, weddingId, raw, key) =>
      write('CREATE', userId, weddingId, null, raw, key),
    ),
    resend: safe((userId, weddingId, id, raw, key) =>
      write('RESEND', userId, weddingId, id, raw, key),
    ),
    revoke: safe((userId, weddingId, id, raw, key) =>
      write('REVOKE', userId, weddingId, id, raw, key),
    ),
    accept: safe((userId, raw, key) =>
      write('ACCEPT', userId, null, null, raw, key),
    ),
  };
}
