"""zdog-auth adapter using the same trusted machine API contract as Yizhu."""

import time
from functools import wraps
from threading import Lock
from urllib.parse import urlsplit

import requests
from flask import Blueprint, current_app, g, request

from baby_server.errors import ApiError
from baby_server.validation import body, text


class AuthClient:
    def __init__(self, settings):
        self.settings = settings
        issuer = urlsplit(settings.auth_issuer)
        self.configured = bool(
            settings.auth_client_id and settings.auth_client_secret and issuer.hostname
            and (issuer.scheme == "https" or (
                issuer.scheme == "http" and issuer.hostname in {"127.0.0.1", "localhost", "::1"}
            )) and not (issuer.username or issuer.password or issuer.query or issuer.fragment)
        )

    def post(self, path: str, payload: dict):
        if not self.configured:
            raise ApiError(503, "AUTH_NOT_CONFIGURED", "登录服务尚未配置，可先使用本地体验。")
        try:
            response = requests.post(
                f"{self.settings.auth_issuer.rstrip('/')}{path}",
                json={**payload, "client_id": self.settings.auth_client_id,
                      "client_secret": self.settings.auth_client_secret},
                timeout=(3, 8), allow_redirects=False,
            )
        except requests.RequestException:
            raise ApiError(503, "AUTH_UNAVAILABLE", "登录服务暂不可用，请稍后重试。") from None
        if response.status_code in {400, 401, 403, 409, 429}:
            raise ApiError(response.status_code, "AUTH_REJECTED", "登录无效或操作过于频繁，请重试。")
        if not 200 <= response.status_code < 300:
            raise ApiError(503, "AUTH_UNAVAILABLE", "登录服务暂不可用，请稍后重试。")
        try:
            data = response.json()
        except ValueError:
            raise ApiError(502, "AUTH_BAD_RESPONSE", "登录服务返回异常。") from None
        if not isinstance(data, dict) or data.get("error"):
            raise ApiError(502, "AUTH_BAD_RESPONSE", "登录服务返回异常。")
        return data

    def userinfo(self, token):
        data = self.post("/machine/userinfo", {"access_token": token})
        if not isinstance(data.get("sub"), str) or not data["sub"].strip():
            raise ApiError(401, "UNAUTHORIZED", "登录已过期，请重新登录。")
        return data


class AttemptLimiter:
    """Single-process login protection; use an edge limiter for multiple workers."""

    def __init__(self):
        self.buckets = {}
        self.lock = Lock()

    def allow(self, address):
        now = time.monotonic()
        with self.lock:
            self.buckets = {key: value for key, value in self.buckets.items()
                            if now - value[0] < 60}
            if address not in self.buckets and len(self.buckets) >= 2048:
                return False
            start, count = self.buckets.get(address, (now, 0))
            if count >= 20:
                return False
            self.buckets[address] = (start, count + 1)
            return True


def auth_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        parts = request.headers.get("Authorization", "").split()
        if (len(parts) != 2 or parts[0].lower() != "bearer"
                or not parts[1] or len(parts[1]) > 8192):
            raise ApiError(401, "UNAUTHORIZED", "请先登录。")
        g.user_id = current_app.extensions["auth"].userinfo(parts[1])["sub"]
        return view(*args, **kwargs)
    return wrapped


def create_auth_blueprint():
    auth = Blueprint("auth", __name__, url_prefix="/api/auth")

    @auth.before_request
    def limit():
        if request.method == "POST" and not current_app.extensions["limiter"].allow(
            request.remote_addr or "unknown"
        ):
            raise ApiError(429, "RATE_LIMITED", "操作过于频繁，请稍后重试。")

    def token_response(data):
        token = data.get("access_token")
        if (not isinstance(token, str) or not token or len(token) > 8192
                or any(char.isspace() for char in token)):
            raise ApiError(502, "AUTH_BAD_RESPONSE", "登录服务未返回有效令牌。")
        return {"access_token": token}

    @auth.post("/wechat")
    def wechat():
        data = body({"code"})
        return token_response(current_app.extensions["auth"].post(
            "/machine/wechat/miniprogram", {"code": text(data, "code", 512)}
        ))

    @auth.post("/login")
    def login():
        data = body({"username", "password"})
        return token_response(current_app.extensions["auth"].post(
            "/machine/password/login",
            {"username": text(data, "username", 128),
             "password": text(data, "password", 256, trim=False)},
        ))

    @auth.get("/me")
    @auth_required
    def me():
        return {"id": g.user_id}

    return auth
