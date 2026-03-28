import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

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

export async function sendEmail({ to, subject, html }) {
	if (!process.env.RESEND_API_KEY) {
		throw new Error('RESEND_API_KEY belum diset');
	}

	const requestedRecipients = toRecipientList(to);
	const devRedirectTo = (process.env.RESEND_DEV_REDIRECT_TO || '').trim();
	const useDevRedirect = Boolean(devRedirectTo);
	const finalRecipients = useDevRedirect ? [devRedirectTo] : requestedRecipients;

	if (useDevRedirect && requestedRecipients.length > 0) {
		const recipientNote = `<p style="font-size:12px;color:#64748b;margin:0 0 12px 0;"><strong>Dev redirect aktif:</strong> email ini aslinya ditujukan ke ${escapeHtml(requestedRecipients.join(', '))}</p>`;
		html = `${recipientNote}${html}`;
	}

	const result = await resend.emails.send({
		from: process.env.RESEND_FROM_EMAIL || 'Eventra <noreply@eventra.com>',
		to: finalRecipients,
		subject,
		html,
	});

	if (result?.error) {
		throw new Error(result.error.message || 'Gagal mengirim email via Resend');
	}

	if (useDevRedirect && requestedRecipients.length > 0) {
		console.log(`[mailer] DEV redirect: ${requestedRecipients.join(', ')} -> ${devRedirectTo}`);
	}

	return result;
}