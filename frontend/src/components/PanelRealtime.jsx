import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";

const BACKEND_URL = "https://unlowered-cohesively-eleanor.ngrok-free.dev";
const TARGET = 100;

const socket = io(BACKEND_URL, {
  transports: ["websocket", "polling"],
  path: "/socket.io",
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});

socket.on("connect", () => console.log("✅ Conectado ao backend:", socket.id));
socket.on("connect_error", (err) => console.error("❌ Erro Socket.IO:", err.message));
socket.on("disconnect", (reason) => console.warn("⚠️ Desconectado:", reason));

export default function PanelRealtime() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    console.log("🎧 Escutando eventos 'form_update'...");
    const handler = (msg) => {
      console.log("📡 Recebido via socket:", msg);

      // Pega os campos diretamente do payload
      const nome = msg?.nome || "—";
      const numero = msg?.numero_processo || "—";
      const timestamp = msg?.timestamp ?? new Date().toISOString();

      setItems((prev) => [{ nome, numero, timestamp }, ...prev]);
    };

    socket.on("form_update", handler);
    return () => socket.off("form_update", handler);
  }, []);

  const percent = useMemo(() => {
    return Math.min(100, Math.round((items.length / TARGET) * 100));
  }, [items.length]);

  return (
    <div className="panel">
      <header className="panel-header">
        <div className="title">
          <h1>📊 Coleta em tempo real</h1>
          <p>Meta: {TARGET} registros • Atual: {items.length}</p>
        </div>
        <CircleProgress percent={percent} />
      </header>

      <section className="list-container">
        <h2>📥 Últimas respostas recebidas</h2>
        <div className="scrollable">
          {items.length === 0 ? (
            <p className="empty">Nenhuma resposta ainda…</p>
          ) : (
            items.map((it, i) => (
              <div key={i} className="item">
                <div>
                  <strong>#{items.length - i}</strong> — {it.nome}
                </div>
                <div>
                  <small>Nº Processo:</small> {it.numero}
                </div>
                <div>
                  <small>⏰ {new Date(it.timestamp).toLocaleString()}</small>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function CircleProgress({ percent, size = 100 }) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="circle-wrapper" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#ddd"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#4a6cf7"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div className="circle-label">
        <div className="circle-percent">{percent}%</div>
        <div className="circle-sub">de {TARGET}</div>
      </div>
    </div>
  );
}
