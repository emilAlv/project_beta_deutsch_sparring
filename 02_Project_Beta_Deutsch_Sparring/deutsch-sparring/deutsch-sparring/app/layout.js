import { Inter, Lora } from 'next/font/google';
import './globals.css';

// Fonts from the Figma file: Lora (headings, exercise lines, level), Inter (everything else).
// next/font serves them from our own domain, so the browser never contacts Google.
const lora = Lora({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-serif' });
const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata = {
  title: 'wort. – Deutsch Sparring',
  description: 'Deutsch üben im Gespräch – mit einem KI-Tutor nach unserem Kursbuch.',
};

export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#f6f4ee' };

// Runs before the first paint: applies the remembered "options hidden" choice, so the
// left panel doesn't jump after the page loads.
const restoreLayout = `try{if(JSON.parse(localStorage.getItem('wort_prefs')||'{}').optionsHidden)document.documentElement.dataset.options='hidden'}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    // translate="no": browser auto-translation rewrites the page and crashed the app before
    <html lang="de" translate="no" className={`${lora.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
        <script dangerouslySetInnerHTML={{ __html: restoreLayout }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
