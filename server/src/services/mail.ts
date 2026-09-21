/**
 * Outgoing mail, as a port.
 *
 * The server needs exactly two messages - verify your address, reset your
 * password - and pulling in an SMTP client for them would add a dependency, a
 * set of secrets and an outbound network call to the critical path of
 * registration. Instead there is an interface and three trivial drivers.
 * Wiring a real provider later means one more implementation of
 * {@link Mailer} and one more case in {@link createMailer}; nothing above
 * this file changes.
 *
 * The `log` driver prints the link to the server log, which is exactly what a
 * developer wants and exactly what a production deployment must not use - so
 * production is expected to set a real driver, and the startup log says so.
 */

import type { FastifyBaseLogger } from 'fastify';

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
  /** Test driver only: everything sent so far. */
  readonly outbox?: readonly MailMessage[];
}

class NoopMailer implements Mailer {
  async send(): Promise<void> {
    /* deliberately nothing */
  }
}

class LogMailer implements Mailer {
  constructor(private readonly log: FastifyBaseLogger) {}

  async send(message: MailMessage): Promise<void> {
    // The address is the whole point of the message, so it is logged; the
    // body is not, because it contains a live single-use token.
    this.log.info({ to: message.to, subject: message.subject }, 'mail: send');
    process.stdout.write(`\n--- mail to ${message.to} ---\n${message.text}\n---\n`);
  }
}

export class MemoryMailer implements Mailer {
  readonly outbox: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.outbox.push(message);
  }

  last(to?: string): MailMessage | undefined {
    const items = to ? this.outbox.filter((item) => item.to === to) : this.outbox;
    return items[items.length - 1];
  }

  clear(): void {
    this.outbox.length = 0;
  }
}

export function createMailer(driver: 'log' | 'noop' | 'memory', log: FastifyBaseLogger): Mailer {
  switch (driver) {
    case 'memory':
      return new MemoryMailer();
    case 'noop':
      return new NoopMailer();
    case 'log':
      return new LogMailer(log);
  }
}

export function verificationMessage(to: string, appUrl: string, token: string): MailMessage {
  const link = `${appUrl}/#/verify-email?token=${encodeURIComponent(token)}`;
  return {
    to,
    subject: 'Confirm your bBall account',
    text: [
      'Welcome to bBall.',
      '',
      'Confirm this address to finish setting up your account:',
      link,
      '',
      'If you did not create a bBall account, ignore this message.'
    ].join('\n')
  };
}

export function passwordResetMessage(to: string, appUrl: string, token: string): MailMessage {
  const link = `${appUrl}/#/reset-password?token=${encodeURIComponent(token)}`;
  return {
    to,
    subject: 'Reset your bBall password',
    text: [
      'Someone asked to reset the password for this bBall account.',
      '',
      'Use this link within the next day:',
      link,
      '',
      'If it was not you, nothing has changed and you can ignore this message.'
    ].join('\n')
  };
}
