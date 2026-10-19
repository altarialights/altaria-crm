import { useStore } from '@nanostores/react';
import { Menu } from 'lucide-react';

import { isSidebarOpen } from '../stores/sidebar';

/** Opens the sidebar drawer on small screens; hidden from `lg` up, where the sidebar is always visible. */
export default function SidebarToggle() {
	const open = useStore(isSidebarOpen);

	return (
		<button
			type="button"
			className="-ml-1.5 rounded-lg p-1.5 text-ink-600 hover:bg-brand-50 hover:text-brand-900 lg:hidden"
			aria-label="Abrir menú"
			aria-controls="app-sidebar"
			aria-expanded={open}
			onClick={() => isSidebarOpen.set(true)}
		>
			<Menu className="size-5" aria-hidden="true" />
		</button>
	);
}
