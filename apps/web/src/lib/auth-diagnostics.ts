// Diagnostics describe configuration only. Never log keys or raw SDK errors:
// Clerk error messages can contain credentials and request/session information.
export function describePublishableKey(value: string | undefined) {
	const length = value?.length ?? 0;
	let format: string;
	if (!value) format = 'missing';
	else if (/PUBLIC_CLERK_PUBLISHABLE_KEY\s*=/.test(value)) format = 'assignment';
	else if (/^["'`]|["'`]$/.test(value)) format = 'quoted';
	else if (/\s/.test(value)) format = 'whitespace';
	else if (/^sk_(test|live)_/.test(value)) format = 'secret_key';
	else if (/^[@$]/.test(value)) format = 'unresolved_reference';
	else if (!/^pk_(test|live)_/.test(value)) format = 'invalid_prefix';
	else {
		try {
			const parts = value.split('_');
			const decoded = atob(parts[2] ?? '');
			format = parts.length === 3 && decoded.endsWith('$')
				&& !decoded.slice(0, -1).includes('$') && decoded.includes('.')
				? 'valid' : 'invalid_payload';
		} catch {
			format = 'invalid_encoding';
		}
	}
	return { present: Boolean(value), length, format };
}

export function authErrorCode(cause: unknown, publicKey: string | undefined): string {
	const message = cause instanceof Error ? cause.message : '';
	// Match specific failures before generic mentions of a key in SDK guidance.
	if (/keys do not match|instance keys.*match/i.test(message)) return 'AUTH_KEY_MISMATCH';
	if (/publishable.*(?:not valid|invalid)|(?:not valid|invalid).*publishable/i.test(message)) {
		const { format } = describePublishableKey(publicKey);
		return format === 'valid' ? 'AUTH_PUBLIC_KEY_INVALID' : `AUTH_PUBLIC_KEY_${format.toUpperCase()}`;
	}
	if (/publishable.*missing|missing.*publishable/i.test(message)) return 'AUTH_PUBLIC_KEY_MISSING';
	if (/secret.?key/i.test(message)) return 'AUTH_SECRET_KEY';
	if (/handshake/i.test(message)) return 'AUTH_HANDSHAKE';
	if (/publishable/i.test(message)) return 'AUTH_CONFIGURATION';
	if (/environment|env.*variable/i.test(message)) return 'ENVIRONMENT';
	if (/module|ENOENT|manifest/i.test(message)) return 'RUNTIME_FILES';
	if (/invalid url/i.test(message)) return 'REQUEST_URL';
	return 'SERVER_ERROR';
}
