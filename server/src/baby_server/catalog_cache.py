"""Persistent public-product records, single-flight leases, and durable request budgets."""

import json
import sqlite3
import time
from contextlib import contextmanager


class CatalogCache:
    def __init__(self, path, *, clock=None):
        self.path = path
        self.clock = clock or time.time
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS products (
                    gtin TEXT PRIMARY KEY, data TEXT NOT NULL, expires_at REAL
                );
                CREATE TABLE IF NOT EXISTS requests (
                    bucket TEXT NOT NULL, created_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS requests_bucket ON requests(bucket, created_at);
                CREATE TABLE IF NOT EXISTS leases (
                    gtin TEXT PRIMARY KEY, expires_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS cooldowns (
                    bucket TEXT PRIMARY KEY, status TEXT NOT NULL, expires_at REAL NOT NULL
                );
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=5)
        try:
            with db:
                yield db
        finally:
            db.close()

    def get(self, gtin):
        with self.connect() as db:
            row = db.execute("SELECT data, expires_at FROM products WHERE gtin=?", (gtin,)).fetchone()
            if not row or (row[1] is not None and row[1] <= self.clock()):
                return None
            return json.loads(row[0])

    def put(self, gtin, result, *, ttl=None):
        expires = self.clock() + ttl if ttl is not None else None
        with self.connect() as db:
            db.execute("INSERT INTO products VALUES (?, ?, ?) ON CONFLICT(gtin) "
                       "DO UPDATE SET data=excluded.data, expires_at=excluded.expires_at",
                       (gtin, json.dumps(result, ensure_ascii=False), expires))

    def acquire(self, gtin):
        now = self.clock()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("DELETE FROM leases WHERE expires_at<=?", (now,))
            return db.execute("INSERT OR IGNORE INTO leases VALUES (?, ?)",
                              (gtin, now + 60)).rowcount == 1

    def release(self, gtin):
        with self.connect() as db:
            db.execute("DELETE FROM leases WHERE gtin=?", (gtin,))

    def reserve(self, bucket, limit, window):
        # Count before the HTTP call: timeouts can still consume provider quota.
        now = self.clock()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("DELETE FROM requests WHERE created_at<=?", (now - 86400,))
            count = db.execute("SELECT COUNT(*) FROM requests WHERE bucket=? AND created_at>?",
                               (bucket, now - window)).fetchone()[0]
            if count >= limit:
                return False
            db.execute("INSERT INTO requests VALUES (?, ?)", (bucket, now))
            return True

    def cooldown(self, bucket):
        with self.connect() as db:
            row = db.execute("SELECT status, expires_at FROM cooldowns WHERE bucket=?",
                             (bucket,)).fetchone()
            return row[0] if row and row[1] > self.clock() else None

    def pause(self, bucket, status, seconds=300):
        with self.connect() as db:
            db.execute("INSERT INTO cooldowns VALUES (?, ?, ?) ON CONFLICT(bucket) "
                       "DO UPDATE SET status=excluded.status, expires_at=excluded.expires_at",
                       (bucket, status, self.clock() + seconds))
