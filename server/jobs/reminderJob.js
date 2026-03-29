import pool from '../db.js';
import { sendEventReminderEmail } from '../lib/transactionalEmails.js';

export async function runReminderTask() {
  try {
    // Cari event yang published, belum dikirim reminder-nya, dan mulai dalam 24-25 jam dari sekarang
    // Pengecekan <= 25 jam memberikan buffer sedikit agar tidak miss bila cron telat
    const [events] = await pool.query(`
      SELECT * FROM events 
      WHERE status = 'PUBLISHED' 
        AND is_reminder_sent = 0 
        AND start_date > NOW() 
        AND start_date <= DATE_ADD(NOW(), INTERVAL 24 HOUR)
    `);

    if (events.length === 0) {
      return; 
    }

    console.log(`[reminderJob] Found ${events.length} events needing 24h reminders.`);

    for (const event of events) {
      // Tandai dulu sedang/sudah diproses untuk cegah duplicate fire
      await pool.query('UPDATE events SET is_reminder_sent = 1 WHERE id = ?', [event.id]);

      // Ambil tiket yang VALID untuk event ini
      const [tickets] = await pool.query(`
        SELECT t.user_id, t.attendee_details, u.email as buyer_email, u.name as buyer_name
        FROM tickets t
        JOIN ticket_types tt ON t.ticket_type_id = tt.id
        JOIN users u ON t.user_id = u.id
        WHERE tt.event_id = ? AND t.status NOT IN ('CANCELLED', 'TRANSFERRED')
      `, [event.id]);

      const sentEmails = new Set();
      let emailCount = 0;

      for (const ticket of tickets) {
        // Parsing json attendee_details
        let attendees = [];
        try {
          if (typeof ticket.attendee_details === 'string') {
            attendees = JSON.parse(ticket.attendee_details);
          } else if (ticket.attendee_details) {
            attendees = ticket.attendee_details;
          }
        } catch (e) {
          // Fallback if parsing fails
        }

        // Kalau tidak ada attendee details atau email kosong, kirim ke buyer email
        if (!attendees || !Array.isArray(attendees) || attendees.length === 0) {
          if (ticket.buyer_email && !sentEmails.has(ticket.buyer_email)) {
            sentEmails.add(ticket.buyer_email);
            // Fire target Email asynchronously
            sendEventReminderEmail({
              to: ticket.buyer_email,
              recipientName: ticket.buyer_name || 'Pembeli Tiket',
              event: {
                title: event.title,
                startDate: event.start_date,
                location: event.location
              }
            }).catch(e => console.error('[reminderJob/send] Error', e));
            emailCount++;
          }
        } else {
          // Iterasi setiap nama & email di attendee details
          for (const attendee of attendees) {
            const targetEmail = attendee?.email || ticket.buyer_email;
            if (targetEmail && !sentEmails.has(targetEmail)) {
              sentEmails.add(targetEmail);
              sendEventReminderEmail({
                to: targetEmail,
                recipientName: attendee?.name || ticket.buyer_name || 'Peserta',
                event: {
                  title: event.title,
                  startDate: event.start_date,
                  location: event.location
                }
              }).catch(e => console.error('[reminderJob/send] Error', e));
              emailCount++;
            }
          }
        }
      }

      console.log(`[reminderJob] Dispatched ${emailCount} reminder emails for event: ${event.id}`);
    }
  } catch (err) {
    console.error('[reminderJob] Task failed to execute', err);
  }
}
