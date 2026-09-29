import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import RegisterServiceWorker from './register-service-worker';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: 'Replay — 투자 복기와 리스크 관리',
  description: '국내·미국주식의 보유 현황, 비중 관리, 투자 계획과 시장 분석을 한곳에서 확인하세요.',
  manifest:'/manifest.webmanifest',
  appleWebApp:{capable:true,statusBarStyle:'black-translucent',title:'Replay'},
  openGraph: {
    title: 'Replay — 투자를 기록하고, 원칙을 지키다',
    description: '투자 복기 + 리스크 관리 코파일럿',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Replay — 투자를 기록하고, 원칙을 지키다',
    description: '투자 복기 + 리스크 관리 코파일럿',
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {themeColor:'#090d14',width:'device-width',initialScale:1,viewportFit:'cover'};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <RegisterServiceWorker/>
      </body>
    </html>
  );
}
