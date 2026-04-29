import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Navigation } from "@/components/layout/NavigationWrapper";
import { Footer } from "@/components/layout/Footer";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://www.transportactiongroup.com"),
  title: {
    default: "Transport Action Group | Enabling Green Freight Transformation",
    template: "%s | Transport Action Group",
  },
  description:
    "Transport Action Group creates the enabling environment for green freight transformation through action plans, strategic interventions, ecosystem alignment, and partner mobilisation — turning industry ambition into practical implementation momentum.",
  keywords: [
    "green freight",
    "transport action group",
    "TAG",
    "freight decarbonisation",
    "electric truck South Africa",
    "green freight action plan",
    "road freight transformation",
    "sustainable logistics",
    "green freight South Africa",
    "road freight sustainability",
    "fleet decarbonisation",
    "freight emissions reduction",
    "Abdool Kamdar",
    "green freight advisory",
    "DFI green freight",
  ],
  authors: [{ name: "Transport Action Group", url: "https://www.transportactiongroup.com" }],
  creator: "Transport Action Group",
  publisher: "Transport Action Group",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_ZA",
    siteName: "Transport Action Group",
    title: "Transport Action Group | Enabling Green Freight Transformation",
    description:
      "Creating the enabling environment for green freight transformation through action plans, strategic interventions, and ecosystem alignment.",
    url: "https://www.transportactiongroup.com",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Transport Action Group — Enabling Green Freight Transformation",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Transport Action Group | Enabling Green Freight Transformation",
    description:
      "Creating the enabling environment for green freight transformation through action plans, strategic interventions, and ecosystem alignment.",
    images: ["/og-image.png"],
  },
  alternates: {
    canonical: "https://www.transportactiongroup.com",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Navigation />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
