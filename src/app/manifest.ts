import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'WTW App',
    short_name: 'WTW',
    description: 'Tu semana, ganada por diseño',
    start_url: '/dia',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0A7C82',
    icons: [
      { src: '/pwa/icon-192', sizes: '192x192', type: 'image/png' },
      { src: '/pwa/icon-512', sizes: '512x512', type: 'image/png' },
    ],
  }
}
