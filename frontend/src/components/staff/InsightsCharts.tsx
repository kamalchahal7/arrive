"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { type Count, langName, num, type Overview, type OverTime, show } from "./insights-types";

// Validated with the dataviz palette checker (light surface): blue + orange pass CVD and contrast checks.
const SERIES_1 = "#2a78d6";
const SERIES_2 = "#eb6834";
const GRID = "#e2ddd2";
const AXIS = "#5b635f";

const tooltipStyle = { borderRadius: 12, border: `1px solid ${GRID}`, fontFamily: "var(--font-atkinson)" };

export function TopTopicsChart({ topics }: { topics: Overview["top_topics"] }) {
  const data = topics.map((t) => ({
    label: t.label,
    value: num(t.this_week),
    display: show(t.this_week) + (t.spike ? "  ▲ spike" : ""),
    spike: t.spike,
    change: t.change_pct,
    last: show(t.last_week),
  }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 96, bottom: 4, left: 8 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="label" width={170} tick={{ fill: "#1c2321", fontSize: 13 }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: "#f6f3ec" }}
          contentStyle={tooltipStyle}
          formatter={(_v, _n, item) => {
            const p = item.payload as (typeof data)[number];
            return [`${p.display.replace("  ▲ spike", "")} this week · ${p.last} last week${p.change !== null ? ` · ${p.change > 0 ? "+" : ""}${p.change}%` : ""}`, p.spike ? "Spike" : "Requests"];
          }}
        />
        <Bar dataKey="value" maxBarSize={22} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.label} fill={d.spike ? SERIES_2 : SERIES_1} />
          ))}
          <LabelList dataKey="display" position="right" fill="#1c2321" fontSize={12} fontWeight={700} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function OverTimeChart({ weeks }: { weeks: OverTime["weeks"] }) {
  const data = weeks.map((w) => ({
    week: new Date(w.week + "T12:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" }),
    total: num(w.total),
    answered: num(w.answered),
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 24, bottom: 4, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="week" tick={{ fill: AXIS, fontSize: 12 }} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend iconType="plainline" wrapperStyle={{ color: "#1c2321", fontSize: 13 }} />
        <Line type="monotone" dataKey="total" name="All requests" stroke={SERIES_1} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} isAnimationActive={false} />
        <Line type="monotone" dataKey="answered" name="Answered from official sources" stroke={SERIES_2} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function LanguagesChart({ rows }: { rows: { language: string; count: Count }[] }) {
  const data = rows.map((r) => ({ label: langName(r.language), value: num(r.count), display: show(r.count) }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 32)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="label" width={110} tick={{ fill: "#1c2321", fontSize: 13 }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: "#f6f3ec" }} contentStyle={tooltipStyle} formatter={(_v, _n, item) => [(item.payload as (typeof data)[number]).display, "Requests"]} />
        <Bar dataKey="value" fill={SERIES_1} maxBarSize={22} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          <LabelList dataKey="display" position="right" fill="#1c2321" fontSize={12} fontWeight={700} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
