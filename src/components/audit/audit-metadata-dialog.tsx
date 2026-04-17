"use client";

import { FileJson } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type AuditMetadataDialogProps = {
  action: string;
  metadata: unknown;
};

export function AuditMetadataDialog({ action, metadata }: AuditMetadataDialogProps) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <FileJson />
            Détails
          </Button>
        }
      />
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Details de l import</DialogTitle>
          <DialogDescription>Action: {action}</DialogDescription>
        </DialogHeader>
        <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(metadata, null, 2)}
        </pre>
      </DialogContent>
    </Dialog>
  );
}
