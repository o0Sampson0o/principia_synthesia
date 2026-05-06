import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import "./globals.css";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { userThemes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildThemeStyle, defaultThemeStyle, defaultLight, defaultDark } from "@/lib/theme";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Principia Synthesia",
  description: "A personal textbook of everything.",
  verification: {
    google: "5YT4p4zVX0_lqKaz_4CYRU8PA_r8p6zwB-_1XC9Lh7E",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();

  let themeStyle = defaultThemeStyle();

  if (session?.userId) {
    const theme = await db
      .select()
      .from(userThemes)
      .where(eq(userThemes.userId, session.userId))
      .limit(1);

    if (theme[0]) {
      themeStyle = buildThemeStyle(
        theme[0].lightTokens ?? defaultLight,
        theme[0].darkTokens ?? defaultDark
      );
    }
  }

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeStyle }} />
      </head>
      <body className="min-h-full flex flex-col">
        <Nav />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
