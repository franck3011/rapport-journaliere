import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartBlock } from "@/lib/table-block";

const COLORS = ["#1e3a5f", "#2f6f8f", "#4a9bb8", "#7cc3d6", "#a9d9e5", "#cfe9f0"];

/** Rendu d'un bloc graphique (barres, courbe ou camembert). */
export function ChartBlockView({ block }: { block: ChartBlock }) {
  const height = 260;

  return (
    <figure className="rounded-lg border bg-card p-3">
      {block.title && (
        <figcaption className="mb-2 text-sm font-semibold">{block.title}</figcaption>
      )}

      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          {block.kind === "pie" ? (
            <PieChart>
              <Pie
                data={block.data}
                dataKey="value"
                nameKey="label"
                outerRadius={90}
                label={(entry: any) => entry.label}
              >
                {block.data.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          ) : block.kind === "line" ? (
            <LineChart data={block.data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#1e3a5f" strokeWidth={2} />
            </LineChart>
          ) : (
            <BarChart data={block.data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#1e3a5f" radius={[3, 3, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
