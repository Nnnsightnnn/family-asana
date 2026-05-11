import { Resend } from 'resend';
import { env } from './env.js';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendMagicLink(email: string, url: string): Promise<void> {
  if (!resend) {
    // Dev mode: log the link so the developer can paste it.
    // eslint-disable-next-line no-console
    console.log(`\n[magic-link] for ${email}:\n  ${url}\n`);
    return;
  }
  await resend.emails.send({
    from: env.RESEND_FROM,
    to: email,
    subject: 'Your Family Asana sign-in link',
    text: `Click to sign in:\n\n${url}\n\nThis link expires in 15 minutes.`,
    html: `<p>Click to sign in to Family Asana:</p>
           <p><a href="${url}">${url}</a></p>
           <p style="color:#888;font-size:12px">This link expires in 15 minutes.</p>`,
  });
}
