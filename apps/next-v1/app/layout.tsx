import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Drift V1 Demo',
  description: 'Next.js demo for Drift Contracts and anti LLM-drift checks.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
