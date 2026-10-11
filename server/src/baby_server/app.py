"""Flask application factory with explicit-origin CORS and sanitized errors."""

from flask import Flask, request
from werkzeug.exceptions import HTTPException

from baby_server.api import create_api_blueprint
from baby_server.auth import AttemptLimiter, AuthClient, create_auth_blueprint
from baby_server.catalog import CatalogClient
from baby_server.errors import ApiError
from baby_server.planning_api import create_planning_blueprint
from baby_server.settings import Settings
from baby_server.store import Store


def create_app(settings=None, *, auth_client=None, catalog_client=None):
    settings = settings or Settings.from_env()
    app = Flask(__name__)
    app.config.update(MAX_CONTENT_LENGTH=64 * 1024, TRUSTED_HOSTS=list(settings.allowed_hosts))
    app.json.ensure_ascii = False
    app.extensions.update(auth=auth_client or AuthClient(settings), limiter=AttemptLimiter(),
                          store=Store(settings.database),
                          catalog=catalog_client or CatalogClient(settings),
                          catalog_limiter=AttemptLimiter())

    @app.before_request
    def cors():
        origin = request.headers.get("Origin")
        if request.method == "OPTIONS":
            headers = {header.strip().lower() for header in request.headers.get(
                "Access-Control-Request-Headers", ""
            ).split(",") if header.strip()}
            if (origin not in settings.allowed_origins
                    or request.headers.get("Access-Control-Request-Method") not in {"GET", "POST"}
                    or not headers.issubset({"authorization", "content-type"})):
                raise ApiError(403, "FORBIDDEN", "不允许此跨域请求。")
            return "", 204
        if request.method == "POST" and origin and origin not in settings.allowed_origins:
            raise ApiError(403, "FORBIDDEN", "不允许此跨域请求。")

    @app.after_request
    def headers(response):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        origin = request.headers.get("Origin")
        if origin in settings.allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
            response.vary.add("Origin")
        return response

    @app.errorhandler(ApiError)
    def api_error(error):
        response = app.json.response(error=error.code, message=error.message)
        response.status_code = error.status
        if error.status == 429:
            response.headers["Retry-After"] = "60"
        return response

    @app.errorhandler(HTTPException)
    def http_error(error):
        return {"error": error.name, "message": "请求未完成，请检查后重试。"}, error.code

    @app.get("/api/health")
    def health():
        return {"status": "ok", "service": "zdog-baby-server", "framework": "flask",
                "auth": {"provider": "zdog-auth", "configured": app.extensions["auth"].configured}}

    app.register_blueprint(create_auth_blueprint())
    app.register_blueprint(create_api_blueprint())
    app.register_blueprint(create_planning_blueprint())
    return app
