import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider, getSystemConfig } from "@/components/theme-provider";
import { PermissionsProvider } from "@/lib/auth/use-permissions";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getSystemConfig();
  const favicon = config.designTokens?.faviconUrl || "/favicon.ico";
  return {
    title: config.appTitle,
    description: "Enterprise Orchestration Console for SavazAI",
    icons: {
      icon: favicon,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap"
        />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans transition-colors duration-150">
        <ThemeProvider>
          <PermissionsProvider>{children}</PermissionsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
