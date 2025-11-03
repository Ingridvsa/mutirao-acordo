import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";

const BACKEND_URL = "http://localhost:5000";
const TARGET = 100;

const socket = io(BACKEND_URL, { transports: ["websocket"] });

export default function PanelRealtime() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    socket.on("form_update", (msg) => {
      const nome = msg?.respostas?.["Nome"]?.[0] ?? "";
      const numero = msg?.respostas?.["Número do processo"]?.[0] ?? "";
      const timestamp = msg?.timestamp ?? new Date().toISOString();

      if (nome || numero) {
        setItems((prev) => [{ nome, numero, timestamp }, ...prev]);
      }
    });

    return () => socket.off("form_update");
  }, []);

  const percent = useMemo(() => {
    return Math.min(100, Math.round((items.length / TARGET) * 100));
  }, [items.length]);

  return (
    <div className="panel">
      <header className="panel-header">
        <div>
          <h1>Coleta em tempo real</h1>
          <p>
            Meta: {TARGET} registros • Atual: {items.length}
          </p>
        </div>
        <CircleProgress percent={percent} />
      </header>

      <section className="list-container">
        <h2>Últimas respostas</h2>
        <div className="scrollable">
          {items.length === 0 ? (
            <p className="empty">Nenhuma resposta ainda…</p>
          ) : (
            items.map((it, i) => (
              <div key={i} className="item">
                <div>
                  <strong>#{items.length - i}</strong> —{" "}
                  <span>{it.nome}</span>
                </div>
                <div>
                  <small>Nº Processo:</small> {it.numero}
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
