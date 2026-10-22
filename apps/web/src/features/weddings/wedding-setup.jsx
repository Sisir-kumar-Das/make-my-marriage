'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  Heart,
  Info,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { Brand } from '@/features/home/brand';
import { inter, playfair } from '@/features/home/fonts';
import { LogoutButton } from '@/features/auth/session-provider';
import { Field, FormError } from '@/features/auth/form-controls';
import { apiRequest } from '@/lib/api-client';
import { SetupComplete, WeddingReview } from './setup-review';
import {
  setupSchemaForSubmission,
  suggestedWeddingName,
  traditions,
  weddingInput,
  weddingToday,
} from './form-data';
import styles from './weddings.module.css';

const steps = ['Your Wedding', 'Place & Tradition', 'Cover & Review'];
const groups = [
  ['brideName', 'groomName', 'name', 'mainDate'],
  ['city', 'state', 'tradition', 'budget'],
];

export function WeddingSetup() {
  const [step, setStep] = useState(0);
  const [nameEdited, setNameEdited] = useState(false);
  const [created, setCreated] = useState(null);
  const [existing, setExisting] = useState(false);
  const heading = useRef(null);
  const submission = useRef(null);
  const {
    register,
    control,
    trigger,
    handleSubmit,
    setValue,
    getValues,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: (values, context, options) =>
      zodResolver(setupSchemaForSubmission(submission.current))(
        values,
        context,
        options,
      ),
    shouldUnregister: false,
    defaultValues: {
      name: '',
      brideName: '',
      groomName: '',
      mainDate: '',
      city: '',
      state: '',
      tradition: 'ODIA',
      budget: '',
    },
  });
  const values = useWatch({ control });
  const previewName =
    values.name ||
    suggestedWeddingName(values.brideName, values.groomName) ||
    'Your wedding celebration';
  useEffect(() => {
    heading.current?.focus();
  }, [step, created]);

  function coupleField(key) {
    const field = register(key);
    return {
      ...field,
      onChange(event) {
        field.onChange(event);
        if (!nameEdited)
          setValue(
            'name',
            suggestedWeddingName(
              getValues('brideName'),
              getValues('groomName'),
            ),
          );
      },
    };
  }
  async function next() {
    if (await trigger(groups[step], { shouldFocus: true })) {
      clearErrors('root');
      setStep(step + 1);
    }
  }
  async function create(values) {
    setExisting(false);
    const body = JSON.stringify(weddingInput(values, submission.current));
    if (submission.current?.body !== body)
      submission.current = { body, key: crypto.randomUUID() };
    try {
      const result = await apiRequest('/weddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': submission.current.key,
        },
        body,
        timeoutMs: 20000,
      });
      setCreated(result.data.wedding);
    } catch (failure) {
      if (
        failure.code === 'WEDDING_ALREADY_EXISTS' ||
        failure.code === 'IDEMPOTENCY_CONFLICT'
      )
        setExisting(true);
      const map = {
        'location.city': 'city',
        'location.state': 'state',
        'estimatedBudget.amountMinor': 'budget',
      };
      for (const [key, message] of Object.entries(
        failure.details?.fields || {},
      )) {
        const field = map[key] || key;
        if ([...groups[0], ...groups[1]].includes(field))
          setError(field, { message });
      }
      setError('root', { message: failure.message });
    }
  }
  function invalid(fields) {
    setStep(groups[0].some((key) => fields[key]) ? 0 : 1);
  }
  const titleRegistration = register('name');

  function goBack(index) {
    clearErrors('root');
    setStep(index);
  }

  return (
    <div
      className={[
        styles.page,
        styles.setupPage,
        inter.variable,
        playfair.variable,
      ].join(' ')}
    >
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <div className={styles.brandLockup}>
            <Brand href="/" className="!w-28" />
            <span className={styles.heading}>Make My Marriage</span>
          </div>
          <nav aria-label="Setup navigation" className={styles.setupNav}>
            <Link href="/">Overview</Link>
            <button type="button" disabled title="Coming soon">
              Concierge support <span>Coming soon</span>
            </button>
          </nav>
          <LogoutButton />
        </div>
      </header>
      <main id="main-content" className={styles.setupMain}>
        {created ? (
          <SetupComplete wedding={created} headingRef={heading} />
        ) : (
          <>
            <div className={styles.policyBanner}>
              <Info size={20} aria-hidden="true" />
              <p>
                <strong>One wedding, one shared space.</strong> Each account
                belongs to one active wedding in V1. You’ll become its Admin
                when you create it.
              </p>
              <span className={styles.invitePreview}>
                Arrived via invitation?
                <button type="button" disabled>
                  Accept invite · coming soon
                </button>
              </span>
            </div>
            {step === 2 && (
              <div className={styles.reviewIntro}>
                <div className="min-w-0">
                  <p className={styles.eyebrow}>
                    Your celebration / Final review
                  </p>
                  <h1
                    ref={heading}
                    tabIndex={-1}
                    className={`${styles.heading} ${styles.reviewTitle}`}
                  >
                    {previewName}
                  </h1>
                  <p className={styles.description}>
                    Review your details and choose your cover before creating
                    your workspace.
                  </p>
                </div>
                <SetupProgress
                  step={step}
                  onBack={goBack}
                  busy={isSubmitting}
                  compact
                />
              </div>
            )}
            <section
              className={step < 2 ? styles.wizardCard : undefined}
              aria-label="Wedding setup"
            >
              {step < 2 && (
                <header className={styles.wizardHeader}>
                  <div className={styles.genesisRow}>
                    <div className={styles.genesisBrand}>
                      <Brand href="/" className="!w-28" />
                      <span>Workspace genesis</span>
                    </div>
                    <span className={styles.setupTime}>
                      <Clock3 size={14} aria-hidden="true" /> Estimated setup:{' '}
                      <strong>2 minutes</strong>
                    </span>
                  </div>
                  <h1 className={`${styles.heading} ${styles.wizardTitle}`}>
                    Create your celebration sanctuary
                  </h1>
                  <p className={styles.wizardDescription}>
                    Bring your wedding details, meaningful traditions and family
                    plans together in one private workspace.
                  </p>
                  <SetupProgress
                    step={step}
                    onBack={goBack}
                    busy={isSubmitting}
                  />
                </header>
              )}
              <form
                onSubmit={(event) => {
                  if (step !== 2) {
                    event.preventDefault();
                    void next();
                  } else void handleSubmit(create, invalid)(event);
                }}
                noValidate
                className={step < 2 ? styles.formBody : styles.reviewForm}
              >
                <fieldset disabled={isSubmitting} className="min-w-0">
                  {step < 2 && (
                    <div className={styles.formHeading}>
                      <span className={styles.softBadge}>
                        {step === 0 ? (
                          <Heart size={14} aria-hidden="true" />
                        ) : (
                          <MapPin size={14} aria-hidden="true" />
                        )}
                        {step === 0 ? 'Core identities' : 'Place & tradition'}
                      </span>
                      <h2 ref={heading} tabIndex={-1}>
                        {step === 0
                          ? 'The Couple & Workspace Name'
                          : 'Location, Rituals & Estimated Budget'}
                      </h2>
                      <p className={styles.description}>
                        {step === 0
                          ? 'Give your wedding a name that feels like the two of you.'
                          : 'A little local context to make your wedding workspace feel at home.'}
                      </p>
                    </div>
                  )}
                  {step === 0 && (
                    <div className={styles.fieldGrid}>
                      <Field
                        id="bride-name"
                        label="Bride’s full name"
                        autoComplete="off"
                        maxLength={100}
                        required
                        {...coupleField('brideName')}
                        error={errors.brideName?.message}
                        placeholder="e.g. Priyanka Das"
                      />
                      <Field
                        id="groom-name"
                        label="Groom’s full name"
                        autoComplete="off"
                        maxLength={100}
                        required
                        {...coupleField('groomName')}
                        error={errors.groomName?.message}
                        placeholder="e.g. Sisir Das"
                      />
                      <div className={styles.fullWidth}>
                        <div className={styles.titleFieldHeading}>
                          <label htmlFor="wedding-name">
                            Wedding workspace title
                          </label>
                          <button
                            type="button"
                            className={styles.textButton}
                            onClick={() => {
                              setNameEdited(false);
                              setValue(
                                'name',
                                suggestedWeddingName(
                                  getValues('brideName'),
                                  getValues('groomName'),
                                ),
                                { shouldValidate: true },
                              );
                            }}
                          >
                            Generate from names
                          </button>
                        </div>
                        <input
                          id="wedding-name"
                          maxLength={160}
                          required
                          {...titleRegistration}
                          onChange={(event) => {
                            setNameEdited(true);
                            titleRegistration.onChange(event);
                          }}
                          aria-invalid={!!errors.name}
                          aria-describedby={
                            errors.name
                              ? 'wedding-name-error'
                              : 'wedding-name-hint'
                          }
                          placeholder="Your wedding name"
                        />
                        {errors.name && (
                          <p
                            role="alert"
                            id="wedding-name-error"
                            className={styles.fieldError}
                          >
                            {errors.name.message}
                          </p>
                        )}
                        <p id="wedding-name-hint" className={styles.fieldHint}>
                          Shown in your workspace. Make it yours—you can edit
                          the suggested name.
                        </p>
                      </div>
                      <div>
                        <Field
                          id="wedding-date"
                          label="Main wedding date"
                          type="date"
                          min={weddingToday()}
                          required
                          {...register('mainDate')}
                          error={errors.mainDate?.message}
                        />
                        <p className={styles.fieldHint}>
                          Choose today or a future date (India time). Other
                          ceremonies can be added separately.
                        </p>
                      </div>
                      <div className={styles.dateHelper}>
                        <p>
                          Quick date helper{' '}
                          <span className={styles.comingSoon}>Coming soon</span>
                        </p>
                        <button type="button" disabled>
                          Suggested dates
                        </button>
                        <p className={styles.fieldHint}>
                          For now, choose the date that’s right for your
                          celebration.
                        </p>
                      </div>
                    </div>
                  )}
                  {step === 1 && (
                    <div className={styles.fieldGrid}>
                      <Field
                        id="wedding-city"
                        label="City"
                        autoComplete="address-level2"
                        maxLength={100}
                        required
                        {...register('city')}
                        error={errors.city?.message}
                        placeholder="e.g. Bhubaneswar"
                      />
                      <Field
                        id="wedding-state"
                        label="State / province"
                        autoComplete="address-level1"
                        maxLength={100}
                        required
                        {...register('state')}
                        error={errors.state?.message}
                        placeholder="e.g. Odisha"
                      />
                      <div>
                        <label
                          htmlFor="wedding-country"
                          className={styles.fieldLabel}
                        >
                          Country
                        </label>
                        <input
                          id="wedding-country"
                          value="India (IN)"
                          readOnly
                          aria-describedby="country-hint"
                        />
                        <p id="country-hint" className={styles.fieldHint}>
                          India is the default for this first version.
                        </p>
                      </div>
                      <div>
                        <label
                          htmlFor="wedding-tradition"
                          className={styles.fieldLabel}
                        >
                          Wedding tradition & ritual set
                        </label>
                        <select
                          id="wedding-tradition"
                          required
                          {...register('tradition')}
                          aria-invalid={!!errors.tradition}
                          aria-describedby={
                            errors.tradition
                              ? 'tradition-error'
                              : 'tradition-hint'
                          }
                        >
                          {traditions.map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                        {errors.tradition && (
                          <p
                            role="alert"
                            id="tradition-error"
                            className={styles.fieldError}
                          >
                            {errors.tradition.message}
                          </p>
                        )}
                        <p id="tradition-hint" className={styles.fieldHint}>
                          A starting point for the traditions you’ll celebrate.
                        </p>
                      </div>
                      <div className={styles.fullWidth}>
                        <Field
                          id="wedding-budget"
                          label="Estimated budget in INR (optional)"
                          inputMode="decimal"
                          maxLength={20}
                          {...register('budget')}
                          error={errors.budget?.message}
                          placeholder="e.g. 350000"
                        />
                        <p className={styles.fieldHint}>
                          An optional high-level reference for the Admin. You
                          can leave this blank.
                        </p>
                      </div>
                      <div
                        className={`${styles.timezoneNote} ${styles.fullWidth}`}
                      >
                        <Clock3 size={21} aria-hidden="true" />
                        <div>
                          <strong>Workspace timezone default</strong>
                          <p>Asia/Kolkata · IST (UTC+5:30)</p>
                          <p className={styles.fieldHint}>
                            Keep your main date and wedding location in the same
                            local time.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {step === 2 && (
                    <div className={styles.reviewGrid}>
                      <WeddingReview values={values} onEdit={goBack} />
                    </div>
                  )}
                  <div
                    className={step === 2 ? styles.reviewActions : undefined}
                  >
                    {errors.root && (
                      <div className={styles.errorArea}>
                        <FormError message={errors.root.message} />
                        {existing && (
                          <Link href="/dashboard" className={styles.textButton}>
                            Open your existing workspace
                          </Link>
                        )}
                      </div>
                    )}
                    <div className={styles.formActions}>
                      {step > 0 ? (
                        <button
                          type="button"
                          className={styles.backButton}
                          onClick={() => goBack(step - 1)}
                        >
                          <ArrowLeft size={16} aria-hidden="true" />
                          {step === 2
                            ? 'Return to step 2'
                            : 'Back to your wedding'}
                        </button>
                      ) : (
                        <span className={styles.footerHint}>
                          <ShieldCheck size={15} aria-hidden="true" />
                          Your plans begin with you.
                        </span>
                      )}
                      {step < 2 ? (
                        <button
                          key="continue-step"
                          type="button"
                          className={styles.primaryButton}
                          onClick={(event) => {
                            // Cancel the click before Continue is replaced by the final submit button.
                            event.preventDefault();
                            void next();
                          }}
                        >
                          Continue to{' '}
                          {step === 0 ? 'Place & Tradition' : 'Cover & Review'}
                          <ArrowRight size={17} aria-hidden="true" />
                        </button>
                      ) : (
                        <button
                          key="create-wedding"
                          type="submit"
                          className={styles.primaryButton}
                          disabled={isSubmitting}
                        >
                          <Heart size={17} aria-hidden="true" />
                          {isSubmitting
                            ? 'Creating your wedding…'
                            : 'Create wedding workspace'}
                        </button>
                      )}
                    </div>
                  </div>
                </fieldset>
              </form>
            </section>
            <p className={styles.saveNote}>
              Your details are saved only when you select Create wedding
              workspace.
            </p>
          </>
        )}
      </main>
      <footer className={styles.siteFooter}>
        <p>
          © {new Date().getFullYear()} Make My Marriage. A little more
          organized. A lot more present.
        </p>
        <div>
          <button type="button" disabled>
            Privacy policy · coming soon
          </button>
          <button type="button" disabled>
            Client care · coming soon
          </button>
        </div>
      </footer>
    </div>
  );
}

function SetupProgress({ step, onBack, busy, compact = false }) {
  return (
    <ol
      aria-label="Wedding setup progress"
      className={compact ? styles.compactProgress : styles.progress}
    >
      {steps.map((label, index) => (
        <li key={label} aria-current={step === index ? 'step' : undefined}>
          <button
            type="button"
            disabled={busy || index >= step}
            onClick={() => onBack(index)}
            className={step === index ? styles.currentStep : undefined}
          >
            <span className={styles.stepNumber}>
              {index < step ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                index + 1
              )}
            </span>
            <span>
              <span className={styles.stepLabel}>Step {index + 1}</span>
              <strong>{label}</strong>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
