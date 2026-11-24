// Where Scrim sends things. Fill these in once the services exist (see server/feedback/README.md).
// An empty value switches that feature off quietly.

/** The feedback service (server/feedback), e.g. 'https://feedback.example.com' */
export const FEEDBACK_URL = ''


/** Sentry project key ("DSN") for crash reports. It's safe to ship in the app. */
export const SENTRY_DSN = ''

/** The values in use: an environment variable wins (for testing a build against other servers). */
export const feedbackUrl = (): string => (typeof process !== 'undefined' && process.env?.SCRIM_FEEDBACK_URL) || FEEDBACK_URL
export const sentryDsn = (): string => (typeof process !== 'undefined' && process.env?.SCRIM_SENTRY_DSN) || SENTRY_DSN
