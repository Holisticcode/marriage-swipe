import type { Metadata, Viewport } from 'next';
import './member.css';
import './site.css';

export const metadata: Metadata = {
  title: { default: 'Marriage Swipe', template: '%s · Marriage Swipe' },
  description: 'Verified-face matches for people who are serious about marriage.',
};
export const viewport: Viewport = { themeColor: '#d92d55', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
