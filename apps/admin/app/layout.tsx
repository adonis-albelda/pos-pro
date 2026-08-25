import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Manrope } from "next/font/google";
import { Toaster } from "sonner";
import { CompanyIntro } from "@/components/company-intro";
import { QueryProvider } from "@/components/query-provider";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "POSPro — Admin",
  description: "Sales, inventory, and cashiers — everything your store needs, in one place.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${manrope.variable} ${inter.variable} ${plexMono.variable} antialiased`}
      >
        <QueryProvider>
          <CompanyIntro />
          {children}
          <Toaster position="top-center" richColors closeButton />
        </QueryProvider>
      </body>
    </html>
  );
}
