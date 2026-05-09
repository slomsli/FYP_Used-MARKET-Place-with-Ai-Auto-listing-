import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import MarketplaceAssistant from '@/src/components/assistant/MarketplaceAssistant';
import 'leaflet/dist/leaflet.css';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ReMarket | Buy & Sell with Confidence',
  description:
    'ReMarket is a trusted marketplace for buying and selling quality used items with verified listings and secure transactions.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={inter.className}>
        {children}
        <MarketplaceAssistant />
      </body>
    </html>
  );
}
