import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Multi-City Trip Finder',
  description: 'Find the cheapest continuous multi-country flight itineraries',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
