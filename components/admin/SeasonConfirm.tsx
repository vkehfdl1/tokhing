"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type SeasonConfirmation = Readonly<{
  title: string;
  description: string;
  confirmLabel: string;
  variant: "default" | "destructive";
  onConfirm: () => Promise<void>;
}>;

type Props = Readonly<{
  confirmation: SeasonConfirmation;
  loading: boolean;
  onClose: () => void;
}>;

export default function SeasonConfirm({
  confirmation,
  loading,
  onClose,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-md rounded-2xl bg-white p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-black">{confirmation.title}</h3>
        <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">
          {confirmation.description}
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="h-12"
            onClick={onClose}
            disabled={loading}
          >
            취소
          </Button>
          <Button
            className={`h-12 ${
              confirmation.variant === "destructive"
                ? "bg-red-600 hover:bg-red-700"
                : ""
            }`}
            onClick={() => void confirmation.onConfirm()}
            disabled={loading}
          >
            {loading ? "처리 중..." : confirmation.confirmLabel}
          </Button>
        </div>
      </Card>
    </div>
  );
}
