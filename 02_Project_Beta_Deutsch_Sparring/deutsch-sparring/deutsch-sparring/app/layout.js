import './globals.css';

export const metadata = {
  title: 'Deutsch Sparring',
  description: 'B1-Deutsch üben mit einem KI-Tutor – nach unserem Kursbuch.',
};

export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
