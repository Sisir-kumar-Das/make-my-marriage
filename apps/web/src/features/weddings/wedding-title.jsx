import { playfair } from '@/features/home/fonts';
import styles from './weddings.module.css';

export function WeddingTitle({ name, as: Tag = 'h2', className = '' }) {
  return (
    <Tag
      className={[styles.weddingTitle, playfair.variable, className].join(' ')}
    >
      {name}
    </Tag>
  );
}
