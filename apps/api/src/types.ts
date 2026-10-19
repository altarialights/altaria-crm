export type AuthContext = {
	userId: string;
	sessionId: string;
	orgId: string | null;
};

export type AppEnv = {
	Bindings: CloudflareBindings;
	Variables: {
		auth: AuthContext;
	};
};
