import express from 'express';
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import crypto from 'crypto';

const router = express.Router();

// Get individual Seat Social profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM seat_social_profiles WHERE user_id = ?',
      [req.user.id]
    );
    res.json({ profile: rows[0] || null });
  } catch (err) {
    console.error('[social/profile/get]', err);
    res.status(500).json({ error: 'Failed to fetch social profile' });
  }
});

// Create or update Seat Social profile
router.put('/profile', authenticateToken, async (req, res) => {
  const { display_name, bio, instagram_handle } = req.body;
  
  if (!display_name || display_name.trim().length === 0) {
    return res.status(400).json({ error: 'Display name is required' });
  }
  
  if (bio && bio.length > 160) {
    return res.status(400).json({ error: 'Bio max 160 characters' });
  }

  try {
    const [existing] = await pool.query(
      'SELECT id FROM seat_social_profiles WHERE user_id = ?',
      [req.user.id]
    );

    const cleanIG = instagramHandle ? instagramHandle.replace(/^@+/, '') : null;

    if (existing.length > 0) {
      await pool.query(
        'UPDATE seat_social_profiles SET display_name = ?, bio = ?, instagram_handle = ?, updated_at = NOW() WHERE user_id = ?',
        [display_name.trim(), bio || null, cleanIG, req.user.id]
      );
    } else {
      await pool.query(
        'INSERT INTO seat_social_profiles (id, user_id, display_name, bio, instagram_handle) VALUES (?, ?, ?, ?, ?)',
        [crypto.randomUUID(), req.user.id, display_name.trim(), bio || null, cleanIG]
      );
    }

    const [updated] = await pool.query(
      'SELECT * FROM seat_social_profiles WHERE user_id = ?',
      [req.user.id]
    );
    res.json({ profile: updated[0] });
  } catch (err) {
    console.error('[social/profile/put]', err);
    res.status(500).json({ error: 'Failed to update social profile' });
  }
});

// Join Seat Social for a specific event
router.post('/events/:eventId/join', authenticateToken, async (req, res) => {
  const { eventId } = req.params;
  const { ticket_id } = req.body;

  if (!ticket_id) {
    return res.status(400).json({ error: 'Ticket ID is required' });
  }

  try {
    // 1. Validate that the user owns a valid ticket for this event
    const [tickets] = await pool.query(
      'SELECT id FROM tickets WHERE id = ? AND user_id = ? AND status != "CANCELLED"',
      [ticket_id, req.user.id]
    );

    if (tickets.length === 0) {
      return res.status(403).json({ error: 'You do not have a valid ticket for this event' });
    }

    // 2. Check if user has a social profile
    const [profiles] = await pool.query(
      'SELECT id FROM seat_social_profiles WHERE user_id = ?',
      [req.user.id]
    );

    if (profiles.length === 0) {
      return res.status(400).json({ error: 'Please set up your social profile first' });
    }

    // 3. Upsert into event_participants
    const [existing] = await pool.query(
      'SELECT id FROM event_participants WHERE event_id = ? AND user_id = ?',
      [eventId, req.user.id]
    );

    if (existing.length > 0) {
      await pool.query(
        'UPDATE event_participants SET is_visible = TRUE, ticket_id = ? WHERE id = ?',
        [ticket_id, existing[0].id]
      );
      res.json({ success: true, participantId: existing[0].id });
    } else {
      const participantId = crypto.randomUUID();
      await pool.query(
        'INSERT INTO event_participants (id, event_id, user_id, ticket_id, is_visible) VALUES (?, ?, ?, ?, TRUE)',
        [participantId, eventId, req.user.id, ticket_id]
      );
      res.json({ success: true, participantId });
    }
  } catch (err) {
    console.error('[social/join]', err);
    res.status(500).json({ error: 'Failed to join Seat Social' });
  }
});

// Leave Seat Social for an event (soft delete)
router.post('/events/:eventId/leave', authenticateToken, async (req, res) => {
  const { eventId } = req.params;
  try {
    await pool.query(
      'UPDATE event_participants SET is_visible = FALSE WHERE event_id = ? AND user_id = ?',
      [eventId, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[social/leave]', err);
    res.status(500).json({ error: 'Failed to leave Seat Social' });
  }
});

// Get participants for an event
router.get('/events/:eventId/participants', authenticateToken, async (req, res) => {
  const { eventId } = req.params;
  try {
    // Check if the current user is a participant
    const [me] = await pool.query(
      'SELECT id FROM event_participants WHERE event_id = ? AND user_id = ? AND is_visible = TRUE',
      [eventId, req.user.id]
    );
    
    // We only allow seeing participants if you are one yourself
    if (me.length === 0) {
      return res.status(403).json({ error: 'You must join Seat Social for this event first', notJoined: true });
    }

    const myParticipantId = me[0].id;

    // Fetch participants with their social profiles
    // and the wave status relative to the current user
    const [participants] = await pool.query(`
      SELECT 
        ep.id as participant_id,
        ep.joined_at,
        ssp.display_name,
        ssp.bio,
        ssp.instagram_handle,
        u.image as avatar_url,
        w.id as wave_id,
        w.status as wave_status,
        w.sender_id as wave_sender_id
      FROM event_participants ep
      JOIN seat_social_profiles ssp ON ep.user_id = ssp.user_id
      JOIN users u ON ep.user_id = u.id
      LEFT JOIN waves w ON (
        (w.sender_id = ? AND w.receiver_id = ep.id) OR 
        (w.sender_id = ep.id AND w.receiver_id = ?)
      ) AND w.event_id = ?
      WHERE ep.event_id = ? AND ep.user_id != ? AND ep.is_visible = TRUE
      ORDER BY ep.joined_at DESC
    `, [myParticipantId, myParticipantId, eventId, eventId, req.user.id]);

    res.json({ participants });
  } catch (err) {
    console.error('[social/participants]', err);
    res.status(500).json({ error: 'Failed to fetch participants' });
  }
});

// Get incoming waves count
router.get('/waves/inbox/count', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT COUNT(*) as count 
      FROM waves w
      JOIN event_participants ep ON w.receiver_id = ep.id
      WHERE ep.user_id = ? AND w.status = 'PENDING'
    `, [req.user.id]);
    res.json({ count: rows[0].count });
  } catch (err) {
    console.error('[social/waves/count]', err);
    res.status(500).json({ error: 'Failed to fetch wave count' });
  }
});

// Get incoming waves
router.get('/waves/inbox', authenticateToken, async (req, res) => {
  try {
    const [waves] = await pool.query(`
      SELECT 
        w.*,
        COALESCE(NULLIF(ssp.display_name, ''), u.name, 'Peserta') as sender_name,
        u.image as sender_avatar,
        e.title as event_title
      FROM waves w
      JOIN event_participants ep_sender ON w.sender_id = ep_sender.id
      JOIN seat_social_profiles ssp ON ep_sender.user_id = ssp.user_id
      JOIN users u ON ep_sender.user_id = u.id
      JOIN event_participants ep_receiver ON w.receiver_id = ep_receiver.id
      JOIN events e ON w.event_id = e.id
      WHERE ep_receiver.user_id = ?
      ORDER BY w.created_at DESC
      LIMIT 50
    `, [req.user.id]);
    res.json({ waves });
  } catch (err) {
    console.error('[social/waves/inbox]', err);
    res.status(500).json({ error: 'Failed to fetch waves' });
  }
});

// Send a wave
router.post('/waves', authenticateToken, async (req, res) => {
  const { receiver_participant_id, event_id, message } = req.body;

  if (!receiver_participant_id || !event_id) {
    return res.status(400).json({ error: 'Receiver and Event ID are required' });
  }

  if (message && message.length > 100) {
    return res.status(400).json({ error: 'Message max 100 characters' });
  }

  try {
    // Get sender participant ID
    const [sender] = await pool.query(
      'SELECT id FROM event_participants WHERE event_id = ? AND user_id = ?',
      [event_id, req.user.id]
    );

    if (sender.length === 0) {
      return res.status(403).json({ error: 'You are not a participant in this event' });
    }

    const senderParticipantId = sender[0].id;

    if (senderParticipantId === receiver_participant_id) {
      return res.status(400).json({ error: 'You cannot wave to yourself' });
    }

    await pool.query(
      'INSERT INTO waves (id, event_id, sender_id, receiver_id, message) VALUES (?, ?, ?, ?, ?)',
      [crypto.randomUUID(), event_id, senderParticipantId, receiver_participant_id, message || null]
    );

    res.json({ success: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'You have already waved to this person' });
    }
    console.error('[social/waves/send]', err);
    res.status(500).json({ error: 'Failed to send wave' });
  }
});

// Respond to a wave
router.post('/waves/:waveId/respond', authenticateToken, async (req, res) => {
  const { waveId } = req.params;
  const { action } = req.body; // 'ACCEPTED' or 'IGNORED'

  if (!['ACCEPTED', 'IGNORED'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  try {
    // Validate that the user is the receiver
    const [wave] = await pool.query(`
      SELECT w.id 
      FROM waves w
      JOIN event_participants ep ON w.receiver_id = ep.id
      WHERE w.id = ? AND ep.user_id = ?
    `, [waveId, req.user.id]);

    if (wave.length === 0) {
      return res.status(403).json({ error: 'Wave not found or unauthorized' });
    }

    await pool.query(
      'UPDATE waves SET status = ?, responded_at = NOW() WHERE id = ?',
      [action, waveId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[social/waves/respond]', err);
    res.status(500).json({ error: 'Failed to respond to wave' });
  }
});

export default router;
