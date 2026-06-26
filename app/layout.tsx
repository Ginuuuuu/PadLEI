import type { Metadata, Viewport } from "next";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/components/AuthProvider";
import { PwaRegistrar } from "@/components/PwaRegistrar";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "PadLEI",
  title: "PadLEI",
  description: "A Firebase-powered study and mock test platform for approved users.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" }
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180" }]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PadLEI"
  },
  formatDetection: {
    telephone: false
  },
  other: {
    "mobile-web-app-capable": "yes",
    "msapplication-TileColor": "#162033"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#162033",
  colorScheme: "light"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
          <PwaRegistrar />
          <Toaster position="top-right" />
        </AuthProvider>
      </body>
    </html>
  );
}
