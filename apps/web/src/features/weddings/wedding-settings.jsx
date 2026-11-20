'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  Check,
  Clock3,
  IndianRupee,
  PartyPopper,
  SlidersHorizontal,
} from 'lucide-react';
import { useSession } from '@/features/auth/session-provider';
import { WeddingSettingsLayout } from '@/features/dashboard/planning-previews';
import { apiRequest } from '@/lib/api-client';
import { newIdempotencyKey } from '@/lib/idempotency-key';
import {
  suggestedWeddingName,
  traditions,
  weddingDate,
  weddingToday,
} from './form-data';
import { DateChangeDialog } from './date-change-dialog';
import {
  settingsChanges,
  settingsDraft,
  settingsFields,
  settingsBudgetMinor,
  settingsBudgetLabel,
  settingsFieldErrors,
  settingsDateError,
} from './settings-data';
import styles from './settings.module.css';

export function WeddingSettings({ accountId }) {
  const session = useSession();
  if (session.user.id !== accountId) return null;
  return (
    <SettingsWorkspace
      key={`${accountId}/${session.wedding.id}`}
      session={session}
    />
  );
}

function SettingsWorkspace({ session }) {
  const notice = useRef(null);
  const [access, setAccess] = useState({
    role: session.membership.role,
    finance: session.membership.financeAccess,
    notice: '',
  });
  useEffect(() => {
    if (access.notice) notice.current?.scrollIntoView({ block: 'nearest' });
  }, [access.notice]);
  if (
    access.role !== session.membership.role ||
    access.finance !== session.membership.financeAccess
  ) {
    setAccess({
      role: session.membership.role,
      finance: session.membership.financeAccess,
      notice:
        session.membership.role === 'ADMIN'
          ? 'Your access changed. Review the latest settings before editing.'
          : 'Your access changed. Only Admins can save wedding settings. Review the saved details below.',
    });
  }
  const scope = [
    session.user.id,
    session.wedding.id,
    session.membership.role,
    session.membership.financeAccess,
  ].join('/');
  return (
    <WeddingSettingsLayout session={session}>
      <div className="min-w-0 space-y-4">
        {access.notice && (
          <p ref={notice} role="status" className={styles.notice}>
            {access.notice}
          </p>
        )}
        <SettingsForm
          key={scope}
          session={session}
          onAccessDenied={() =>
            setAccess((current) => ({
              ...current,
              notice:
                'Your settings could not be saved or reloaded because your access changed. Check your current permissions and the saved details.',
            }))
          }
          onAccessRestored={() =>
            setAccess((current) => ({ ...current, notice: '' }))
          }
        />
      </div>
    </WeddingSettingsLayout>
  );
}

function SettingsForm({ session, onAccessDenied, onAccessRestored }) {
  const { user, membership, connectionError, retrySession } = session;
  const editable = membership.role === 'ADMIN';
  const [saved, setSaved] = useState(session.wedding);
  const [draft, setDraft] = useState(() => settingsDraft(session.wedding));
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});
  const [feedback, setFeedback] = useState('');
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [denied, setDenied] = useState(false);
  const [conflict, setConflict] = useState(false);
  const lifetime = useRef(null);
  const busy = useRef(false);
  const feedbackFocus = useRef(null);
  const errorFocus = useRef(null);
  const recoveryFocus = useRef(null);
  const retryFocus = useRef(null);
  const reloadFocus = useRef(null);
  const endpoint = `/weddings/${saved.id}`;
  const dirty = Object.keys(settingsChanges(saved, draft)).length > 0;
  const budgetValue = editable
    ? draft.budget
    : saved.estimatedBudget
      ? settingsBudgetLabel(saved.estimatedBudget.amountMinor)
      : 'Not specified';
  const locked =
    pending ||
    !!confirmation ||
    !!retry ||
    !!connectionError ||
    conflict ||
    denied ||
    !editable;
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller.signal;
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (pending || !reloadFocus.current || lifetime.current?.aborted) return;
    const results =
      reloadFocus.current === 'feedback'
        ? [feedbackFocus.current]
        : reloadFocus.current === 'recovery'
          ? [recoveryFocus.current, errorFocus.current]
          : reloadFocus.current === 'retry'
            ? [retryFocus.current, errorFocus.current]
            : [errorFocus.current];
    const target = [...results, session.connectionErrorFocus?.current].find(
      (element) =>
        element?.isConnected &&
        !element.disabled &&
        !element.matches?.(':disabled') &&
        !element.closest?.('[inert]'),
    );
    if (target) {
      reloadFocus.current = null;
      target.focus();
    }
  }, [pending, feedback, error, connectionError, session.connectionErrorFocus]);
  // Keep an edited draft/version intact if a background session check discovers
  // another Admin's changes. Clean forms can adopt the latest confirmed record.
  if (!dirty && !pending && !retry && session.wedding.version > saved.version) {
    setSaved(session.wedding);
    setDraft(settingsDraft(session.wedding));
  }

  function edit(event) {
    if (locked) return;
    const { name, value } = event.target;
    setDraft((current) => ({ ...current, [name]: value }));
    setFields({});
    setError(null);
    setFeedback('');
  }
  function formatBudget() {
    if (locked) return;
    const amount = settingsBudgetMinor(draft.budget);
    if (amount !== null)
      setDraft((current) => ({
        ...current,
        budget: amount === undefined ? '' : settingsBudgetLabel(amount),
      }));
  }
  function discard() {
    if (pending || retry || confirmation) return;
    setDraft(settingsDraft(saved));
    setFields({});
    setFeedback('Unsaved changes discarded.');
    if (!conflict && !denied) setError(null);
  }
  async function reload() {
    const signal = lifetime.current;
    if (busy.current || retry || !signal || signal.aborted) return;
    busy.current = true;
    setPending(true);
    try {
      const { data } = await apiRequest(endpoint, { signal });
      if (signal.aborted) return;
      if (data.wedding.id !== saved.id || data.membership.role !== 'ADMIN') {
        reloadFocus.current = 'error';
        setDenied(true);
        setError({
          message:
            'Your access changed. Only current Admins can reload settings for editing.',
        });
        onAccessDenied();
        retrySession();
        return;
      }
      setSaved(data.wedding);
      setDraft(settingsDraft(data.wedding));
      setFields({});
      setError(null);
      setDenied(false);
      setConflict(false);
      setFeedback('Latest settings loaded. Review them before editing.');
      reloadFocus.current = 'feedback';
      onAccessRestored?.();
      session.applySavedWedding(user.id, data);
    } catch (failure) {
      if (!signal.aborted) {
        reloadFocus.current = 'error';
        setError(failure);
        if ([401, 403, 404].includes(failure.status)) {
          setDenied(true);
          onAccessDenied();
          retrySession();
        }
      }
    } finally {
      busy.current = false;
      if (!signal.aborted) setPending(false);
    }
  }
  async function save(event) {
    event.preventDefault();
    const signal = lifetime.current;
    if (
      busy.current ||
      confirmation ||
      !editable ||
      denied ||
      conflict ||
      connectionError ||
      !signal ||
      signal.aborted
    )
      return;
    let operation = retry;
    if (!operation) {
      const parsed = settingsFields.safeParse(draft);
      if (!parsed.success) {
        setFields(
          Object.fromEntries(
            parsed.error.issues.map((issue) => [issue.path[0], issue.message]),
          ),
        );
        setError({ message: 'Please check the highlighted wedding details.' });
        return;
      }
      const changes = settingsChanges(saved, parsed.data);
      if (!Object.keys(changes).length) return;
      const dateError = settingsDateError(saved, parsed.data);
      if (dateError) {
        setFields({ mainDate: dateError });
        setError({ message: 'Please check the highlighted wedding date.' });
        return;
      }
      operation = {
        body: JSON.stringify(changes),
        version: `"${saved.version}"`,
        key: newIdempotencyKey(),
      };
      if (changes.mainDate) {
        setError(null);
        setConfirmation({
          operation,
          oldDate: saved.mainDate,
          newDate: changes.mainDate,
        });
        return;
      }
    }
    return submitOperation(operation);
  }
  async function confirmSave() {
    if (
      !confirmation ||
      busy.current ||
      connectionError ||
      denied ||
      conflict ||
      !editable
    )
      return;
    // Midnight before the first dispatch still requires a fresh valid date.
    // Exact retries below bypass this client rule and let Express replay receipts.
    const message = settingsDateError(saved, {
      mainDate: confirmation.newDate,
    });
    if (message) {
      setConfirmation(null);
      setFields({ mainDate: message });
      setError({ message });
      return;
    }
    return submitOperation(confirmation.operation);
  }
  async function submitOperation(operation) {
    const signal = lifetime.current;
    if (
      busy.current ||
      !editable ||
      denied ||
      conflict ||
      connectionError ||
      !signal ||
      signal.aborted
    )
      return;
    busy.current = true;
    setPending(true);
    setFeedback('');
    setError(null);
    try {
      const { data } = await apiRequest(endpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': operation.version,
          'Idempotency-Key': operation.key,
        },
        body: operation.body,
        signal,
      });
      if (signal.aborted) return;
      if (data.wedding.id !== saved.id)
        throw new Error('The wedding context changed. Recheck your session.');
      setRetry(null);
      setSaved(data.wedding);
      setDraft(settingsDraft(data.wedding));
      setFeedback(
        data.replayed
          ? 'Your earlier save completed. Showing the current wedding settings.'
          : data.unchanged
            ? 'These settings are already up to date.'
            : 'Wedding settings saved.',
      );
      if (!confirmation) reloadFocus.current = 'feedback';
      onAccessRestored?.();
      session.applySavedWedding(user.id, data);
    } catch (failure) {
      if (signal.aborted) return;
      setError(failure);
      const changed =
        [409, 428].includes(failure.status) &&
        [
          'VERSION_CONFLICT',
          'VERSION_REQUIRED',
          'IDEMPOTENCY_CONFLICT',
        ].includes(failure.code);
      if (changed) setConflict(true);
      if (!confirmation)
        reloadFocus.current =
          changed || [401, 403, 404].includes(failure.status)
            ? 'recovery'
            : ![400, 401, 403, 404, 409, 428].includes(failure.status)
              ? 'retry'
              : 'error';
      if (failure.details?.fields)
        setFields(settingsFieldErrors(failure.details.fields));
      if (![400, 401, 403, 404, 409, 428].includes(failure.status))
        setRetry(operation);
      else {
        setRetry(null);
        if ([401, 403, 404].includes(failure.status)) {
          setDenied(true);
          onAccessDenied();
          retrySession();
        }
      }
    } finally {
      busy.current = false;
      if (!signal.aborted) {
        setPending(false);
        setConfirmation(null);
      }
    }
  }
  function field(
    name,
    label,
    {
      full = false,
      readOnly = false,
      value,
      icon: Icon,
      maxLength = 100,
      help,
    } = {},
  ) {
    return (
      <div className={full ? styles.full : undefined}>
        <label className={styles.field} htmlFor={`settings-${name}`}>
          {label}
          <span className={Icon ? styles.inputIcon : undefined}>
            <input
              id={`settings-${name}`}
              name={name}
              value={value ?? draft[name]}
              readOnly={readOnly || locked}
              onChange={edit}
              maxLength={maxLength}
              aria-invalid={!!fields[name]}
              aria-describedby={
                fields[name] ? `settings-${name}-error` : undefined
              }
            />
            {Icon && <Icon size={18} aria-hidden="true" />}
          </span>
        </label>
        {fields[name] && (
          <p id={`settings-${name}-error`} className={styles.fieldError}>
            {fields[name]}
          </p>
        )}
        {help && <p className={styles.help}>{help}</p>}
      </div>
    );
  }
  return (
    <form
      className={styles.card}
      onSubmit={save}
      aria-busy={pending}
      noValidate
    >
      <div className={styles.head}>
        <div>
          <h2>Wedding Details</h2>
          <p>
            Core ceremony attributes, naming conventions, and location setup.
          </p>
        </div>
        <SlidersHorizontal size={22} aria-hidden="true" />
      </div>
      <div className={styles.grid}>
        <div className={styles.full}>
          {field('name', 'Wedding Workspace Title', {
            maxLength: 160,
            icon: PartyPopper,
            help: 'Shown prominently across invitations, timelines, and collaborator emails.',
          })}
          {editable && (
            <button
              type="button"
              className={styles.generate}
              disabled={
                locked ||
                draft.brideName.trim().length < 2 ||
                draft.groomName.trim().length < 2
              }
              onClick={() => {
                setDraft((current) => ({
                  ...current,
                  name: suggestedWeddingName(
                    current.brideName,
                    current.groomName,
                  ),
                }));
                setFields({});
                setFeedback('');
                setError(null);
              }}
            >
              Generate from names
            </button>
          )}
        </div>
        {field('brideName', 'Bride Name')}
        {field('groomName', 'Groom Name')}
        {editable ? (
          <div>
            <label className={styles.field} htmlFor="settings-mainDate">
              Main Wedding Date
              <input
                id="settings-mainDate"
                name="mainDate"
                type="date"
                value={draft.mainDate}
                min={weddingToday()}
                max="9999-12-31"
                readOnly={locked}
                onChange={edit}
                aria-invalid={!!fields.mainDate}
                aria-describedby={
                  fields.mainDate
                    ? 'settings-mainDate-note settings-mainDate-error'
                    : 'settings-mainDate-note'
                }
              />
            </label>
            <p id="settings-mainDate-note" className={styles.help}>
              Choose today or a future date in India. Date changes need
              confirmation before saving.
            </p>
            {fields.mainDate && (
              <p id="settings-mainDate-error" className={styles.fieldError}>
                {fields.mainDate}
              </p>
            )}
          </div>
        ) : (
          field('date', 'Main Wedding Date', {
            value: weddingDate(saved.mainDate),
            readOnly: true,
            icon: CalendarDays,
          })
        )}
        <div className={styles.field}>
          <label htmlFor="settings-tradition">Ceremonial Tradition</label>
          <select
            id="settings-tradition"
            name="tradition"
            value={draft.tradition}
            onChange={edit}
            disabled={locked}
            aria-invalid={!!fields.tradition}
            aria-describedby={
              fields.tradition ? 'settings-tradition-error' : undefined
            }
          >
            {traditions.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          {fields.tradition && (
            <p id="settings-tradition-error" className={styles.fieldError}>
              {fields.tradition}
            </p>
          )}
        </div>
        <div className={`${styles.full} ${styles.location}`}>
          {field('city', 'City')}
          {field('state', 'State')}
          {field('country', 'Country', { value: 'India', readOnly: true })}
        </div>
        <div className={styles.full}>
          <p className="mb-1.5 text-sm">Workspace Timezone</p>
          <div className={styles.timezone}>
            <Clock3 size={20} aria-hidden="true" />
            <div>
              Asia/Kolkata (IST, UTC+5:30)
              <p className={styles.help}>
                Wedding schedules and deadlines use India time.
              </p>
            </div>
          </div>
        </div>
        {membership.financeAccess && !denied && (
          <div className={`${styles.full} ${styles.budget}`}>
            <div className={styles.budgetHead}>
              <label htmlFor="settings-budget">
                <IndianRupee size={18} aria-hidden="true" />
                Estimated Overall Budget (Optional)
              </label>
              {editable && <span className={styles.badge}>Admin Only</span>}
            </div>
            <div className={styles.field}>
              <input
                id="settings-budget"
                name="budget"
                inputMode="decimal"
                maxLength={40}
                value={budgetValue}
                className={
                  budgetValue.length > 24 ? styles.longBudget : undefined
                }
                readOnly={locked}
                onChange={edit}
                onBlur={formatBudget}
                placeholder="Not specified"
                aria-invalid={!!fields.budget}
                aria-describedby={
                  fields.budget
                    ? 'settings-budget-note settings-budget-error'
                    : 'settings-budget-note'
                }
              />
            </div>
            {fields.budget && (
              <p id="settings-budget-error" className={styles.fieldError}>
                {fields.budget}
              </p>
            )}
            <p className={styles.help} id="settings-budget-note">
              <strong>Note</strong> A single high-level budget reference for
              planning purposes. Expenses, invoices and vendor payments are
              planned for a later version.
            </p>
          </div>
        )}
      </div>
      {error && (
        <div
          id="settings-save-error"
          ref={errorFocus}
          tabIndex={-1}
          role="alert"
          className={`${styles.notice} ${styles.error}`}
        >
          <p>{error.message}</p>
          {retry && (
            <p>
              Your save may have completed. Retry the unchanged save to check
              its result. Your details are kept in this tab.
            </p>
          )}
          {(conflict || denied) && (
            <button
              id="settings-reload-latest"
              ref={recoveryFocus}
              type="button"
              onClick={reload}
              disabled={pending || !!connectionError}
            >
              Discard draft and load latest
            </button>
          )}
        </div>
      )}
      {feedback && (
        <p
          id="settings-save-feedback"
          ref={feedbackFocus}
          tabIndex={-1}
          role="status"
          className={styles.notice}
        >
          {feedback}
        </p>
      )}
      {editable && (
        <div className={styles.actions}>
          <button
            type="button"
            onClick={discard}
            disabled={!dirty || pending || !!retry || !!confirmation}
          >
            Discard Changes
          </button>
          <button
            ref={retryFocus}
            id="settings-save-button"
            className={styles.save}
            type="submit"
            disabled={
              pending ||
              !!confirmation ||
              (!dirty && !retry) ||
              !!connectionError ||
              conflict ||
              denied
            }
          >
            <Check size={18} aria-hidden="true" />
            {pending
              ? 'Saving…'
              : retry
                ? 'Retry unchanged save'
                : 'Save Wedding Settings'}
          </button>
        </div>
      )}
      <DateChangeDialog
        change={confirmation}
        pending={pending}
        connectionError={connectionError}
        onCancel={() => {
          if (!busy.current) setConfirmation(null);
        }}
        onConfirm={confirmSave}
        getCloseFocus={() => {
          const candidates =
            conflict || denied
              ? [recoveryFocus.current, errorFocus.current]
              : retry
                ? [retryFocus.current, errorFocus.current]
                : error
                  ? [errorFocus.current]
                  : feedback
                    ? [feedbackFocus.current]
                    : [];
          return (
            [...candidates, session.connectionErrorFocus?.current].find(
              (target) =>
                target?.isConnected &&
                !target.disabled &&
                !target.closest?.('[inert]'),
            ) ?? null
          );
        }}
      />
    </form>
  );
}
