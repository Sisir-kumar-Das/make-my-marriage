import localFont from 'next/font/local';

export const inter = localFont({
  src: './fonts/inter-latin.woff2',
  weight: '400 700',
  style: 'normal',
  display: 'swap',
  variable: '--font-landing-sans',
});

export const playfair = localFont({
  src: [
    {
      path: './fonts/playfair-display-latin.woff2',
      weight: '400 600',
      style: 'normal',
    },
    {
      path: './fonts/playfair-display-italic-latin.woff2',
      weight: '400 600',
      style: 'italic',
    },
  ],
  display: 'swap',
  variable: '--font-landing-serif',
});
