"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";

const LegacyApp = dynamic(() => import("@/legacy/App"), { ssr: false });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

export function LegacyRoot() {
  return (
    <QueryClientProvider client={queryClient}>
      <LegacyApp />
    </QueryClientProvider>
  );
}
