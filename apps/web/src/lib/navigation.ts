import {
	Columns3,
	CreditCard,
	Images,
	Link,
	Users,
	Wallet,
	ArrowDownLeft,
	ArrowUpRight,
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

// Only implemented sections belong in the navigation.
export const NAV_SECTIONS: NavSection[] = [
	{
		title: 'General',
		items: [
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
		title: 'Finanzas',
		items: [{ label: 'Finanzas', href: '/finanzas', icon: Wallet, children: [
			{ label: 'Ingresos', href: '/finanzas/ingresos', icon: ArrowDownLeft, description: 'Cobros y previsiones' },
			{ label: 'Gastos', href: '/finanzas/gastos', icon: ArrowUpRight, description: 'Pagos y previsiones' },
		] }],
	},
];

/** Whether `href` is the current section: exact match for `/`, prefix match for the rest */
export function isActivePath(currentPath: string, href: string): boolean {
	const path = currentPath.replace(/\/+$/, '') || '/';
	if (href === '/') {
		return path === '/';
	}
	return path === href || path.startsWith(`${href}/`);
}
