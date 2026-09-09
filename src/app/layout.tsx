import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { RegisterSW } from "./register-sw";
import { NativoBridge } from "./nativo-bridge";
import { TemaInicial } from "./tema-inicial";
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
  title: "Reckon",
  description: "Estimas. Mides. Corriges.",
};

export const viewport: Viewport = {
  themeColor: "#0A7C82",
  // Sin `viewport-fit=cover`, WKWebView y Safari resuelven TODOS los
  // `env(safe-area-inset-*)` a 0. El padding que separa la nav inferior del
  // home indicator estaba escrito desde hace meses y era letra muerta: en
  // iPhone la barra del sistema quedaba encima de los tabs.
  viewportFit: "cover",
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
        <TemaInicial />
        {children}
        <RegisterSW />
        <NativoBridge />
      </body>
    </html>
  );
}
