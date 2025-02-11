import { useSquirtStats } from "../hooks/useSquirtStats";
import { RefreshCw } from "lucide-react";
import type { ThemeConfig } from "../types/theme";

interface LeaderboardProps {
  theme: ThemeConfig;
}

export function Leaderboard({ theme }: LeaderboardProps) {
  const { stats, isLoading, error } = useSquirtStats();
  const t = theme;

  if (error) {
    return (
      <div
        className={`${t.card} rounded-2xl p-6 sm:p-8 ${t.border} border shadow-xl`}
      >
        <div className="text-red-500">Failed to load leaderboard</div>
      </div>
    );
  }

  return (
    <div
      className={`${t.card} rounded-2xl p-6 sm:p-8 ${t.border} border shadow-xl`}
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl sm:text-2xl font-semibold">Top Squirters</h2>
        {isLoading && <RefreshCw className="w-5 h-5 animate-spin" />}
      </div>

      <div className="space-y-4">
        {stats
          .sort((a, b) => b.totalSats - a.totalSats)
          .slice(0, 10) // Show top 10
          .map((stat, index) => (
            <div
              key={stat.address}
              className={`${t.cardDark} p-4 rounded-xl flex items-center justify-between`}
            >
              <div className="flex items-center space-x-4">
                <span className="text-2xl font-bold">#{index + 1}</span>
                <div>
                  <div className="font-semibold">
                    {stat.username || "Anonymous"}
                  </div>
                  <div className={`${t.textMuted} text-sm`}>
                    {stat.address.slice(0, 6)}...{stat.address.slice(-4)}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold">{stat.totalSats} sats</div>
                <div className={`${t.textMuted} text-sm`}>
                  {stat.totalSquirts} squirts
                </div>
              </div>
            </div>
          ))}

        {stats.length === 0 && !isLoading && (
          <div className={`${t.textMuted} text-center py-8`}>
            No squirts recorded yet. Be the first!
          </div>
        )}
      </div>
    </div>
  );
}
