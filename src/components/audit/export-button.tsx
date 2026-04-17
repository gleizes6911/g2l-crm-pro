"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ExportButton() {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        window.alert("Fonctionnalite d'export en cours de developpement");
      }}
    >
      <Download />
      Exporter
    </Button>
  );
}
