import { LinkMetrics } from "@workspace/api-client-react";
import { Link2, ExternalLink, Hash, Workflow, Link } from "lucide-react";

interface MetricsDashboardProps {
  metrics: LinkMetrics;
}

export function MetricsDashboard({ metrics }: MetricsDashboardProps) {
  const cards = [
    {
      title: "Total Links",
      value: metrics.total,
      icon: <Link className="w-4 h-4" />,
      color: "text-foreground",
      bg: "bg-muted/50",
      border: "border-border/50",
    },
    {
      title: "Internal",
      value: metrics.internal,
      icon: <Link2 className="w-4 h-4" />,
      color: "text-teal-500",
      bg: "bg-teal-500/10",
      border: "border-teal-500/20",
    },
    {
      title: "External",
      value: metrics.external,
      icon: <ExternalLink className="w-4 h-4" />,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
    },
    {
      title: "Anchors",
      value: metrics.anchor,
      icon: <Hash className="w-4 h-4" />,
      color: "text-gray-400",
      bg: "bg-gray-500/10",
      border: "border-gray-500/20",
    },
    {
      title: "Special",
      value: metrics.special,
      icon: <Workflow className="w-4 h-4" />,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
      border: "border-purple-500/20",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {cards.map((card, i) => (
        <div key={i} className={`rounded-xl border ${card.border} bg-card/40 backdrop-blur p-4 flex flex-col justify-between overflow-hidden relative group`}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{card.title}</span>
            <div className={`p-1.5 rounded-md ${card.bg} ${card.color}`}>
              {card.icon}
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-bold font-mono tracking-tight ${card.color === 'text-foreground' ? 'text-foreground' : card.color}`}>{card.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
