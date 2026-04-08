import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_ANALYTICS_ASSUMPTIONS, DEFAULT_ANALYTICS_FIELD_MAP } from "../config/analyticsFieldMapping";
import { getAnalyticsRecords } from "../services/analyticsDataService";

export function useAnalyticsData({
  source = "api",
  autoRefreshMs = 20000,
  fieldMap = DEFAULT_ANALYTICS_FIELD_MAP,
  assumptions = DEFAULT_ANALYTICS_ASSUMPTIONS,
  csvText = "",
  csvUrl = "",
} = {}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async () => {
    try {
      const nextRows = await getAnalyticsRecords({ source, csvText, csvUrl, fieldMap, assumptions });
      setRows(nextRows);
      setError("");
      setLastUpdated(new Date());
    } catch (err) {
      setError(err?.message || "Unable to load analytics records");
    } finally {
      setLoading(false);
    }
  }, [assumptions, csvText, csvUrl, fieldMap, source]);

  useEffect(() => {
    load();
    const id = setInterval(load, autoRefreshMs);
    return () => clearInterval(id);
  }, [autoRefreshMs, load]);

  return useMemo(() => ({
    rows,
    loading,
    error,
    lastUpdated,
    refresh: load,
  }), [rows, loading, error, lastUpdated, load]);
}
