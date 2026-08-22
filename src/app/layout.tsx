import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { RegisterSW } from "./register-sw";
import "./globals.css";

// Lenguaje visual "instrumento": el material de la app es el tiempo
// (2:21:47, 29h, ×1.4). Plex Sans para texto y Plex Mono con numerales
// tabulares para todo número que se compara en columna.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "WTW App",
  description: "Tu semana, ganada por diseño",
};

export const viewport: Viewport = {
  themeColor: "#0A7C82",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es-MX"
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
