import { Resend } from 'resend';

let resendInstance = null;

function getResend() {
  if (!resendInstance) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY belum diset');
    }
    resendInstance = new Resend(process.env.RESEND_API_KEY);
  }
  return resendInstance;
}
function toRecipientList(value) {
	if (!value) return [];
	if (Array.isArray(value)) return value.filter(Boolean);
	return [value];
}

function escapeHtml(text) {
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export async function sendEmail({ to, subject, html, attachments = [] }) {
	const recipients = toRecipientList(to);
	if (recipients.length === 0) {
		console.warn('[mailer] No recipients specified, skipping email.');
		return null;
	}

	const result = await getResend().emails.send({
		from: process.env.RESEND_FROM_EMAIL || 'Eventra <noreply@eventra.raihanadepurnomo.dev>',
		to: recipients,
		subject,
		html,
		attachments,
	});

	if (result?.error) {
		console.error('[mailer] Resend Error:', result.error);
		throw new Error(result.error.message || 'Gagal mengirim email via Resend');
	}

	console.log(`[mailer] Email sent to ${recipients.join(', ')} (Subject: "${subject}")`);

	return result;
}