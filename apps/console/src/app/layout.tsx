import { Fira_Code, Fira_Sans } from 'next/font/google';
import './global.css';
import { Providers } from '../components/providers';
import { Shell } from '../components/shell';

/**
 * Self-hosted by next/font at build time — no external stylesheet request and
 * no FOIT/layout shift. Fira Sans/Fira Code is the dashboard pairing: precise,
 * readable at small sizes, with a matching mono for ids and JSON.
 */
const firaSans = Fira_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-fira-sans',
  display: 'swap',
});

const firaCode = Fira_Code({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-fira-code',
  display: 'swap',
});

export const metadata = {
  title: 'Connect Console',
  description: 'Operator console for the Rumsan Connect communication service',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${firaSans.variable} ${firaCode.variable}`}>
      <body className="font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-0 focus:top-0 focus:z-50 focus:rounded-br-md focus:bg-primary focus:px-4 focus:py-2.5 focus:font-semibold focus:text-primary-foreground"
        >
          Skip to main content
        </a>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
