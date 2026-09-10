"use client";

import { useState } from "react";
import { Lock, Plus, Ruler, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  CardBody,
  Field,
  IconButton,
  Input,
  PageHeader,
  Skeleton,
} from "@/components/ui";
import { useCreateUnit, useDeleteUnit, useUnits, useUpdateUnit } from "@/lib/query/units";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function UnitRow({ unit }: { unit: { id: string; name: string; abbreviation: string | null; isPlatformDefault: boolean } }) {
  const update = useUpdateUnit();
  const remove = useDeleteUnit();
  const [name, setName] = useState(unit.name);
  const [abbreviation, setAbbreviation] = useState(unit.abbreviation ?? "");

  if (unit.isPlatformDefault) {
    return (
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
        <div>
          <p className="text-body text-ink">{unit.name}</p>
          {unit.abbreviation ? <p className="text-caption text-ink-muted">{unit.abbreviation}</p> : null}
        </div>
        <Badge tone="neutral" icon={Lock}>
          Platform default
        </Badge>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            const trimmed = name.trim();
            if (trimmed && trimmed !== unit.name) {
              update.mutate(
                { id: unit.id, name: trimmed },
                { onError: (error) => toast.error(errorMessage(error, "Could not rename this unit.")) },
              );
            }
          }}
          className="w-40"
        />
        <Input
          value={abbreviation}
          onChange={(event) => setAbbreviation(event.target.value)}
          onBlur={() => {
            const trimmed = abbreviation.trim();
            if (trimmed !== (unit.abbreviation ?? "")) {
              update.mutate(
                { id: unit.id, abbreviation: trimmed || null },
                { onError: (error) => toast.error(errorMessage(error, "Could not update the abbreviation.")) },
              );
            }
          }}
          placeholder="Abbreviation"
          className="w-32"
        />
      </div>
      <IconButton
        icon={Trash2}
        label={`Delete ${unit.name}`}
        tone="danger"
        onClick={() => {
          if (!window.confirm(`Delete "${unit.name}"?`)) return;
          remove.mutate(unit.id, {
            onError: (error) => toast.error(errorMessage(error, "Could not delete this unit.")),
          });
        }}
      />
    </div>
  );
}

export default function UnitsPage() {
  const unitsQuery = useUnits();
  const createUnit = useCreateUnit();
  const [name, setName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");

  function onCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    createUnit.mutate(
      { name: trimmed, abbreviation: abbreviation.trim() || null },
      {
        onSuccess: () => {
          setName("");
          setAbbreviation("");
        },
        onError: (error) => toast.error(errorMessage(error, "Could not add that unit.")),
      },
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Ruler}
        title="Units"
        description="How your variants are counted and sold — pcs, kg, box, meter. Platform defaults are available to every shop; add your own on top."
      />

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-48">
              <Field label="New unit">
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onCreate();
                    }
                  }}
                  placeholder="e.g. Sack"
                />
              </Field>
            </div>
            <div className="w-32">
              <Field label="Abbreviation" required={false}>
                <Input
                  value={abbreviation}
                  onChange={(event) => setAbbreviation(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onCreate();
                    }
                  }}
                  placeholder="sk"
                />
              </Field>
            </div>
            <Button
              type="button"
              icon={Plus}
              onClick={onCreate}
              loading={createUnit.isPending}
              disabled={!name.trim()}
            >
              Add unit
            </Button>
          </div>
        </CardBody>
      </Card>

      {unitsQuery.isPending ? (
        <Card className="overflow-hidden py-0">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0"
            >
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-4 w-4" />
            </div>
          ))}
        </Card>
      ) : unitsQuery.isError ? (
        <Card className="px-4 py-8 text-center text-body text-danger">
          {errorMessage(unitsQuery.error, "Could not load units.")}
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          {(unitsQuery.data ?? []).map((unit) => (
            <UnitRow key={unit.id} unit={unit} />
          ))}
        </Card>
      )}
    </div>
  );
}
