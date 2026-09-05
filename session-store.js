const session = require("express-session");

class SQLiteSessionStore extends session.Store {
  constructor(db, { ttl = 1000 * 60 * 60 * 24 * 7 } = {}) {
    super();
    this.db = db;
    this.ttl = ttl;
    this.writes = 0;
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
    `);
    this.getSession = db.prepare("SELECT sess FROM sessions WHERE sid = ? AND expires_at > ?");
    this.setSession = db.prepare(`
      INSERT INTO sessions (sid, sess, expires_at) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires_at = excluded.expires_at
    `);
    this.destroySession = db.prepare("DELETE FROM sessions WHERE sid = ?");
    this.clearExpired = db.prepare("DELETE FROM sessions WHERE expires_at <= ?");
  }

  expiresAt(sess) {
    const explicitExpiry = sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : NaN;
    return Number.isFinite(explicitExpiry) ? explicitExpiry : Date.now() + this.ttl;
  }

  get(sid, callback) {
    try {
      const row = this.getSession.get(sid, Date.now());
      callback(null, row ? JSON.parse(row.sess) : null);
    } catch (err) {
      callback(err);
    }
  }

  set(sid, sess, callback = () => {}) {
    try {
      this.setSession.run(sid, JSON.stringify(sess), this.expiresAt(sess));
      this.writes += 1;
      if (this.writes % 100 === 0) this.clearExpired.run(Date.now());
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  destroy(sid, callback = () => {}) {
    try {
      this.destroySession.run(sid);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  touch(sid, sess, callback = () => {}) {
    this.set(sid, sess, callback);
  }
}

module.exports = SQLiteSessionStore;
