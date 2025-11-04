import eventlet
eventlet.monkey_patch()

from backend.app import app
from backend.app import socketio # Importe o socketio se for usar com eventlet

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000)