import { Building } from 'lucide-react';
import { useState } from 'react';
import type { Client } from '../../lib/clients';

export default function ClientLogo({ client, className = 'size-9' }: { client: Pick<Client, 'logoUrl' | 'name'>; className?: string }) {
	const [failedUrl, setFailedUrl] = useState<string | null>(null);
	return <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ink-200 bg-white ${className}`}>
		{client.logoUrl && failedUrl !== client.logoUrl ? <img src={client.logoUrl} alt={`Logo de ${client.name}`} draggable={false} loading="lazy" className="size-full object-contain p-1" onError={() => setFailedUrl(client.logoUrl)} /> : <Building aria-hidden="true" className="size-4 text-ink-400" />}
	</span>;
}
