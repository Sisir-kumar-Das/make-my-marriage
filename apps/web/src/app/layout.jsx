import './globals.css';

export const metadata = {
  title: { default: 'Make My Marriage', template: '%s | Make My Marriage' },
  description:
    'A calm workspace for planning your wedding together. Development scaffold with sample data.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-card focus:p-3"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
