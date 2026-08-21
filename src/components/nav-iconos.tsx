import type { SVGProps } from 'react'

// Iconos y tipos de la navegación. Vivían dentro de `AppShell`, pero ahora los
// consumen también la barra inferior de iPhone (`nav-inferior.tsx`) y el
// command palette (`command-palette.tsx`). Se extrajeron aquí en vez de
// importarlos desde el AppShell porque ese import sería circular: el shell
// importa esos dos componentes.

export type IconName =
  | 'sol'
  | 'luna'
  | 'calendario'
  | 'bandeja'
  | 'portafolio'
  | 'red-personas'
  | 'escudo'
  | 'linea'
  | 'chispa'
  | 'diana'
  | 'personas'
  | 'engrane'
  | 'barras'
  | 'chevron'
  | 'mas'

export type SubItem = { href: string; label: string; color?: string }

export type NavItem = {
  href: string
  label: string
  desc: string
  icon: IconName
  sub?: SubItem[]
}

export type Grupo = { grupo: string; items: NavItem[] }

export type ProyectoNav = { id: string; nombre: string; color: string }

export function Icono({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  const shared = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    width: 20,
    height: 20,
    'aria-hidden': true,
    ...props,
  }

  switch (name) {
    case 'sol':
      return (
        <svg {...shared}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8L6 18M18 6l1.8-1.8" />
        </svg>
      )
    case 'luna':
      return (
        <svg {...shared}>
          <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a6.8 6.8 0 0 0 11 11z" />
        </svg>
      )
    case 'calendario':
      return (
        <svg {...shared}>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
          <path d="M3.5 10h17M8 2.5v5M16 2.5v5" />
        </svg>
      )
    case 'bandeja':
      return (
        <svg {...shared}>
          <path d="M3.5 12.5h5l1.7 2.5h3.6l1.7-2.5h5" />
          <path d="M3.5 12.5 5.8 5a1.5 1.5 0 0 1 1.4-1h9.6a1.5 1.5 0 0 1 1.4 1l2.3 7.5v5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" />
        </svg>
      )
    case 'portafolio':
      return (
        <svg {...shared}>
          <rect x="3" y="7.5" width="18" height="12" rx="2" />
          <path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5M3 13h18" />
        </svg>
      )
    case 'red-personas':
      return (
        <svg {...shared}>
          <circle cx="6" cy="6.5" r="2.25" />
          <circle cx="18" cy="6.5" r="2.25" />
          <circle cx="12" cy="18" r="2.25" />
          <path d="M7.7 8L10.5 16M16.3 8L13.5 16M8.25 6.5h7.5" />
        </svg>
      )
    case 'escudo':
      return (
        <svg {...shared}>
          <path d="M12 2.5 4.5 5.5v6c0 5 3.2 8.3 7.5 10 4.3-1.7 7.5-5 7.5-10v-6z" />
          <path d="M8.7 12.2l2.3 2.3 4.3-4.7" />
        </svg>
      )
    case 'linea':
      return (
        <svg {...shared}>
          <path d="M3.5 3.5v17h17" />
          <path d="M6.5 15.5l3.5-4 3 2.7 4.5-6.2" />
        </svg>
      )
    case 'chispa':
      return (
        <svg {...shared}>
          <path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z" />
          <path d="M19 15.5l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7z" />
        </svg>
      )
    case 'diana':
      return (
        <svg {...shared}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5.2" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'personas':
      return (
        <svg {...shared}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 20c.4-3.4 2.8-5.7 5.5-5.7s5.1 2.3 5.5 5.7" />
          <circle cx="17.5" cy="7.5" r="2.3" />
          <path d="M14.8 14.6c2.3.1 4.2 2.1 4.7 5.4" />
        </svg>
      )
    case 'engrane':
      // Engrane con dientes de verdad. La versión anterior (círculo + 8 rayos)
      // era indistinguible del sol de Mi Día — Mau lo notó en el iPad.
      return (
        <svg {...shared}>
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    case 'barras':
      return (
        <svg {...shared}>
          <path d="M5 20V13M12 20V8M19 20V4" />
          <path d="M3.5 20h17" />
        </svg>
      )
    case 'chevron':
      return (
        <svg {...shared}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      )
    case 'mas':
      return (
        <svg {...shared}>
          <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      )
  }
}
