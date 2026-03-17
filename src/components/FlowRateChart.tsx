"use client";

import { useEffect, useState } from "react";
import { dbService } from "../../services/dbReal";
import { ConsumoLog } from "../../types/models";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from "recharts";

type ChartDataPoint = {
  time: string;
  lps: number;
  rawDate: Date;
};

type Props = {
  devEui: string;
  deviceName: string;
};

export default function FlowRateChart({ devEui, deviceName }: Props) {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [daysBack, setDaysBack] = useState(3);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadChart = async () => {
      setLoading(true);
      try {
        const logs = await dbService.getConsumoLogsByDevEui(devEui, daysBack);
        const points: ChartDataPoint[] = [];

        for (let i = 1; i < logs.length; i++) {
          const prev = logs[i - 1];
          const curr = logs[i];
          const delta = curr.consumo - prev.consumo;

          // Filtro de ruido: solo graficamos flujo positivo
          const lps = delta > 0 ? (delta / 3600) * 1000 : 0;

          const date = curr.timestamp?.toDate?.() || new Date();
          points.push({
            time: date.toLocaleString("es-MX", {
              day: "2-digit", month: "short",
              hour: "2-digit", minute: "2-digit"
            }),
            lps: Number(lps.toFixed(3)),
            rawDate: date
          });
        }
        setData(points);
      } catch (err) {
        console.error("Error cargando gráfica:", err);
      } finally {
        setLoading(false);
      }
    };
    loadChart();
  }, [devEui, daysBack]);

  return (
    <div style={{
      background: "white",
      borderRadius: "12px",
      border: "1px solid var(--border-color)",
      padding: "1.5rem",
      marginTop: "0.8rem",
      marginBottom: "1.5rem"
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "1rem"
      }}>
        <h4 style={{ margin: 0, color: "var(--text-main)", fontSize: "0.95rem" }}>
          Caudal Promedio — {deviceName}
        </h4>
        <select
          value={daysBack}
          onChange={(e) => setDaysBack(Number(e.target.value))}
          style={{
            padding: "0.3rem 0.6rem",
            borderRadius: "6px",
            border: "1px solid var(--border-color)",
            fontSize: "0.8rem",
            color: "var(--text-main)",
            background: "white",
            cursor: "pointer"
          }}
        >
          <option value={1}>Último día</option>
          <option value={3}>Últimos 3 días</option>
          <option value={7}>Última semana</option>
          <option value={15}>Últimos 15 días</option>
          <option value={30}>Último mes</option>
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
          Cargando gráfica...
        </div>
      ) : data.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
          Sin datos suficientes para graficar. Se necesitan al menos 2 registros.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              label={{ value: "L/P/S", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#64748b" } }}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(255,255,255,0.95)",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                fontSize: "0.8rem"
              }}
              formatter={(value: number) => [`${value} L/P/S`, "Caudal"]}
            />
            <ReferenceLine y={0} stroke="#cbd5e1" />
            <Line
              type="monotone"
              dataKey="lps"
              stroke="#0ea5e9"
              strokeWidth={2}
              dot={{ r: 2, fill: "#0ea5e9" }}
              activeDot={{ r: 5, fill: "#0284c7" }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
