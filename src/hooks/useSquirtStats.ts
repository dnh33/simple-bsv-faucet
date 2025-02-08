import { useState, useEffect, useCallback } from "react";
import { supabaseClient } from "../supabaseClient";
import { logger } from "../utils/logger";
import type { SquirtStats } from "../types/index";

export function useSquirtStats() {
  const [stats, setStats] = useState<SquirtStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      logger.info("🔄 Fetching squirt stats from Supabase...");
      setIsLoading(true);

      const { data, error: dbError } = await supabaseClient
        .from("squirts")
        .select("sender_address, username, amount, created_at")
        .order("created_at", { ascending: false });

      if (dbError) {
        logger.error("❌ Supabase query error:", dbError);
        throw dbError;
      }

      logger.info(
        `✅ Successfully fetched ${data?.length || 0} squirt records`
      );

      // Aggregate the data
      const statsMap = new Map<string, SquirtStats>();

      data?.forEach((squirt) => {
        const existing = statsMap.get(squirt.sender_address) || {
          address: squirt.sender_address,
          username: squirt.username,
          totalSquirts: 0,
          totalSats: 0,
          lastActive: 0,
        };

        statsMap.set(squirt.sender_address, {
          ...existing,
          totalSquirts: existing.totalSquirts + 1,
          totalSats: existing.totalSats + squirt.amount,
          lastActive: Math.max(
            existing.lastActive,
            new Date(squirt.created_at).getTime()
          ),
          username: squirt.username || existing.username,
        });
      });

      const aggregatedStats = Array.from(statsMap.values());
      logger.info("📊 Stats aggregation complete:", {
        uniqueSquirters: aggregatedStats.length,
        totalSquirts: aggregatedStats.reduce(
          (sum, stat) => sum + stat.totalSquirts,
          0
        ),
        totalSats: aggregatedStats.reduce(
          (sum, stat) => sum + stat.totalSats,
          0
        ),
      });

      setStats(aggregatedStats);
      setError(null);
    } catch (err) {
      setError("Failed to fetch squirt stats");
      logger.error("❌ Error in fetchStats:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchStats();

    // Set up real-time subscription
    logger.info("🔌 Setting up Supabase real-time subscription");
    const subscription = supabaseClient
      .channel("squirts_changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "squirts",
        },
        (payload) => {
          logger.info("🔄 Real-time update received:", payload);
          // Fetch fresh data when a new squirt is recorded
          fetchStats();
        }
      )
      .subscribe((status) => {
        logger.info(`📡 Supabase subscription status: ${status}`);
      });

    // Cleanup subscription
    return () => {
      logger.info("🧹 Cleaning up Supabase subscription");
      subscription.unsubscribe();
    };
  }, [fetchStats]);

  // We don't need addNewSquirt anymore since we're using real-time updates
  return { stats, isLoading, error };
}
