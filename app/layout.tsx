import './globals.css';
import type { Metadata } from 'next';
import Script from "next/script";

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
      <head>
        <Script
          id="travelpayouts-drive"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                var script = document.createElement("script");
                script.async = true;
                script.src = 'https://emrld.ltd/NTQzNTQ4.js?t=543548';
                document.head.appendChild(script);
              })();
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
