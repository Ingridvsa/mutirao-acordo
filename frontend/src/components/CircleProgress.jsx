import { useEffect, useState } from "react";

export default function CircleProgress({ percent, size = 190, target = 100 }) {
  const [animatedPercent, setAnimatedPercent] = useState(0);
  const [lastPercent, setLastPercent] = useState(0);
  const [showPlane, setShowPlane] = useState(false);
  const [animationDuration, setAnimationDuration] = useState(6000); // padrão de 6s

  useEffect(() => {
    if (percent > lastPercent) {
      try {
        const audio = new Audio("/sounds/airplane.mp3");
        audio.volume = 0.6;

        // Quando o áudio carrega, ajusta a duração da animação
        audio.onloadedmetadata = () => {
          const dur = (audio.duration || 6) * 1000;
          setAnimationDuration(dur);
        };

        // Quando começar a tocar → mostra o avião
        audio.onplay = () => setShowPlane(true);

        // Quando o som acabar → esconde o avião
        audio.onended = () => setShowPlane(false);

        audio
          .play()
          .then(() => console.log("✈️ Som tocando e avião animando!"))
          .catch(() => {
            console.warn(
              "Som bloqueado até interação do usuário (clique na página)."
            );
          });
      } catch (err) {
        console.warn("Erro ao tocar som:", err);
      }
    }

    setLastPercent(percent);

    // 🎯 Animação gradual do círculo
    const start = animatedPercent;
    const end = percent;
    const duration = 1000;
    const startTime = performance.now();

    const animate = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const newValue = start + (end - start) * progress;
      setAnimatedPercent(newValue);
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }, [percent]);

  // ⚙️ Círculo de progresso
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animatedPercent / 100) * circumference;

  return (
    <div
      className="circle-wrapper"
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        overflow: "visible",
      }}
    >
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
          stroke="#f37021"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>

      {/* Texto central */}
      <div
        style={{
          position: "absolute",
          textAlign: "center",
          color: "#fff",
          lineHeight: 1.1,
        }}
      >
        <div style={{ fontSize: size * 0.24, fontWeight: 700 }}>
          {animatedPercent.toFixed(0)}%
        </div>
        <div style={{ fontSize: size * 0.11 }}>de {target}</div>
      </div>

      {/* ✈️ Avião animado */}
      {showPlane && (
        <div
          className="plane-emoji"
          style={{
            animation: `flyAcross ${animationDuration}ms ease-in-out forwards`,
          }}
        >
          ✈️
        </div>
      )}
    </div>
  );
}
