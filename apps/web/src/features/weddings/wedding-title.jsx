import { Heart } from 'lucide-react';
import { playfair } from '@/features/home/fonts';
import styles from './weddings.module.css';

export function WeddingTitle({ name, as: Tag = 'h2', className = '' }) {
  const parts = name.split(/\s+weds\s+/i);
  return (
    <Tag
      aria-label={name}
      className={[styles.weddingTitle, playfair.variable, className].join(' ')}
    >
      <Heart className={styles.heart} strokeWidth={1.4} aria-hidden="true" />
      <span className="min-w-0 [overflow-wrap:anywhere]">
        {parts.length === 2 && parts.every(Boolean) ? (
          <>
            <span>{parts[0]}</span>
            <em className={styles.weds}> weds </em>
            <span>{parts[1]}</span>
          </>
        ) : (
          name
        )}
      </span>
      <Heart className={styles.heart} strokeWidth={1.4} aria-hidden="true" />
    </Tag>
  );
}
