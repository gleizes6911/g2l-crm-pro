"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ProviderFilterValue = "all" | "wex" | "webfleet";

type AuditFiltersProps = {
  provider?: string;
  search?: string;
};

export function AuditFilters({ provider, search }: AuditFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const currentParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(search ?? "");

  const providerValue: ProviderFilterValue =
    provider === "wex" || provider === "webfleet" ? provider : "all";

  const sharedParams = useMemo(
    () => new URLSearchParams(currentParams.toString()),
    [currentParams]
  );

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(sharedParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value && value.trim()) {
          params.set(key, value.trim());
        } else {
          params.delete(key);
        }
      }
      params.delete("page");
      const queryString = params.toString();
      const target = queryString ? `${pathname}?${queryString}` : pathname;
      startTransition(() => router.replace(target));
    },
    [pathname, router, sharedParams]
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchValue !== (search ?? "")) {
        updateParams({ search: searchValue });
      }
    }, 350);
    return () => clearTimeout(timeout);
  }, [searchValue, search, updateParams]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 md:flex-row md:items-center">
      <Select
        value={providerValue}
        onValueChange={(value) => {
          const next =
            value === "all" || value === null || value === undefined
              ? undefined
              : (value as "wex" | "webfleet");
          updateParams({ provider: next });
        }}
      >
        <SelectTrigger className="w-full md:w-48">
          <SelectValue placeholder="Provider" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous les providers</SelectItem>
          <SelectItem value="wex">WEX</SelectItem>
          <SelectItem value="webfleet">Webfleet</SelectItem>
        </SelectContent>
      </Select>

      <Input
        value={searchValue}
        onChange={(event) => setSearchValue(event.target.value)}
        placeholder="Filtrer par email utilisateur"
        className="w-full"
      />
      {isPending ? (
        <span className="text-xs text-muted-foreground md:min-w-24">Mise a jour...</span>
      ) : (
        <span className="text-xs text-muted-foreground md:min-w-24">Filtres actifs</span>
      )}
    </div>
  );
}
