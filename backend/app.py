import eventlet
eventlet.monkey_patch()
import os, json
from flask import Flask, request, jsonify
from flask_socketio import SocketIO

app = Flask(__name__)
socketio = SocketIO(app, async_mode="eventlet",
                    cors_allowed_origins=os.getenv("CORS_ORIGINS", "*"))


DATA_FILE = os.getenv("DATA_FILE", "data.json")

def load_data():
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return []

def save_data(data):
    os.makedirs(os.path.dirname(DATA_FILE) or ".", exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

@app.post("/webhook/form")
def webhook_form():
    payload = request.get_json(force=True, silent=True) or {}
    data = load_data()
    data.append(payload)
    save_data(data)
    socketio.emit("form_update", payload, broadcast=True)
    return jsonify({"ok": True})

@app.get("/api/entries")
def get_entries():
    return jsonify(load_data())

@app.get("/healthz")
def healthz():
    return "ok", 200

# Em produção (Render) rodaremos com gunicorn, então não chamamos socketio.run aqui.
if __name__ == "__main__":
    print(">> dev http://127.0.0.1:5000")
    socketio.run(app, host="0.0.0.0", port=5000)
