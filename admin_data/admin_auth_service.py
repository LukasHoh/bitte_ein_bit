from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import duckdb


_REPO_ROOT = Path(__file__).resolve().parents[1]
_DEFAULT_DB_PATH = _REPO_ROOT / "admin_data" / "dashboard_admin.duckdb"


@dataclass
class AdminSession:
    admin_id: str
    email: str
    country_code: str
    region: str


class AdminAuthService:
    """Email/password auth backed by DuckDB for dashboard admins."""

    def __init__(self, db_path: str | Path = _DEFAULT_DB_PATH) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> duckdb.DuckDBPyConnection:
        return duckdb.connect(str(self.db_path))

    def _init_schema(self) -> None:
        con = self._connect()
        try:
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS admins (
                    id TEXT PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT current_timestamp
                );
                """
            )
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS admin_profiles (
                    admin_id TEXT PRIMARY KEY,
                    country_code TEXT NOT NULL,
                    region TEXT NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
                    updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp
                );
                """
            )
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS admin_sessions (
                    token TEXT PRIMARY KEY,
                    admin_id TEXT NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT current_timestamp
                );
                """
            )
        finally:
            con.close()

    @staticmethod
    def _normalize_email(email: str) -> str:
        return email.strip().lower()

    @staticmethod
    def _normalize_country(country_code: str) -> str:
        return country_code.strip().upper()

    @staticmethod
    def _hash_password(password: str) -> str:
        salt = os.urandom(16)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)
        return f"{salt.hex()}:{digest.hex()}"

    @staticmethod
    def _verify_password(password: str, stored: str) -> bool:
        try:
            salt_hex, digest_hex = stored.split(":", 1)
            salt = bytes.fromhex(salt_hex)
            expected = bytes.fromhex(digest_hex)
        except Exception:
            return False
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)
        return hmac.compare_digest(actual, expected)

    def sign_up(self, *, email: str, password: str, country_code: str, region: str) -> str:
        email_n = self._normalize_email(email)
        country_n = self._normalize_country(country_code)
        region_n = region.strip()
        if not email_n or not password or not country_n or not region_n:
            raise ValueError("email, password, country_code and region are required.")
        if len(password) < 6:
            raise ValueError("password must have at least 6 characters.")

        admin_id = str(secrets.token_hex(16))
        password_hash = self._hash_password(password)

        con = self._connect()
        try:
            existing = con.execute(
                "SELECT id FROM admins WHERE email = ?",
                [email_n],
            ).fetchone()
            if existing:
                raise ValueError("admin already exists for this email.")

            con.execute(
                "INSERT INTO admins (id, email, password_hash) VALUES (?, ?, ?)",
                [admin_id, email_n, password_hash],
            )
            con.execute(
                "INSERT INTO admin_profiles (admin_id, country_code, region) VALUES (?, ?, ?)",
                [admin_id, country_n, region_n],
            )
        finally:
            con.close()
        return admin_id

    def sign_in(self, *, email: str, password: str) -> str:
        email_n = self._normalize_email(email)
        con = self._connect()
        try:
            row = con.execute(
                "SELECT id, password_hash FROM admins WHERE email = ?",
                [email_n],
            ).fetchone()
            if not row:
                raise ValueError("invalid email or password.")
            admin_id, password_hash = str(row[0]), str(row[1])
            if not self._verify_password(password, password_hash):
                raise ValueError("invalid email or password.")

            token = secrets.token_urlsafe(32)
            expires = datetime.now(timezone.utc) + timedelta(days=7)
            con.execute(
                "INSERT INTO admin_sessions (token, admin_id, expires_at) VALUES (?, ?, ?)",
                [token, admin_id, expires],
            )
            return token
        finally:
            con.close()

    def sign_out(self, *, token: str) -> None:
        con = self._connect()
        try:
            con.execute("DELETE FROM admin_sessions WHERE token = ?", [token])
        finally:
            con.close()

    def get_session(self, *, token: str) -> AdminSession | None:
        con = self._connect()
        try:
            row = con.execute(
                """
                SELECT a.id, a.email, p.country_code, p.region, s.expires_at
                FROM admin_sessions s
                JOIN admins a ON a.id = s.admin_id
                JOIN admin_profiles p ON p.admin_id = a.id
                WHERE s.token = ?
                """,
                [token],
            ).fetchone()
            if not row:
                return None

            expires_at = row[4]
            if isinstance(expires_at, datetime):
                expires_dt = (
                    expires_at
                    if expires_at.tzinfo is not None
                    else expires_at.replace(tzinfo=timezone.utc)
                )
            else:
                expires_dt = datetime.fromisoformat(str(expires_at)).replace(tzinfo=timezone.utc)
            if expires_dt < datetime.now(timezone.utc):
                con.execute("DELETE FROM admin_sessions WHERE token = ?", [token])
                return None

            return AdminSession(
                admin_id=str(row[0]),
                email=str(row[1]),
                country_code=str(row[2]),
                region=str(row[3]),
            )
        finally:
            con.close()

