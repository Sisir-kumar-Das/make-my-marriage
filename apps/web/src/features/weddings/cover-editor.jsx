'use client';

import Image from 'next/image';
import { useId, useRef, useState } from 'react';
import { CloudUpload, RotateCcw } from 'lucide-react';
import { defaultFrame, draggedFrame, frameStyle } from './cover-data';
import styles from './cover.module.css';

export function CoverEditor({
  cover,
  disabled = false,
  onFrameChange,
  fileInputId,
}) {
  const generatedId = useId();
  const fileId = fileInputId ?? generatedId;
  const preview = useRef(null);
  const drag = useRef(null);
  const [image, setImage] = useState(null);
  function changeFrame(value) {
    cover.setFrame(value);
    onFrameChange?.(value);
  }
  function pick(event) {
    cover.choose(event.target.files?.[0]);
    event.target.value = '';
  }
  return (
    <div className={styles.editor}>
      <label
        className={styles.uploadZone}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (!disabled) cover.choose(event.dataTransfer.files?.[0]);
        }}
      >
        <CloudUpload size={25} aria-hidden="true" />
        <strong>
          {cover.selection
            ? 'Choose a different photo'
            : 'Choose your wedding photo'}
        </strong>
        <span>JPG or PNG · up to 15 MB · up to 40 megapixels</span>
        <input
          id={fileId}
          type="file"
          className={styles.fileInput}
          accept="image/jpeg,image/png"
          disabled={disabled}
          onChange={pick}
          aria-label="Choose wedding cover photo"
          aria-describedby={`${fileId}-selection`}
        />
        <span className={styles.browse}>Browse photos</span>
        <span
          id={`${fileId}-selection`}
          role="status"
          className={styles.filename}
        >
          {cover.selection
            ? `Selected: ${cover.selection.file.name}`
            : 'No photo selected · or drag a file here'}
        </span>
      </label>
      {cover.error && (
        <p role="alert" className={styles.error}>
          {cover.error}
        </p>
      )}
      {cover.selection && (
        <>
          <p className={styles.hint}>
            Dashboard preview · drag the photo to position it.
          </p>
          <div
            ref={preview}
            className={styles.frame}
            style={{
              touchAction: 'none',
              cursor: disabled ? 'default' : 'grab',
            }}
            onPointerDown={(event) => {
              if (disabled || !image) return;
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                x: event.clientX,
                y: event.clientY,
                frame: cover.frame,
              };
            }}
            onPointerMove={(event) => {
              if (!drag.current || disabled || !image) return;
              changeFrame(
                draggedFrame(
                  drag.current.frame,
                  preview.current.getBoundingClientRect(),
                  image,
                  event.clientX - drag.current.x,
                  event.clientY - drag.current.y,
                ),
              );
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            <Image
              key={cover.selection.url}
              src={cover.selection.url}
              alt="Your wedding cover preview"
              fill
              unoptimized
              draggable={false}
              sizes="100vw"
              className={styles.photo}
              style={frameStyle(cover.frame)}
              onLoad={(event) => {
                const { naturalWidth: width, naturalHeight: height } =
                  event.currentTarget;
                if (width * height > 40_000_000) {
                  cover.setError('Choose a photo up to 40 megapixels.');
                  return;
                }
                setImage({ width, height });
              }}
              onError={() =>
                cover.setError(
                  'This photo could not be opened. Choose another JPG or PNG.',
                )
              }
            />
          </div>
          <div className={styles.sliders}>
            {[
              ['zoom', 'Zoom', 1, 3, 0.01],
              ['x', 'Horizontal position', 0, 1, 0.01],
              ['y', 'Vertical position', 0, 1, 0.01],
            ].map(([key, label, min, max, step]) => (
              <label key={key}>
                <span>
                  {label}
                  {key === 'zoom'
                    ? ` · ${Math.round(cover.frame.zoom * 100)}%`
                    : ''}
                </span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={cover.frame[key]}
                  disabled={disabled}
                  onChange={(event) =>
                    changeFrame({
                      ...cover.frame,
                      [key]: Number(event.target.value),
                    })
                  }
                />
              </label>
            ))}
          </div>
          <div className={styles.editorActions}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => changeFrame(defaultFrame)}
            >
              <RotateCcw size={14} aria-hidden="true" /> Reset position
            </button>
            <button type="button" disabled={disabled} onClick={cover.reset}>
              Remove selected photo
            </button>
          </div>
          <p className={styles.hint}>
            Your original photo stays intact. Only its display position and zoom
            change.
          </p>
        </>
      )}
      {cover.progress && (
        <div role="status" className={styles.progress}>
          <span>
            {cover.progress.phase}
            {cover.progress.phase === 'Uploading photo'
              ? ` · ${cover.progress.percent}%`
              : cover.progress.phase === 'Photo ready'
                ? ''
                : '…'}
          </span>
          <progress
            value={cover.progress.percent}
            max="100"
            aria-label={cover.progress.phase}
          />
        </div>
      )}
    </div>
  );
}
