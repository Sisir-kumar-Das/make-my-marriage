'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  BookOpen,
  Check,
  ChevronRight,
  Info,
  ListChecks,
  RefreshCw,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { ComingSoon, PageHeader } from '@/features/dashboard/workspace-ui';
import styles from './checklist.module.css';
import { GenerateTasks } from './generate-tasks';
import { GenerationHistory } from './generation-history';

const artwork = {
  'initial-planning': [
    '/images/sample-couple.webp',
    'Couple preparing for their wedding celebration',
  ],
  'venue-logistics': [
    '/images/checklist/venue-logistics.jpg',
    'Wedding venue with banquet seating and floral decoration',
  ],
  'photography-video': [
    '/images/checklist/photography-video.jpg',
    'Camera equipment for wedding photography and video',
  ],
  'attire-jewellery': [
    '/images/checklist/attire-jewellery.jpg',
    'Wedding jewellery and embroidered attire',
  ],
  'odia-rituals': [
    '/images/checklist/odia-rituals.jpg',
    'Traditional wedding ceremony preparations',
  ],
};
const priorityNames = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };

function Artwork({ id, count }) {
  const [src, alt] = artwork[id];
  return (
    <div
      className={`${styles.artwork} ${id === 'initial-planning' ? styles.coupleArtwork : ''}`}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 600px) 90vw, (max-width: 1100px) 42vw, 24vw"
      />
      {count != null && <span className={styles.taskCount}>{count} tasks</span>}
    </div>
  );
}

export function ChecklistCatalog() {
  const [generationVersion, setGenerationVersion] = useState(0);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const previewHeading = useRef(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void apiRequest('/checklist-templates', { signal: controller.signal })
      .then((response) => {
        if (active) setResult({ key: retry, data: response.data });
      })
      .catch((error) => {
        if (active) setResult({ key: retry, error: error.message });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [retry]);
  useEffect(() => {
    if (!selectedId) return;
    previewHeading.current?.focus({ preventScroll: true });
    previewHeading.current?.scrollIntoView({ block: 'start' });
  }, [selectedId]);
  const loading = result?.key !== retry;
  const templates = result?.data?.templates || [];
  const selected =
    templates.find((template) => template.id === selectedId) || templates[0];

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Master wedding plan · Template catalog"
        title="Checklist Templates"
        description="Thoughtful starting points for your wedding preparations. Find the planning pack that fits your next step."
      >
        <Link className={styles.secondary} href="/tasks">
          <ListChecks size={16} /> Back to Tasks
        </Link>
      </PageHeader>
      <nav className={styles.tabs} aria-label="Checklist navigation">
        <Link href="/tasks">All Tasks</Link>
        <Link href="/tasks?view=my">My Tasks</Link>
        <Link href="/checklist" aria-current="page">
          Checklist Templates
        </Link>
      </nav>
      <section
        className={styles.introduction}
        aria-label="Explore planning templates"
      >
        <div>
          <p className={styles.eyebrow}>
            <BookOpen size={15} /> Pre-configured wedding blueprints
          </p>
          <h2>Curated planning packs</h2>
          <p>Explore the tasks before adding them to your wedding plan.</p>
        </div>
        <div className={styles.previewNote}>
          <Info size={21} aria-hidden="true" />
          <div>
            <strong>Preview at your own pace</strong>
            <p>
              Review and confirm when you’re ready to add tasks to your wedding
              plan.
            </p>
          </div>
        </div>
      </section>
      {loading ? (
        <div className={styles.state} role="status">
          Loading template catalog…
        </div>
      ) : result?.error ? (
        <section className={styles.error} role="alert">
          <h2>We couldn’t load the template catalog.</h2>
          <p>{result.error}</p>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => setRetry((value) => value + 1)}
          >
            <RefreshCw size={15} /> Retry catalog
          </button>
        </section>
      ) : !templates.length ? (
        <section className={styles.state}>
          <h2>No templates available yet.</h2>
          <p>Check back for planning packs.</p>
        </section>
      ) : (
        <div className={styles.layout}>
          <section
            aria-label="Planning template catalog"
            className={styles.catalog}
          >
            <div className={styles.sectionHeading}>
              <h2>Template catalog</h2>
              <span>{templates.length} packs to explore</span>
            </div>
            <div className={styles.cards}>
              {templates.map((template) => (
                <article
                  className={`${styles.card} ${selected.id === template.id ? styles.selected : ''}`}
                  key={template.id}
                >
                  <Artwork id={template.id} count={template.itemCount} />
                  <p className={styles.category}>{template.category}</p>
                  <h3>{template.name}</h3>
                  <p className={styles.cardDescription}>
                    {template.description}
                  </p>
                  <button
                    type="button"
                    className={
                      selected.id === template.id
                        ? styles.primary
                        : styles.secondary
                    }
                    aria-pressed={selected.id === template.id}
                    aria-controls="checklist-template-preview"
                    aria-label={`Preview ${template.name}`}
                    onClick={() => {
                      if (selectedId === template.id) {
                        previewHeading.current?.focus({ preventScroll: true });
                        previewHeading.current?.scrollIntoView({
                          block: 'start',
                        });
                      } else setSelectedId(template.id);
                    }}
                  >
                    {selected.id === template.id ? (
                      <Check size={15} />
                    ) : (
                      <ChevronRight size={15} />
                    )}
                    {selected.id === template.id
                      ? 'Viewing pack'
                      : 'Preview tasks'}
                  </button>
                </article>
              ))}
              {result.data.plannedTemplates.map((template) => (
                <article
                  className={`${styles.card} ${styles.planned}`}
                  key={template.id}
                >
                  <Artwork id={template.id} />
                  <div className={styles.plannedLabel}>
                    <p className={styles.category}>{template.category}</p>
                    <ComingSoon />
                  </div>
                  <h3>{template.name}</h3>
                  <p className={styles.cardDescription}>
                    {template.description}
                  </p>
                  <button type="button" disabled className={styles.secondary}>
                    Preview tasks · Coming soon
                  </button>
                </article>
              ))}
            </div>
          </section>
          <section
            id="checklist-template-preview"
            aria-labelledby="checklist-preview-title"
            className={styles.preview}
          >
            <div className={styles.sectionHeading}>
              <span className={styles.eyebrow}>Template detail inspection</span>
              <span className={styles.version}>Version {selected.version}</span>
            </div>
            <h2 id="checklist-preview-title" ref={previewHeading} tabIndex={-1}>
              {selected.name}
            </h2>
            <p>{selected.description}</p>
            <div
              className={styles.priorities}
              aria-label="Preview priority breakdown"
            >
              {Object.entries(priorityNames).map(([key, name]) => (
                <div key={key}>
                  <strong>
                    {
                      selected.items.filter((item) => item.priority === key)
                        .length
                    }
                  </strong>
                  <span>{name} priority</span>
                </div>
              ))}
            </div>
            <p className={styles.timingNote}>
              Suggested timing is relative to your wedding date. These are
              planning suggestions. Review calculated dates before confirming
              generation.
            </p>
            <ol
              className={styles.items}
              aria-label={`${selected.name} task preview`}
            >
              {selected.items.map((item, index) => (
                <li key={item.key}>
                  <span className={styles.itemNumber} aria-hidden="true">
                    {index + 1}
                  </span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                    <div className={styles.itemMeta}>
                      <span>{priorityNames[item.priority]} priority</span>
                      <span>
                        {item.daysBeforeWedding === 0
                          ? 'On the wedding day'
                          : `${item.daysBeforeWedding} days before the wedding`}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <GenerateTasks
              key={`${selected.id}/${selected.version}`}
              template={selected}
              onGenerated={() => setGenerationVersion((value) => value + 1)}
            />
          </section>
        </div>
      )}
      <GenerationHistory generationVersion={generationVersion} />
    </div>
  );
}
