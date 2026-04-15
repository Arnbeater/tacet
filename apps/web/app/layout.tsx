import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TACET · Automatisk stilhedsklipning',
  description:
    'Drop en video — se waveform med detekterede stilheder — eksportér klippet video. Alt kører lokalt i din browser.',
  keywords: ['video editor', 'silence removal', 'auto-editor', 'talking head', 'tutorial'],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="da">
      <body>
        <div className="grain" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
