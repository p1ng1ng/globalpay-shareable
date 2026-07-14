import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import GlobalLanguageControl from "@/components/GlobalLanguageControl";
import { LanguageProvider } from "@/components/LanguageProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Wpay",
  description: "Premium payment operations dashboard for merchants, finance, and admin teams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <ThemeProvider>
          <LanguageProvider>
            {children}
            <GlobalLanguageControl />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
