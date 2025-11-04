# wsgi.py (agora na raiz)

import eventlet
eventlet.monkey_patch()

# Importação do app que está em backend/app.py
from backend.app import app
from backend.app import socketio

# ... (você pode remover o bloco if __name__ == '__main__': se o Render usar só gunicorn)