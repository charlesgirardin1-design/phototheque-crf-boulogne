"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import type { Taxonomy } from "@/lib/server/media";

export type { Taxonomy };

export function useTaxonomy(all = false) {
  const [categories, setCategories] = useState<Taxonomy>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const res = await api<{ categories: Taxonomy }>(`/api/taxonomy${all ? "?all=1" : ""}`);
      setCategories(res.categories);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    }
  }, [all]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement initial
    void reload();
  }, [reload]);
  return { categories, error, reload };
}
