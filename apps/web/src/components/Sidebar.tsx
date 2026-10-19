import { useStore } from '@nanostores/react';
import { ChevronRight, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { NAV_FOOTER, NAV_SECTIONS, isActivePath, type NavItem } from '../lib/navigation';
import { isSidebarOpen } from '../stores/sidebar';

interface Props {
	/** Current pathname (`Astro.url.pathname`), to highlight the active item */
	currentPath: string;
	/** Clerk's UserButton, passed from the Astro layout as a slot */
	children?: ReactNode;
}

/**
 * App navigation. Fixed column from `lg` up; off-canvas drawer below that, opened by SidebarToggle.
 * Flyouts are portalled to the body so the scrollable navigation cannot clip them.
 */
export default function Sidebar({ currentPath, children }: Props) {
	const open = useStore(isSidebarOpen);

	// Close the drawer with Escape
	useEffect(() => {
		if (!open) {
			return;
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				isSidebarOpen.set(false);
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [open]);

	return (
		<>
			{open && (
				<div
					className="fixed inset-0 z-40 bg-brand-950/40 lg:hidden"
					aria-hidden="true"
					onClick={() => isSidebarOpen.set(false)}
				/>
			)}

			<aside
				id="app-sidebar"
				className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-ink-200 bg-white transition-[translate,visibility] duration-200 motion-reduce:transition-none lg:visible lg:translate-none ${open ? 'translate-x-0' : 'invisible -translate-x-full'}`}
			>
				<div className="flex h-14 shrink-0 items-center gap-3 border-b border-ink-200 px-4">
					{/* Fixed size so the layout doesn't shift while Clerk mounts the avatar */}
					<div className="grid size-7 shrink-0 place-items-center">{children}</div>
					<a href="/" className="font-semibold tracking-tight">
						Altaria CRM
					</a>
					<button
						type="button"
						className="-mr-1.5 ml-auto rounded-lg p-1.5 text-ink-500 hover:bg-brand-50 hover:text-brand-900 lg:hidden"
						aria-label="Cerrar menú"
						onClick={() => isSidebarOpen.set(false)}
					>
						<X className="size-5" aria-hidden="true" />
					</button>
				</div>

				<nav aria-label="Principal" className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
					{NAV_SECTIONS.map((section) => (
						<div key={section.title}>
							<h2 className="px-2 text-xs font-medium tracking-wider text-ink-400 uppercase">{section.title}</h2>
							<ul className="mt-2 space-y-0.5">
								{section.items.map((item) => (
									<li key={item.href}>
										{item.children ? (
											<NavGroup item={item} currentPath={currentPath} />
										) : (
											<NavLink item={item} currentPath={currentPath} />
										)}
									</li>
								))}
							</ul>
						</div>
					))}

					<ul className="mt-auto space-y-0.5 border-t border-ink-200 pt-4">
						{NAV_FOOTER.map((item) => (
							<li key={item.href}>
								<NavLink item={item} currentPath={currentPath} />
							</li>
						))}
					</ul>
				</nav>
			</aside>
		</>
	);
}

function NavGroup({ item, currentPath }: { item: NavItem; currentPath: string }) {
	const [menu, setMenu] = useState<{ top: number; left: number } | 'inline' | null>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const focusFirstRef = useRef(false);
	const submenuId = `submenu-${item.href.replaceAll('/', '-')}`;
	const Icon = item.icon;
	const active = isActivePath(currentPath, item.href);

	function cancelClose() {
		if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
	}

	function openMenu(keyboard = false) {
		cancelClose();
		focusFirstRef.current = keyboard;
		const bounds = triggerRef.current?.getBoundingClientRect();
		if (!bounds) return;
		if (window.matchMedia('(width >= 64rem)').matches) {
			setMenu({
				top: Math.max(12, Math.min(bounds.top - 8, window.innerHeight - 180)),
				left: (triggerRef.current?.closest('aside')?.getBoundingClientRect().right ?? bounds.right) + 8,
			});
		} else {
			setMenu('inline');
		}
	}

	function closeSoon() {
		cancelClose();
		if (panelRef.current?.contains(document.activeElement)) return;
		closeTimerRef.current = setTimeout(() => setMenu(null), 150);
	}

	useEffect(() => {
		if (!menu) return;
		function dismiss(event: PointerEvent) {
			if (event.target instanceof Node && !triggerRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) {
				setMenu(null);
			}
		}
		function escape(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				setMenu(null);
				triggerRef.current?.focus();
			}
		}
		function reposition() { setMenu(null); }
		document.addEventListener('pointerdown', dismiss);
		document.addEventListener('keydown', escape, true);
		window.addEventListener('resize', reposition);
		// A fixed flyout must not remain behind when its triggerRef scrolls away.
		const nav = triggerRef.current?.closest('nav');
		if (menu !== 'inline') nav?.addEventListener('scroll', reposition);
		return () => {
			document.removeEventListener('pointerdown', dismiss);
			document.removeEventListener('keydown', escape, true);
			window.removeEventListener('resize', reposition);
			nav?.removeEventListener('scroll', reposition);
			cancelClose();
		};
	}, [menu]);

	const submenu = menu && (
		<div
			id={submenuId}
			ref={(element) => {
				panelRef.current = element;
				if (element && focusFirstRef.current) {
					focusFirstRef.current = false;
					element.querySelector('a')?.focus();
				}
			}}
			style={menu === 'inline' ? undefined : { top: menu.top, left: menu.left }}
			className={menu === 'inline'
				? 'mt-1 ml-4 border-l border-ink-200 pl-3'
				: 'fixed z-[60] w-60 rounded-xl border border-ink-200 bg-white p-2 shadow-xl shadow-brand-950/10'}
			onPointerEnter={cancelClose}
			onPointerLeave={(event) => { if (event.pointerType === 'mouse' && menu !== 'inline') closeSoon(); }}
			onBlur={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget) && !triggerRef.current?.contains(event.relatedTarget)) setMenu(null);
			}}
			onKeyDown={(event) => {
				const links = Array.from(event.currentTarget.querySelectorAll('a'));
				const index = links.indexOf(document.activeElement as HTMLAnchorElement);
				if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
					event.preventDefault();
					links[(index + (event.key === 'ArrowDown' ? 1 : links.length - 1)) % links.length]?.focus();
				}
				if (event.key === 'ArrowLeft') {
					event.preventDefault();
					setMenu(null);
					triggerRef.current?.focus();
				}
				// A portal sits at the end of <body>; restore the sidebar's natural Tab order.
				if (menu !== 'inline' && event.key === 'Tab') {
					if (event.shiftKey && index === 0) {
						event.preventDefault();
						triggerRef.current?.focus();
					} else if (!event.shiftKey && index === links.length - 1) {
						const controls = Array.from(triggerRef.current?.closest('nav')?.querySelectorAll<HTMLElement>('a, button') ?? []);
						const next = triggerRef.current && controls[controls.indexOf(triggerRef.current) + 1];
						if (next) {
							event.preventDefault();
							setMenu(null);
							next.focus();
						}
					}
				}
			}}
		>
			{menu !== 'inline' && <p className="px-2 pt-1 pb-2 text-xs font-medium text-ink-400">{item.label}</p>}
			<ul aria-label={item.label} className="space-y-1">
				{item.children?.map((child) => (
					<li key={child.href}><NavLink item={child} currentPath={currentPath} /></li>
				))}
			</ul>
		</div>
	);

	return (
		<div>
			<button
				ref={triggerRef}
				type="button"
				aria-expanded={menu !== null}
				aria-controls={menu ? submenuId : undefined}
				data-active={active || undefined}
				className="group flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm text-ink-600 transition-colors hover:bg-brand-50 hover:text-brand-900 aria-expanded:bg-brand-50 data-[active]:bg-brand-100 data-[active]:font-medium data-[active]:text-brand-900"
				onPointerEnter={(event) => { if (event.pointerType === 'mouse' && window.matchMedia('(width >= 64rem)').matches) openMenu(); }}
				onPointerLeave={(event) => { if (event.pointerType === 'mouse' && menu !== 'inline') closeSoon(); }}
				onClick={(event) => { if (menu) setMenu(null); else openMenu(event.detail === 0); }}
				onKeyDown={(event) => {
					if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
						event.preventDefault();
						openMenu(true);
					}
					if (event.key === 'Tab' && menu && menu !== 'inline' && !event.shiftKey) {
						event.preventDefault();
						panelRef.current?.querySelector('a')?.focus();
					}
				}}
				onBlur={(event) => {
					if (!panelRef.current?.contains(event.relatedTarget)) setMenu(null);
				}}
			>
				<Icon className="size-4 shrink-0 text-ink-400 group-hover:text-brand-600 group-data-[active]:text-accent" aria-hidden="true" />
				<span className="truncate">{item.label}</span>
				<ChevronRight className="ml-auto size-3.5 text-ink-400 transition-transform group-aria-expanded:rotate-90 lg:group-aria-expanded:rotate-0" aria-hidden="true" />
			</button>
			{menu === 'inline' ? submenu : menu && createPortal(submenu, document.body)}
		</div>
	);
}

function NavLink({ item, currentPath }: { item: NavItem; currentPath: string }) {
	const Icon = item.icon;

	return (
		<a
			href={item.href}
			aria-current={isActivePath(currentPath, item.href) ? 'page' : undefined}
			className="group flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-ink-600 transition-colors hover:bg-brand-50 hover:text-brand-900 aria-[current=page]:bg-brand-100 aria-[current=page]:font-medium aria-[current=page]:text-brand-900"
		>
			<Icon
				className="size-4 shrink-0 text-ink-400 group-hover:text-brand-600 group-aria-[current=page]:text-accent"
				aria-hidden="true"
			/>
			<span className="min-w-0">
				<span className="block truncate">{item.label}</span>
				{item.description && <span className="mt-0.5 block text-xs font-normal text-ink-500">{item.description}</span>}
			</span>
			{item.badge !== undefined && (
				<span className="ml-auto rounded-full bg-brand-100 px-1.5 text-xs font-medium text-brand-700 tabular-nums group-aria-[current=page]:bg-white">
					{item.badge}
				</span>
			)}
		</a>
	);
}
