import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DndContext, type DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { api } from "../api/client";
import type { Application, ApplicationStage, Document } from "../api/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STAGES: ApplicationStage[] = [
  "FOUND",
  "REVIEWING",
  "APPLIED",
  "INTERVIEW",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
];

const STAGE_LABELS: Record<ApplicationStage, string> = {
  FOUND: "Found",
  REVIEWING: "Reviewing",
  APPLIED: "Applied",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

function DocPicker({
  label,
  docs,
  value,
  onChange,
}: {
  label: string;
  docs: Document[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <div className="mt-1">
      <label className="text-[10px] uppercase text-muted-foreground">{label}</label>
      <select
        className="mt-0.5 w-full rounded border bg-background px-1.5 py-1 text-xs"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <option value="">— none —</option>
        {docs.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Card({
  application,
  documents,
  expanded,
  onToggleExpand,
  onAssignDoc,
  onMoveStage,
  onOpenDetail,
}: {
  application: Application;
  documents: Document[];
  expanded: boolean;
  onToggleExpand: () => void;
  onAssignDoc: (field: "resumeDocId" | "coverDocId", docId: string) => void;
  onMoveStage: (stage: ApplicationStage) => void;
  onOpenDetail: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: application.id,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 }
    : undefined;

  const resumes = documents.filter((d) => d.kind === "resume");
  const coverLetters = documents.filter((d) => d.kind === "cover_letter");

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-md border bg-card p-3 text-sm shadow-sm ${isDragging ? "opacity-70" : ""}`}
    >
      <div className="flex items-start justify-between gap-1">
        <div {...listeners} {...attributes} className="cursor-grab">
          <div className="font-medium text-foreground">{application.posting?.title}</div>
          <div className="text-xs text-muted-foreground">{application.posting?.organization}</div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                className="rounded p-0.5 text-muted-foreground hover:bg-accent"
                onPointerDown={(e) => e.stopPropagation()}
                aria-label="Move to stage"
              />
            }
          >
            ⋮
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {STAGES.filter((s) => s !== application.stage).map((s) => (
              <DropdownMenuItem key={s} onClick={() => onMoveStage(s)}>
                Move to {STAGE_LABELS[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-1 flex gap-2">
        <button
          onClick={onToggleExpand}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-[11px] font-medium text-primary hover:underline"
        >
          {expanded ? "Hide documents" : "Assign documents"}
        </button>
        <button
          onClick={onOpenDetail}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-[11px] font-medium text-primary hover:underline"
        >
          Notes
        </button>
      </div>
      {expanded && (
        <div onPointerDown={(e) => e.stopPropagation()}>
          <DocPicker
            label="Resume"
            docs={resumes}
            value={application.resumeDocId}
            onChange={(id) => onAssignDoc("resumeDocId", id)}
          />
          <DocPicker
            label="Cover letter"
            docs={coverLetters}
            value={application.coverDocId}
            onChange={(id) => onAssignDoc("coverDocId", id)}
          />
        </div>
      )}
    </div>
  );
}

function Column({
  stage,
  applications,
  documents,
  expandedId,
  onToggleExpand,
  onAssignDoc,
  onMoveStage,
  onOpenDetail,
}: {
  stage: ApplicationStage;
  applications: Application[];
  documents: Document[];
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onAssignDoc: (id: string, field: "resumeDocId" | "coverDocId", docId: string) => void;
  onMoveStage: (id: string, stage: ApplicationStage) => void;
  onOpenDetail: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[300px] w-64 shrink-0 flex-col gap-2 rounded-lg border border-dashed p-3 ${
        isOver ? "border-primary bg-primary/5" : ""
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">{STAGE_LABELS[stage]}</span>
        <span className="text-xs text-muted-foreground">{applications.length}</span>
      </div>
      {applications.map((a) => (
        <Card
          key={a.id}
          application={a}
          documents={documents}
          expanded={expandedId === a.id}
          onToggleExpand={() => onToggleExpand(a.id)}
          onAssignDoc={(field, docId) => onAssignDoc(a.id, field, docId)}
          onMoveStage={(newStage) => onMoveStage(a.id, newStage)}
          onOpenDetail={() => onOpenDetail(a.id)}
        />
      ))}
    </div>
  );
}

export function Pipeline() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [apps, docs] = await Promise.all([api.applications.list(), api.documents.list()]);
      setApplications(apps);
      setDocuments(docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pipeline");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function moveStage(id: string, newStage: ApplicationStage) {
    const previous = applications;
    const app = applications.find((a) => a.id === id);
    if (!app || app.stage === newStage) return;

    setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, stage: newStage } : a)));
    try {
      await api.applications.update(id, {
        stage: newStage,
        appliedAt: newStage === "APPLIED" && !app.appliedAt ? new Date().toISOString() : undefined,
      });
    } catch (err) {
      setApplications(previous);
      toast.error(err instanceof Error ? err.message : "Failed to update stage — reverted");
    }
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    await moveStage(active.id as string, over.id as ApplicationStage);
  }

  async function onAssignDoc(id: string, field: "resumeDocId" | "coverDocId", docId: string) {
    const previous = applications;
    setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, [field]: docId || null } : a)));
    try {
      await api.applications.update(id, { [field]: docId || undefined });
    } catch (err) {
      setApplications(previous);
      toast.error(err instanceof Error ? err.message : "Failed to assign document — reverted");
    }
  }

  function openDetail(id: string) {
    setDetailId(id);
    setNotesDraft(applications.find((a) => a.id === id)?.notes ?? "");
  }

  async function saveNotes() {
    if (!detailId) return;
    setSavingNotes(true);
    try {
      await api.applications.update(detailId, { notes: notesDraft });
      setApplications((prev) => prev.map((a) => (a.id === detailId ? { ...a, notes: notesDraft } : a)));
      toast.success("Notes saved");
      setDetailId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save notes");
    } finally {
      setSavingNotes(false);
    }
  }

  const detailApplication = applications.find((a) => a.id === detailId) ?? null;

  if (loading) {
    return (
      <div className="flex gap-4 p-6">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-80 w-64 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load pipeline: {error}{" "}
          <button className="underline" onClick={load}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto p-6">
      <DndContext onDragEnd={onDragEnd}>
        <div className="flex gap-4">
          {STAGES.map((stage) => (
            <Column
              key={stage}
              stage={stage}
              applications={applications.filter((a) => a.stage === stage)}
              documents={documents}
              expandedId={expandedId}
              onToggleExpand={(id) => setExpandedId((prev) => (prev === id ? null : id))}
              onAssignDoc={onAssignDoc}
              onMoveStage={moveStage}
              onOpenDetail={openDetail}
            />
          ))}
        </div>
      </DndContext>

      <Dialog open={!!detailId} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detailApplication?.posting?.title}</DialogTitle>
            <DialogDescription>{detailApplication?.posting?.organization}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder="Notes about this application…"
            rows={6}
          />
          <DialogFooter>
            <Button onClick={saveNotes} disabled={savingNotes}>
              {savingNotes ? "Saving…" : "Save notes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
