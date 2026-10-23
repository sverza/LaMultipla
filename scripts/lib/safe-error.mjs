// Only use for application-owned diagnostics, never for provider bodies or user input.
export class SafeError extends Error {
  constructor(message) { super(message); this.name = 'SafeError'; this.safeMessage = message; }
}
