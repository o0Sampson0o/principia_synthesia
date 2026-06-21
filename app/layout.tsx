import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import CommandPalette from "@/components/CommandPalette";
import OfflineGuard from "@/components/OfflineGuard";
import EmailVerificationBannerGate from "@/components/EmailVerificationBannerGate";
import OnboardingTourGate from "@/components/OnboardingTourGate";
import "./globals.css";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { userThemes, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildThemeStyle, defaultThemeStyle, defaultLight, defaultDark } from "@/lib/theme";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
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
  let emailVerifiedAt: Date | null = null;

  if (session?.userId) {
    const [theme, userRow] = await Promise.all([
      db.select().from(userThemes).where(eq(userThemes.userId, session.userId)).limit(1).then((r) => r[0] ?? null),
      db.select({ emailVerifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.id, session.userId)).limit(1).then((r) => r[0] ?? null),
    ]);

    if (theme) {
      themeStyle = buildThemeStyle(
        { ...defaultLight, ...theme.lightTokens },
        { ...defaultDark, ...theme.darkTokens }
      );
    }
    emailVerifiedAt = userRow?.emailVerifiedAt ?? null;
  }

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeStyle }} />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className="min-h-full flex flex-col">
        <Nav />
        <CommandPalette />
        <OfflineGuard />
        {session && !emailVerifiedAt && (
          <EmailVerificationBannerGate email={session.email} />
        )}
        {children}
        <OnboardingTourGate />
        <Footer />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
