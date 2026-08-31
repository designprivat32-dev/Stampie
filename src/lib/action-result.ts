import { ZodError } from 'zod'
import {
  CardAccessError,
  PasswordConfirmationError,
  StampPermissionError,
  UnauthorizedError,
} from '@/lib/auth/session'

/**
 * One response envelope for every server action, so the client always destructures the
 * same shape and never has to guess whether a rejection was a validation problem or a
 * crash.
 */
export interface ActionSuccess<T> {
  success: true
  data: T
  error: null
  meta?: Record<string, unknown>
}

export interface ActionFailure {
  success: false
  data: null
  error: {
    message: string
    code: 'validation' | 'forbidden' | 'not_found' | 'rate_limited' | 'internal'
    /** Field path -> German message, ready to drop into the form. */
    fields?: Record<string, string>
  }
  meta?: Record<string, unknown>
}

export type ActionResult<T> = ActionSuccess<T> | ActionFailure

export function ok<T>(data: T, meta?: Record<string, unknown>): ActionSuccess<T> {
  return meta ? { success: true, data, error: null, meta } : { success: true, data, error: null }
}

export function fail(
  message: string,
  code: ActionFailure['error']['code'] = 'internal',
  fields?: Record<string, string>,
): ActionFailure {
  return { success: false, data: null, error: fields ? { message, code, fields } : { message, code } }
}

export function fromZodError(error: ZodError): ActionFailure {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_'
    // Keep the first message per path — the form shows one error per control.
    if (!fields[path]) fields[path] = issue.message
  }
  const first = error.issues[0]?.message ?? 'Die Eingaben sind unvollständig.'
  return fail(first, 'validation', fields)
}

/**
 * Wraps an action body so auth and validation failures always come back as a typed
 * envelope instead of an unhandled server exception.
 */
export async function guarded<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof ZodError) return fromZodError(e)
    if (e instanceof UnauthorizedError) return fail(e.message, 'forbidden')
    // Keyed to the field as well, so the confirmation dialog can mark its own input.
    if (e instanceof PasswordConfirmationError) {
      return fail(e.message, 'forbidden', { password: e.message })
    }
    if (e instanceof StampPermissionError) return fail(e.message, 'forbidden')
    if (e instanceof CardAccessError) return fail(e.message, 'not_found')
    // eslint-disable-next-line no-console
    console.error('[action]', e)
    return fail('Da ist etwas schiefgelaufen. Bitte erneut versuchen.', 'internal')
  }
}
