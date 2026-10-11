"""Serve the API locally or behind an HTTPS reverse proxy."""

import os

from dotenv import load_dotenv
from waitress import serve

from baby_server.app import create_app


def main():
    load_dotenv()
    serve(create_app(), host=os.getenv("BABY_HOST", "127.0.0.1"),
          port=int(os.getenv("BABY_PORT", "8083")))
