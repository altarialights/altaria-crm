import {
	Columns3,
	CalendarDays,
	ChartColumn,
	CreditCard,
	FileText,
	Images,
	Handshake,
	House,
	ListTodo,
	Link,
	Receipt,
	Settings,
	Users,
	type LucideIcon,
} from 'lucide-react';

export interface NavItem {
	label: string;
	href: string;
	icon: LucideIcon;
	/** Counter shown next to the label, e.g. pending tasks */
	badge?: number;
	description?: string;
	children?: NavItem[];
}

export interface NavSection {
	title: string;
	items: NavItem[];
}

// Sample entries to preview the design: most of these routes don't exist yet
export const NAV_SECTIONS: NavSection[] = [
	{
		title: 'General',
		items: [
			{ label: 'Inicio', href: '/', icon: House },
			{ label: 'Calendario', href: '/calendario', icon: CalendarDays },
			{ label: 'Tareas', href: '/tareas', icon: ListTodo, badge: 3 },
			{
				label: 'Tarjetas',
				href: '/tarjetas',
				icon: CreditCard,
				children: [
					{ label: 'Galería', href: '/tarjetas/galeria', icon: Images, description: 'Diseños y carpetas' },
					{ label: 'Asignaciones', href: '/tarjetas/asignaciones', icon: Link, description: 'Tarjetas y clientes' },
				],
			},
		],
	},
	{
		title: 'Clientes',
		items: [
			{
				label: 'Clientes', href: '/clientes', icon: Users,
				children: [
					{ label: 'Lista', href: '/clientes/lista', icon: Users, description: 'Datos y fichas de clientes' },
					{ label: 'Fases', href: '/clientes/fases', icon: Columns3, description: 'Tablero de seguimiento' },
				],
			},
		],
	},
	{
		title: 'Ventas',
		items: [
			{ label: 'Oportunidades', href: '/oportunidades', icon: Handshake },
			{ label: 'Presupuestos', href: '/presupuestos', icon: FileText },
			{ label: 'Facturas', href: '/facturas', icon: Receipt },
		],
	},
	{
		title: 'Análisis',
		items: [{ label: 'Informes', href: '/informes', icon: ChartColumn }],
	},
];

// Pinned to the bottom of the sidebar
export const NAV_FOOTER: NavItem[] = [{ label: 'Configuración', href: '/configuracion', icon: Settings }];

/** Whether `href` is the current section: exact match for `/`, prefix match for the rest */
export function isActivePath(currentPath: string, href: string): boolean {
	const path = currentPath.replace(/\/+$/, '') || '/';
	if (href === '/') {
		return path === '/';
	}
	return path === href || path.startsWith(`${href}/`);
}
