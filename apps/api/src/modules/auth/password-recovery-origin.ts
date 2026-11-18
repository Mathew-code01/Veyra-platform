export function getPasswordRecoveryRedirectOrigin(
  requestedOrigin: string | undefined,
  allowedOrigins: readonly string[],
): string | null {
  if (!requestedOrigin) return null;

  let normalizedRequestOrigin: string;
  try {
    normalizedRequestOrigin = new URL(requestedOrigin).origin;
  } catch {
    return null;
  }

  for (const allowedOrigin of allowedOrigins) {
    try {
      const normalizedAllowedOrigin = new URL(allowedOrigin.trim()).origin;
      if (normalizedAllowedOrigin === normalizedRequestOrigin) return normalizedAllowedOrigin;
    } catch {
      // Ignore malformed configuration entries and fail closed.
    }
  }

  return null;
}