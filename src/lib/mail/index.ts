import 'server-only'

/**
 * Mail abstraction. Dev prints to the console; production wires up whichever provider the
 * platform ends up using. Only the test-card flow uses this today.
 */
export interface MailMessage {
  to: string
  subject: string
  text: string
  html: string
}

export interface MailAdapter {
  send(message: MailMessage): Promise<void>
}

class ConsoleMailAdapter implements MailAdapter {
  async send(message: MailMessage): Promise<void> {
    // eslint-disable-next-line no-console
    console.info(
      `\n--- MAIL (dev) ---\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n------------------\n`,
    )
  }
}

let adapter: MailAdapter = new ConsoleMailAdapter()

export function getMailer(): MailAdapter {
  return adapter
}

export function setMailer(next: MailAdapter): void {
  adapter = next
}

export function testCardMail(url: string, programName: string): Omit<MailMessage, 'to'> {
  const name = programName.trim() || 'Stempelkarte'
  return {
    subject: `Deine Testkarte: ${name}`,
    text: [
      `Hier ist deine Testkarte für "${name}".`,
      '',
      'Öffne diesen Link auf dem Handy, dann landet die Karte direkt im Wallet:',
      url,
      '',
      'Der Link ist 30 Minuten gültig.',
    ].join('\n'),
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.5;color:#18181b">
        <p>Hier ist deine Testkarte für <strong>${escapeHtml(name)}</strong>.</p>
        <p>Öffne diesen Link auf dem Handy, dann landet die Karte direkt im Wallet:</p>
        <p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;background:#18181b;color:#fff;border-radius:8px;text-decoration:none">Karte öffnen</a></p>
        <p style="color:#71717a;font-size:13px">Der Link ist 30 Minuten gültig.</p>
      </div>
    `,
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
