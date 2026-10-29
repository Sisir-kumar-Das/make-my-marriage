import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Types } from 'mongoose';
import { ApiError } from '../lib/api-error.js';
import { authModels } from '../auth/models.js';
import { weddingModels } from '../weddings/models.js';
import { taskModels } from '../tasks/models.js';
import { eventModels } from '../events/models.js';
import { invitationModels } from '../invitations/models.js';
import { idempotencyKeySchema } from '../weddings/validation.js';
import { indiaToday } from '../tasks/recurrence.js';
import { memberModels } from './models.js';
import {
  memberChangeInput,
  memberRemovalInput,
  memberRelationship,
  memberVersion,
} from './validation.js';
import { inspectRemoval, applyRemovalWork } from './removal-work.js';

const validId = (id) => typeof id === 'string' && /^[a-f\d]{24}$/.test(id);
const hash = (text) => createHash('sha256').update(text).digest('hex');
const missing = () =>
  new ApiError(404, 'MEMBER_NOT_FOUND', 'This member is not available.');
const adminRequired = () =>
  new ApiError(
    403,
    'ADMIN_REQUIRED',
    'Only an Admin can change member access.',
  );
const stale = () =>
  new ApiError(
    409,
    'MEMBER_PREVIEW_STALE',
    'Member details or affected work changed. Reload the latest details and confirm again.',
  );
const options = {
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
  maxCommitTimeMS: 5000,
};
function parse(schema, raw) {
  const result = schema.safeParse(raw);
  if (!result.success)
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Please check the member change details.',
    );
  return result.data;
}
export function signMemberPreview(settings, fingerprint, issuedAt) {
  if (!settings?.jwtSecret || settings.jwtSecret.length < 43)
    throw new ApiError(
      503,
      'MEMBER_CHANGE_UNAVAILABLE',
      'Member changes are temporarily unavailable.',
    );
  return createHmac('sha256', settings.jwtSecret)
    .update(`mmm:member-preview:v1:${issuedAt}:${fingerprint}`)
    .digest('hex');
}
export function checkMemberPreview(settings, fingerprint, token, instant) {
  const [issued, signature] = token.split('.');
  const age = instant.getTime() - Number(issued);
  if (
    !/^\d{13}$/.test(issued) ||
    !/^[a-f\d]{64}$/.test(signature || '') ||
    age < 0 ||
    age > 600000
  )
    throw stale();
  const expected = signMemberPreview(settings, fingerprint, issued);
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature)))
    throw stale();
}

export function createMemberManagement({
  database,
  settings,
  now = () => new Date(),
}) {
  async function context(
    connection,
    session,
    userId,
    weddingId,
    write = false,
  ) {
    const { User } = authModels(connection),
      { Wedding, WeddingMember } = weddingModels(connection);
    const eligible = {
      _id: userId,
      status: 'ACTIVE',
      emailVerifiedAt: { $ne: null },
    };
    const user = write
      ? await User.findOneAndUpdate(
          eligible,
          { $inc: { __v: 1 } },
          { session, returnDocument: 'after' },
        ).lean()
      : await User.findOne(eligible).session(session).lean();
    if (!user)
      throw new ApiError(401, 'SESSION_EXPIRED', 'Please sign in to continue.');
    const member = await WeddingMember.findOne({
      userId,
      weddingId,
      status: 'ACTIVE',
      role: { $in: ['ADMIN', 'FAMILY_MEMBER', 'VIEWER'] },
    })
      .session(session)
      .lean();
    if (!member) throw missing();
    // The shared wedding write serializes all role/last-Admin and repeat operations.
    // Returning the previous revision lets PATCH validate the preview it received.
    const wedding = write
      ? await Wedding.findOneAndUpdate(
          { _id: weddingId, deletedAt: null },
          { $inc: { memberRevision: 1 } },
          { session, returnDocument: 'before' },
        ).lean()
      : await Wedding.findOne({ _id: weddingId, deletedAt: null })
          .session(session)
          .lean();
    if (!wedding) throw missing();
    return { user, member, wedding };
  }
  async function target(connection, session, weddingId, memberId) {
    const member = await weddingModels(connection)
      .WeddingMember.findOne({
        _id: memberId,
        weddingId,
        status: 'ACTIVE',
        role: { $in: ['ADMIN', 'FAMILY_MEMBER', 'VIEWER'] },
      })
      .session(session)
      .lean();
    const user =
      member &&
      (await authModels(connection)
        .User.findOne({
          _id: member.userId,
          status: 'ACTIVE',
          emailVerifiedAt: { $ne: null },
        })
        .session(session)
        .lean());
    if (!member || !user) throw missing();
    return { member, user };
  }
  async function impact(
    connection,
    session,
    weddingId,
    member,
    instant,
    actorId,
  ) {
    const { User } = authModels(connection),
      { WeddingMember } = weddingModels(connection),
      { Task, TaskSeries } = taskModels(connection);
    const repeats = {
      weddingId,
      updatedBy: member.userId,
      active: true,
      endDate: { $gte: indiaToday(instant) },
    };
    const repeatCount =
      await TaskSeries.countDocuments(repeats).session(session);
    const sample = await TaskSeries.find(repeats)
      .select('_id template.title')
      .sort({ _id: 1 })
      .limit(5)
      .session(session)
      .lean();
    const openTaskCount = await Task.countDocuments({
      weddingId,
      assigneeIds: member.userId,
      status: { $in: ['TODO', 'IN_PROGRESS'] },
      deletedAt: null,
      recurrenceExcluded: { $ne: true },
    }).session(session);
    const pendingInvitations =
      member.role === 'ADMIN'
        ? await invitationModels(connection)
            .MemberInvitation.countDocuments({
              weddingId,
              invitedBy: member.userId,
              status: 'PENDING',
              expiresAt: { $gt: instant },
            })
            .session(session)
        : 0;
    const [admins] = await WeddingMember.aggregate([
      {
        $match: {
          weddingId: new Types.ObjectId(weddingId),
          status: 'ACTIVE',
          role: 'ADMIN',
        },
      },
      {
        $lookup: {
          from: User.collection.name,
          localField: 'userId',
          foreignField: '_id',
          as: 'account',
        },
      },
      { $unwind: '$account' },
      {
        $match: {
          'account.status': 'ACTIVE',
          'account.emailVerifiedAt': { $ne: null },
        },
      },
      {
        $facet: {
          count: [{ $count: 'total' }],
          candidates: [
            { $match: { userId: { $ne: member.userId } } },
            {
              $set: {
                isActor: { $eq: ['$userId', new Types.ObjectId(actorId)] },
              },
            },
            {
              $sort: {
                isActor: -1,
                'account.profile.displayName': 1,
                userId: 1,
              },
            },
            { $limit: 100 },
            {
              $project: {
                _id: 0,
                userId: { $toString: '$userId' },
                name: '$account.profile.displayName',
              },
            },
          ],
        },
      },
    ]).session(session);
    return {
      repeats,
      repeatCount,
      sample,
      openTaskCount,
      pendingInvitations,
      adminCount: admins?.count[0]?.total || 0,
      candidates: admins?.candidates || [],
    };
  }
  function fingerprint(actorId, wedding, member, current) {
    return JSON.stringify([
      actorId,
      String(wedding._id),
      String(member._id),
      member.__v || 0,
      wedding.memberRevision || 0,
      wedding.taskRevision || 0,
      member.role,
      member.relationship || null,
      current.repeatCount,
      current.openTaskCount,
      current.adminCount,
      current.pendingInvitations,
    ]);
  }
  async function read(userId, weddingId, memberId, query = {}) {
    if (!validId(weddingId) || !validId(memberId)) throw missing();
    if (Object.keys(query).length)
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'No preview filters are supported.',
      );
    const connection = await database.connect();
    let result;
    await connection.transaction(async (session) => {
      const actor = await context(connection, session, userId, weddingId);
      if (actor.member.role !== 'ADMIN') throw adminRequired();
      const current = await target(connection, session, weddingId, memberId),
        instant = now();
      const work = await impact(
        connection,
        session,
        weddingId,
        current.member,
        instant,
        userId,
      );
      const issued = String(instant.getTime());
      result = {
        member: {
          id: String(current.member._id),
          userId: String(current.member.userId),
          name: current.user.profile.displayName,
          role: current.member.role,
          relationship: current.member.relationship || null,
          isCreator:
            String(actor.wedding.createdBy) === String(current.member.userId),
          isYou: String(current.member.userId) === userId,
          version: current.member.__v || 0,
        },
        adminCount: work.adminCount,
        openTaskCount: work.openTaskCount,
        pendingInvitations: work.pendingInvitations,
        managedRepeats: {
          count: work.repeatCount,
          sample: work.sample.map((s) => ({
            id: String(s._id),
            title: s.template.title,
          })),
        },
        handoverCandidates: work.candidates,
        preview: `${issued}.${signMemberPreview(settings, fingerprint(userId, actor.wedding, current.member, work), issued)}`,
      };
    }, options);
    return result;
  }
  async function update(
    userId,
    weddingId,
    memberId,
    raw,
    versionHeader,
    rawKey,
  ) {
    if (!validId(weddingId) || !validId(memberId)) throw missing();
    const input = parse(memberChangeInput, raw),
      version = memberVersion(versionHeader),
      key = parse(idempotencyKeySchema, rawKey);
    const identity = { weddingId, userId, keyHash: hash(key) },
      requestHash = hash(JSON.stringify([memberId, version, input]));
    const connection = await database.connect(),
      { User } = authModels(connection),
      { Wedding, WeddingMember } = weddingModels(connection),
      { TaskSeries } = taskModels(connection),
      { MemberWriteRequest } = memberModels(connection);
    let result;
    await connection.transaction(async (session) => {
      const actor = await context(connection, session, userId, weddingId, true),
        instant = now();
      const receipt = await MemberWriteRequest.findOne({
        ...identity,
        expiresAt: { $gt: instant },
      })
        .session(session)
        .lean();
      if (receipt) {
        if (
          actor.member.role !== 'ADMIN' &&
          !(
            String(receipt.memberId) === String(actor.member._id) &&
            receipt.result.role !== 'ADMIN'
          )
        )
          throw adminRequired();
        if (receipt.requestHash !== requestHash)
          throw new ApiError(
            409,
            'IDEMPOTENCY_CONFLICT',
            'This retry key belongs to a different member change.',
          );
        result = {
          ...receipt.result,
          memberId: String(receipt.memberId),
          replayed: true,
        };
        return;
      }
      if (actor.member.role !== 'ADMIN') throw adminRequired();
      const current = await target(connection, session, weddingId, memberId),
        member = current.member;
      if ((member.__v || 0) !== version) throw stale();
      const relationship = memberRelationship(
        input,
        String(actor.wedding.createdBy) === String(member.userId),
      );
      const work = await impact(
        connection,
        session,
        weddingId,
        member,
        instant,
        userId,
      );
      checkMemberPreview(
        settings,
        fingerprint(userId, actor.wedding, member, work),
        input.preview,
        instant,
      );
      if (
        member.role === 'ADMIN' &&
        input.role !== 'ADMIN' &&
        work.adminCount <= 1
      )
        throw new ApiError(
          409,
          'LAST_ADMIN',
          'Every wedding must keep at least one active Admin. Promote another member first.',
        );
      const needsHandover =
        input.role === 'VIEWER' &&
        member.role !== 'VIEWER' &&
        work.repeatCount > 0;
      if (needsHandover) {
        if (
          !input.confirmHandover ||
          !input.handoverToUserId ||
          input.handoverToUserId === String(member.userId)
        )
          throw new ApiError(
            400,
            'HANDOVER_REQUIRED',
            'Choose another active Admin and confirm the repeat-rule handover.',
          );
        const recipient = await WeddingMember.findOne({
          weddingId,
          userId: input.handoverToUserId,
          status: 'ACTIVE',
          role: 'ADMIN',
        })
          .session(session)
          .lean();
        if (!recipient) throw stale();
        const locked = await User.updateOne(
          {
            _id: recipient.userId,
            status: 'ACTIVE',
            emailVerifiedAt: { $ne: null },
          },
          { $inc: { __v: 1 } },
          { session },
        );
        if (locked.matchedCount !== 1) throw stale();
        await WeddingMember.updateOne(
          { _id: recipient._id },
          { $inc: { __v: 1 } },
          { session },
        );
        await TaskSeries.updateMany(
          { ...work.repeats, generationIssue: 'OWNER_UNAVAILABLE' },
          { $set: { generationIssue: null, retryAt: null } },
          { session },
        );
        const changed = await TaskSeries.updateMany(
          work.repeats,
          { $set: { updatedBy: recipient.userId }, $inc: { __v: 1 } },
          { session },
        );
        if (changed.matchedCount !== work.repeatCount) throw stale();
        await Wedding.updateOne(
          { _id: weddingId },
          { $inc: { taskRevision: 1 } },
          { session },
        );
      } else if (input.handoverToUserId || input.confirmHandover) {
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          'Handover is only needed when an editor with active repeats becomes a Viewer.',
        );
      }
      if (
        member.role === input.role &&
        (member.relationship || null) === relationship
      )
        throw new ApiError(
          400,
          'NO_CHANGES',
          'Choose a different role or relationship before saving.',
        );
      if (String(member.userId) !== userId) {
        const eligible = await User.updateOne(
          {
            _id: member.userId,
            status: 'ACTIVE',
            emailVerifiedAt: { $ne: null },
          },
          { $inc: { __v: 1 } },
          { session },
        );
        if (eligible.matchedCount !== 1) throw missing();
      }
      const saved = await WeddingMember.updateOne(
        { _id: member._id, status: 'ACTIVE', __v: version },
        { $set: { role: input.role, relationship }, $inc: { __v: 1 } },
        { session },
      );
      if (saved.matchedCount !== 1) throw stale();
      await eventModels(connection).Activity.create(
        [
          {
            weddingId,
            actorId: userId,
            action: 'MEMBER_UPDATED',
            entityType: 'MEMBER',
            entityId: member._id,
            displaySnapshot: {
              label:
                `Member access updated: ${current.user.profile.displayName}`.slice(
                  0,
                  160,
                ),
            },
            memberChange: {
              fromRole: member.role,
              toRole: input.role,
              fromRelationship: member.relationship || null,
              toRelationship: relationship,
              repeatManagerId: needsHandover ? input.handoverToUserId : null,
              transferredRepeats: needsHandover ? work.repeatCount : 0,
            },
            createdAt: instant,
          },
        ],
        { session },
      );
      const outcome = {
        role: input.role,
        relationship,
        transferredRepeats: needsHandover ? work.repeatCount : 0,
      };
      await MemberWriteRequest.updateOne(
        identity,
        {
          $set: {
            memberId,
            requestHash,
            result: outcome,
            expiresAt: new Date(instant.getTime() + 86400000),
          },
        },
        { session, upsert: true },
      );
      result = { ...outcome, memberId, replayed: false };
    }, options);
    return result;
  }
  function removalFingerprint(actorId, wedding, member, work, baseline) {
    return JSON.stringify([
      'REMOVE',
      fingerprint(actorId, wedding, member, baseline),
      work.day,
      work.taskCount,
      work.ruleCount,
      work.tasks.map((task) => [String(task._id), task.__v || 0]),
      work.rules.map((rule) => [String(rule._id), rule.__v || 0]),
    ]);
  }
  async function readRemoval(userId, weddingId, memberId, query = {}) {
    if (!validId(weddingId) || !validId(memberId)) throw missing();
    if (Object.keys(query).length)
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'No removal preview filters are supported.',
      );
    const connection = await database.connect();
    let result;
    await connection.transaction(async (session) => {
      const actor = await context(connection, session, userId, weddingId);
      if (actor.member.role !== 'ADMIN') throw adminRequired();
      const { member, user } = await target(
          connection,
          session,
          weddingId,
          memberId,
        ),
        instant = now();
      const baseline = await impact(
        connection,
        session,
        weddingId,
        member,
        instant,
        userId,
      );
      const work = await inspectRemoval(
        connection,
        session,
        weddingId,
        member,
        instant,
      );
      const issued = String(instant.getTime());
      result = {
        member: {
          id: String(member._id),
          userId: String(member.userId),
          name: user.profile.displayName,
          role: member.role,
          relationship: member.relationship || null,
          isYou: String(member.userId) === userId,
          version: member.__v || 0,
        },
        lastAdmin: member.role === 'ADMIN' && baseline.adminCount <= 1,
        tooLarge: work.tooLarge,
        taskCount: work.taskCount,
        overdueCount: work.overdueCount,
        taskSample: work.tasks.slice(0, 5).map((task) => ({
          title: task.title,
          priority: task.priority,
          dueAt: task.dueAt ? new Date(task.dueAt).toISOString() : null,
          dueDateOnly: !!task.dueDateOnly,
          overdue: !!task.dueAt && new Date(task.dueAt) < instant,
        })),
        assignmentRules: work.assignmentRuleCount,
        managedRules: {
          count: baseline.repeatCount,
          sample: baseline.sample.map((rule) => ({
            title: rule.template.title,
          })),
        },
        handoverCandidates: baseline.candidates,
        pendingInvitations: baseline.pendingInvitations,
        preview: `${issued}.${signMemberPreview(settings, removalFingerprint(userId, actor.wedding, member, work, baseline), issued)}`,
      };
    }, options);
    return result;
  }
  async function remove(
    userId,
    weddingId,
    memberId,
    raw,
    versionHeader,
    rawKey,
  ) {
    if (!validId(weddingId) || !validId(memberId)) throw missing();
    const input = parse(memberRemovalInput, raw),
      version = memberVersion(versionHeader),
      key = parse(idempotencyKeySchema, rawKey);
    const identity = { weddingId, userId, keyHash: hash(key) },
      requestHash = hash(JSON.stringify(['REMOVE', memberId, version, input]));
    const connection = await database.connect(),
      { Wedding, WeddingMember } = weddingModels(connection),
      { User } = authModels(connection),
      { MemberRemovalRequest } = memberModels(connection);
    let result;
    await connection.transaction(async (session) => {
      const actor = await context(connection, session, userId, weddingId, true),
        instant = now();
      if (actor.member.role !== 'ADMIN') throw adminRequired();
      const receipt = await MemberRemovalRequest.findOne({
        ...identity,
        expiresAt: { $gt: instant },
      })
        .session(session)
        .lean();
      if (receipt) {
        if (receipt.requestHash !== requestHash)
          throw new ApiError(
            409,
            'IDEMPOTENCY_CONFLICT',
            'This retry key belongs to a different removal.',
          );
        result = {
          ...receipt.result,
          memberId: String(receipt.memberId),
          replayed: true,
        };
        return;
      }
      const { member, user } = await target(
        connection,
        session,
        weddingId,
        memberId,
      );
      if ((member.__v || 0) !== version) throw stale();
      const baseline = await impact(
          connection,
          session,
          weddingId,
          member,
          instant,
          userId,
        ),
        work = await inspectRemoval(
          connection,
          session,
          weddingId,
          member,
          instant,
        );
      checkMemberPreview(
        settings,
        removalFingerprint(userId, actor.wedding, member, work, baseline),
        input.preview,
        instant,
      );
      if (member.role === 'ADMIN' && baseline.adminCount <= 1)
        throw new ApiError(
          409,
          'LAST_ADMIN',
          'Every wedding must keep at least one active Admin. Promote another member first.',
        );
      if (work.tooLarge)
        throw new ApiError(
          409,
          'REMOVAL_TOO_LARGE',
          'Too much work is affected for one removal. Reassign some work in Tasks first, then reload this preview.',
        );
      const hasAssignments =
        work.taskCount > 0 || work.assignmentRules.length > 0;
      if (hasAssignments !== !!input.policy)
        throw new ApiError(
          400,
          'ASSIGNMENT_CHOICE_REQUIRED',
          'Explicitly choose reassignment or unassignment for the affected work.',
        );
      if (baseline.repeatCount > 0 !== !!input.handoverToUserId)
        throw new ApiError(
          400,
          'HANDOVER_REQUIRED',
          'Choose another active Admin for the affected repeat rules.',
        );
      async function lockRecipient(id, adminOnly = false) {
        if (id === String(member.userId))
          throw new ApiError(
            400,
            'INVALID_RECIPIENT',
            'Choose a different current member.',
          );
        const recipient = await WeddingMember.findOne({
          weddingId,
          userId: id,
          status: 'ACTIVE',
          role: {
            $in: adminOnly ? ['ADMIN'] : ['ADMIN', 'FAMILY_MEMBER', 'VIEWER'],
          },
        })
          .session(session)
          .lean();
        if (!recipient) throw stale();
        const account = await User.updateOne(
          { _id: id, status: 'ACTIVE', emailVerifiedAt: { $ne: null } },
          { $inc: { __v: 1 } },
          { session },
        );
        if (account.matchedCount !== 1) throw stale();
        await WeddingMember.updateOne(
          { _id: recipient._id },
          { $inc: { __v: 1 } },
          { session },
        );
      }
      if (input.replacementUserId) await lockRecipient(input.replacementUserId);
      if (input.handoverToUserId)
        await lockRecipient(input.handoverToUserId, true);
      if (String(member.userId) !== userId) {
        const eligible = await User.updateOne(
          {
            _id: member.userId,
            status: 'ACTIVE',
            emailVerifiedAt: { $ne: null },
          },
          { $inc: { __v: 1 } },
          { session },
        );
        if (eligible.matchedCount !== 1) throw missing();
      }
      await applyRemovalWork(
        connection,
        session,
        weddingId,
        userId,
        member,
        work,
        input,
        instant,
      );
      const saved = await WeddingMember.updateOne(
        { _id: member._id, weddingId, status: 'ACTIVE', __v: version },
        { $set: { status: 'REMOVED' }, $inc: { __v: 1 } },
        { session },
      );
      if (saved.matchedCount !== 1) throw stale();
      await Wedding.updateOne(
        { _id: weddingId },
        { $inc: { taskRevision: 1 } },
        { session },
      );
      const outcome = {
        status: 'REMOVED',
        changedTasks: work.tasks.length,
        assignmentRules: work.assignmentRules.length,
        managedRules: work.managedRules.length,
        policy: input.policy,
        removedAt: instant.toISOString(),
      };
      await eventModels(connection).Activity.create(
        [
          {
            weddingId,
            actorId: userId,
            action: 'MEMBER_REMOVED',
            entityType: 'MEMBER',
            entityId: member._id,
            displaySnapshot: {
              label: `Member access removed: ${user.profile.displayName}`.slice(
                0,
                160,
              ),
            },
            memberRemoval: {
              role: member.role,
              relationship: member.relationship || null,
              policy: input.policy,
              replacementUserId: input.replacementUserId,
              repeatManagerId: input.handoverToUserId,
              changedTasks: outcome.changedTasks,
              assignmentRules: outcome.assignmentRules,
              managedRules: outcome.managedRules,
            },
            createdAt: instant,
          },
        ],
        { session },
      );
      await MemberRemovalRequest.updateOne(
        identity,
        {
          $set: {
            memberId,
            requestHash,
            result: outcome,
            expiresAt: new Date(instant.getTime() + 86400000),
          },
        },
        { session, upsert: true },
      );
      result = { ...outcome, memberId, replayed: false };
    }, options);
    return result;
  }
  const safe =
    (fn) =>
    async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(
          503,
          'MEMBER_CHANGE_UNAVAILABLE',
          'Member changes are temporarily unavailable. Retry the unchanged request or reload the latest details.',
        );
      }
    };
  return {
    read: safe(read),
    update: safe(update),
    readRemoval: safe(readRemoval),
    remove: safe(remove),
  };
}
