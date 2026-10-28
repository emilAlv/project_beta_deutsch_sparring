import { Inter, Lora } from 'next/font/google';
import './globals.css';
import { UI_LANG } from '../lib/ui-text';

// Fonts from the Figma file: Lora (headings, exercise lines, level), Inter (everything else).
// next/font serves them from our own domain, so the browser never contacts Google.
const lora = Lora({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-serif' });
const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata = {
  title: 'wort. – Deutsch Sparring',
  description: 'Deutsch üben im Gespräch – mit einem KI-Tutor nach unserem Kursbuch.',
};

export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#f6f4ee' };

export default function RootLayout({ children }) {
  return (
    // translate="no": browser auto-translation rewrites the page and crashed the app before
    <html lang={UI_LANG} translate="no" className={`${lora.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body>{children}</body>
    </html>
  );
}
