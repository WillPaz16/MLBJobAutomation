import { useEffect, useState } from "react";
import { DndContext, type DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { api } from "../api/client";
import type { Application, ApplicationStage, Document } from "../api/types";

const STAGES: ApplicationStage[] = ["FOUND", "REVIEWING", "APPLIED", "INTERVIEW", "OFFER", "REJECTED"];

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
      <label className="text-[10px] uppercase text-gray-400">{label}</label>
      <select
        className="mt-0.5 w-full rounded border border-gray-200 bg-white px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-950"
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
}: {
  application: Application;
  documents: Document[];
  expanded: boolean;
  onToggleExpand: () => void;
  onAssignDoc: (field: "resumeDocId" | "coverDocId", docId: string) => void;
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
      className={`rounded-md border border-gray-200 bg-white p-3 text-sm shadow-sm dark:border-gray-800 dark:bg-gray-900 ${
        isDragging ? "opacity-70" : ""
      }`}
    >
      <div {...listeners} {...attributes} className="cursor-grab">
        <div className="font-medium text-gray-900 dark:text-gray-100">{application.posting?.title}</div>
        <div className="text-xs text-gray-500">{application.posting?.organization}</div>
      </div>
      <button
        onClick={onToggleExpand}
        onPointerDown={(e) => e.stopPropagation()}
        className="mt-1 text-[11px] font-medium text-purple-600 hover:underline"
      >
        {expanded ? "Hide documents" : "Assign documents"}
      </button>
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
}: {
  stage: ApplicationStage;
  applications: Application[];
  documents: Document[];
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onAssignDoc: (id: string, field: "resumeDocId" | "coverDocId", docId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[300px] w-64 shrink-0 flex-col gap-2 rounded-lg border border-dashed p-3 ${
        isOver ? "border-purple-400 bg-purple-50 dark:bg-purple-950/20" : "border-gray-200 dark:border-gray-800"
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{STAGE_LABELS[stage]}</span>
        <span className="text-xs text-gray-400">{applications.length}</span>
      </div>
      {applications.map((a) => (
        <Card
          key={a.id}
          application={a}
          documents={documents}
          expanded={expandedId === a.id}
          onToggleExpand={() => onToggleExpand(a.id)}
          onAssignDoc={(field, docId) => onAssignDoc(a.id, field, docId)}
        />
      ))}
    </div>
  );
}

export function Pipeline() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [apps, docs] = await Promise.all([api.applications.list(), api.documents.list()]);
      setApplications(apps);
      setDocuments(docs);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const newStage = over.id as ApplicationStage;
    const app = applications.find((a) => a.id === active.id);
    if (!app || app.stage === newStage) return;

    setApplications((prev) => prev.map((a) => (a.id === app.id ? { ...a, stage: newStage } : a)));
    await api.applications.update(app.id, {
      stage: newStage,
      appliedAt: newStage === "APPLIED" && !app.appliedAt ? new Date().toISOString() : undefined,
    });
  }

  async function onAssignDoc(id: string, field: "resumeDocId" | "coverDocId", docId: string) {
    setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, [field]: docId || null } : a)));
    await api.applications.update(id, { [field]: docId || undefined });
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Loading…</p>;

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
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
