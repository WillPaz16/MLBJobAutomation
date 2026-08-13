import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  ExternalLink,
  FileText,
  FileDown,
  GripVertical,
  Kanban,
  MapPin,
  MoreVertical,
} from "lucide-react";
import { api } from "../api/client";
import type { Application, ApplicationStage, Document } from "../api/types";
import { htmlToPlainText, relativeTime } from "@/lib/utils";
import { PrepContextPanel } from "@/components/PrepContextPanel";
import { useEntrance } from "@/lib/useEntrance";
import { CATEGORY_FILTER_LABELS, CATEGORY_FILTER_OPTIONS, CATEGORY_LABELS, SOURCE_LABELS, STAGE_LABELS } from "@/lib/labels";
import { ErrorState } from "@/components/states/ErrorState";
import { EmptyState } from "@/components/states/EmptyState";
import { PageHeader, PageLayout } from "@/components/PageLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

// Collapsed by default — these two stages tend to accumulate the most cards over time and are
// checked far less often than the active pipeline stages.
const DEFAULT_COLLAPSED_STAGES: ApplicationStage[] = ["REJECTED", "WITHDRAWN"];

function docStatus(app: Application): { label: string; className: string } {
  const hasResume = !!app.resumeDocId;
  const hasCover = !!app.coverDocId;
  if (hasResume && hasCover) {
    return { label: "Resume + cover letter assigned", className: "text-green-600 dark:text-green-400" };
  }
  if (hasResume || hasCover) {
    return {
      label: `${hasResume ? "Resume" : "Cover letter"} assigned, ${hasResume ? "cover letter" : "resume"} missing`,
      className: "text-amber-600 dark:text-amber-400",
    };
  }
  return { label: "No documents assigned yet", className: "text-muted-foreground" };
}

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
      <label className="text-xs uppercase text-muted-foreground">{label}</label>
      <Select
        value={value ?? "__none__"}
        onValueChange={(v) => onChange(v === "__none__" ? "" : (v ?? ""))}
      >
        {/* Base UI's Select portals SelectContent out of this card's DOM, so stopping
            propagation there wouldn't help a draggable card — the trigger is the part that
            stays inside the card, so that's where the pointer-down needs to be intercepted to
            keep dnd-kit's PointerSensor from starting a drag when opening the dropdown. */}
        <SelectTrigger
          size="sm"
          className="mt-0.5 w-full text-xs"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Explicit children, not `labels`: values here are Document ids (cuids), not a fixed
              enum, so the trigger must look up the doc's own label rather than fall back to
              prettifyLabel(id), which would render a garbled cuid string. */}
          <SelectValue placeholder="— none —">
            {(v: string) => (v === "__none__" ? "— none —" : (docs.find((d) => d.id === v)?.label ?? v))}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— none —</SelectItem>
          {docs.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CardBody({
  application,
  documents,
  expanded,
  onToggleExpand,
  onAssignDoc,
  onMoveStage,
  onOpenDetail,
  dragHandleProps,
  isDragOverlay = false,
}: {
  application: Application;
  documents: Document[];
  expanded: boolean;
  onToggleExpand: () => void;
  onAssignDoc: (field: "resumeDocId" | "coverDocId", docId: string) => void;
  onMoveStage: (stage: ApplicationStage) => void;
  onOpenDetail: () => void;
  dragHandleProps?: { attributes?: object; listeners?: object };
  /** True only for the dnd-kit DragOverlay clone — gets shadow-elev-3 instead of the normal
      hover-only elevation, since it's already "lifted" while being dragged. */
  isDragOverlay?: boolean;
}) {
  const resumes = documents.filter((d) => d.kind === "resume");
  const coverLetters = documents.filter((d) => d.kind === "cover_letter");
  const status = docStatus(application);
  const category = application.posting?.category ?? "OTHER";

  return (
    <Card
      className={`gap-2 py-3 ${
        isDragOverlay
          ? "shadow-elev-3"
          : "hover:shadow-elev-2 transition-shadow duration-200 ease-out-quint"
      }`}
    >
      <CardHeader className="flex-row items-start gap-1 px-3">
        <button
          className="mt-0.5 cursor-grab touch-none text-muted-foreground hover:text-foreground"
          {...(dragHandleProps?.attributes ?? {})}
          {...(dragHandleProps?.listeners ?? {})}
          aria-label="Drag to reorder or move"
        >
          <GripVertical className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <button
            onClick={onOpenDetail}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-left text-sm font-medium leading-tight text-foreground hover:underline"
          >
            {application.posting?.title}
          </button>
          <div className="text-xs text-muted-foreground">{application.posting?.organization}</div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onPointerDown={(e) => e.stopPropagation()}
                aria-label="Move to stage"
              />
            }
          >
            <MoreVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {STAGES.filter((s) => s !== application.stage).map((s) => (
              <DropdownMenuItem key={s} onClick={() => onMoveStage(s)}>
                Move to {STAGE_LABELS[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="px-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant="secondary">{CATEGORY_LABELS[category]}</Badge>
            {application.posting?.source?.type && (
              <Badge variant="outline" className="font-normal text-muted-foreground">
                {SOURCE_LABELS[application.posting.source.type] ?? application.posting.source.type}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {application.resumeDocId && (
              <a
                href={api.documents.fileUrl(application.resumeDocId)}
                target="_blank"
                rel="noreferrer"
                onPointerDown={(e) => e.stopPropagation()}
                className="text-muted-foreground hover:text-primary"
                aria-label="Open attached resume"
                title="Open attached resume"
              >
                <FileText className="size-3.5" />
              </a>
            )}
            {application.coverDocId && (
              <a
                href={api.documents.fileUrl(application.coverDocId)}
                target="_blank"
                rel="noreferrer"
                onPointerDown={(e) => e.stopPropagation()}
                className="text-muted-foreground hover:text-primary"
                aria-label="Open attached cover letter"
                title="Open attached cover letter"
              >
                <FileDown className="size-3.5" />
              </a>
            )}
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className={`flex items-center gap-1 text-xs ${status.className}`} />
                }
              >
                <span aria-hidden="true">•</span>
              </TooltipTrigger>
              <TooltipContent>{status.label}</TooltipContent>
            </Tooltip>
          </div>
        </div>
        {application.posting?.closedAt && (
          <Tooltip>
            <TooltipTrigger
              render={
                <div className="mt-1.5 flex w-fit items-center gap-1 text-xs text-amber-600 dark:text-amber-400" />
              }
            >
              <AlertTriangle className="size-3" />
              Posting closed
            </TooltipTrigger>
            <TooltipContent>
              You're still working an application for a posting that's no longer live.
            </TooltipContent>
          </Tooltip>
        )}
        {application.posting?.location && (
          <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" />
            {application.posting.location}
          </div>
        )}
        <div className="mt-1 text-xs text-muted-foreground">
          {application.posting?.postedAt
            ? `Posted ${relativeTime(application.posting.postedAt)}`
            : application.posting?.discoveredAt
              ? `Found ${relativeTime(application.posting.discoveredAt)}`
              : null}
        </div>
        {application.notes && (
          <button
            onClick={onOpenDetail}
            onPointerDown={(e) => e.stopPropagation()}
            className="mt-1 line-clamp-1 text-left text-xs text-muted-foreground hover:text-foreground"
            title={application.notes}
          >
            {application.notes.slice(0, 60)}
            {application.notes.length > 60 ? "…" : ""}
          </button>
        )}
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={onToggleExpand}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-xs font-medium text-primary hover:underline"
          >
            {expanded ? "Hide documents" : "Assign documents"}
          </button>
          <button
            onClick={onOpenDetail}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-xs font-medium text-primary hover:underline"
          >
            Notes
          </button>
          {application.posting?.url && (
            <a
              href={application.posting.url}
              target="_blank"
              rel="noreferrer"
              onPointerDown={(e) => e.stopPropagation()}
              className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary hover:underline"
              aria-label="Open original posting"
              title="Open original posting"
            >
              <ExternalLink className="size-3" />
            </a>
          )}
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
      </CardContent>
    </Card>
  );
}

function SortableCard(props: Parameters<typeof CardBody>[0] & { id: string }) {
  const { id, ...rest } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <CardBody {...rest} dragHandleProps={{ attributes, listeners }} />
    </div>
  );
}

// OFFER/INTERVIEW are the two stages that matter most to see at a glance — edge-brand marks
// them the same way Strong-fit Discovery rows are marked, one of the plan's exactly-three uses.
const EDGE_BRAND_STAGES: ApplicationStage[] = ["OFFER", "INTERVIEW"];

function Column({
  stage,
  applications,
  documents,
  expandedId,
  collapsed,
  onToggleCollapse,
  onToggleExpand,
  onAssignDoc,
  onMoveStage,
  onOpenDetail,
  entranceProps,
}: {
  stage: ApplicationStage;
  applications: Application[];
  documents: Document[];
  expandedId: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onToggleExpand: (id: string) => void;
  onAssignDoc: (id: string, field: "resumeDocId" | "coverDocId", docId: string) => void;
  onMoveStage: (id: string, stage: ApplicationStage) => void;
  onOpenDetail: (id: string) => void;
  entranceProps: { className?: string; style?: React.CSSProperties };
}) {
  // The droppable target stays mounted (and its id/ref unchanged) whether collapsed or
  // expanded, so cards can still be dropped on a collapsed column.
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const ids = applications.map((a) => a.id);
  const edgeBrand = EDGE_BRAND_STAGES.includes(stage) ? "edge-brand" : "";

  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        style={entranceProps.style}
        className={`flex min-h-[300px] w-12 shrink-0 flex-col items-center gap-2 rounded-lg border bg-muted/30 p-2 ${
          isOver ? "ring-2 ring-primary/40" : ""
        } ${entranceProps.className ?? ""} ${edgeBrand}`}
      >
        <button
          onClick={onToggleCollapse}
          className="flex flex-1 flex-col items-center gap-2 py-2 text-muted-foreground hover:text-foreground"
          aria-label={`Expand ${STAGE_LABELS[stage]} column`}
        >
          <Badge variant="secondary" className="h-5 min-w-5 justify-center rounded-full px-1.5 text-xs">
            {applications.length}
          </Badge>
          <span className="-rotate-90 whitespace-nowrap text-xs font-semibold uppercase tracking-wide">
            {STAGE_LABELS[stage]}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={entranceProps.style}
      className={`flex min-h-[300px] w-72 shrink-0 flex-col gap-2 rounded-lg border bg-muted/30 p-2 ${
        isOver ? "ring-2 ring-primary/40" : ""
      } ${entranceProps.className ?? ""} ${edgeBrand}`}
    >
      <div className="mb-1 flex items-center justify-between px-1 pt-1">
        <button
          onClick={onToggleCollapse}
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          {STAGE_LABELS[stage]}
        </button>
        <Badge variant="secondary" className="h-5 min-w-5 justify-center rounded-full px-1.5 text-xs">
          {applications.length}
        </Badge>
      </div>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {applications.map((a) => (
            <SortableCard
              key={a.id}
              id={a.id}
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
      </SortableContext>
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [collapsedStages, setCollapsedStages] = useState<Set<ApplicationStage>>(
    () => new Set(DEFAULT_COLLAPSED_STAGES)
  );

  const entrance = useEntrance();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function toggleCollapsed(stage: ApplicationStage) {
    setCollapsedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  }

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

  const visibleApplications = useMemo(
    () =>
      categoryFilter === "all"
        ? applications
        : applications.filter((a) => a.posting?.category === categoryFilter),
    [applications, categoryFilter]
  );

  const sortedByColumn = useMemo(() => {
    const byStage: Record<string, Application[]> = {};
    for (const stage of STAGES) byStage[stage] = [];
    for (const app of visibleApplications) byStage[app.stage]?.push(app);
    for (const stage of STAGES) byStage[stage].sort((a, b) => a.order - b.order);
    return byStage;
  }, [visibleApplications]);

  async function persistReorder(updated: Application[], changedIds: Set<string>) {
    const previous = applications;
    setApplications(updated);
    try {
      await Promise.all(
        updated
          .filter((a) => changedIds.has(a.id))
          .map((a) => api.applications.update(a.id, { stage: a.stage, order: a.order }))
      );
    } catch (err) {
      setApplications(previous);
      toast.error(err instanceof Error ? err.message : "Failed to save board order — reverted");
    }
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeApp = applications.find((a) => a.id === active.id);
    if (!activeApp) return;

    const overIsStage = (STAGES as readonly string[]).includes(over.id as string);
    const destStage = overIsStage ? (over.id as ApplicationStage) : applications.find((a) => a.id === over.id)?.stage;
    if (!destStage) return;

    const destItems = sortedByColumn[destStage].filter((a) => a.id !== activeApp.id);
    const overIndex = overIsStage ? destItems.length : destItems.findIndex((a) => a.id === over.id);
    const insertAt = overIndex === -1 ? destItems.length : overIndex;
    destItems.splice(insertAt, 0, { ...activeApp, stage: destStage });

    const changedIds = new Set<string>();
    const reindexed = destItems.map((a, index) => {
      if (a.id === activeApp.id || a.order !== index || a.stage !== destStage) changedIds.add(a.id);
      return { ...a, order: index, stage: destStage };
    });

    if (activeApp.stage !== destStage) {
      // also compact the source column so its remaining cards have contiguous order values
      const sourceItems = sortedByColumn[activeApp.stage]
        .filter((a) => a.id !== activeApp.id)
        .map((a, index) => {
          if (a.order !== index) changedIds.add(a.id);
          return { ...a, order: index };
        });
      const byId = new Map([...reindexed, ...sourceItems].map((a) => [a.id, a]));
      const updated = applications.map((a) => byId.get(a.id) ?? a);
      await persistReorder(updated, changedIds);
      return;
    }

    const byId = new Map(reindexed.map((a) => [a.id, a]));
    const updated = applications.map((a) => byId.get(a.id) ?? a);
    await persistReorder(updated, changedIds);
  }

  async function moveStage(id: string, newStage: ApplicationStage) {
    const previous = applications;
    const app = applications.find((a) => a.id === id);
    if (!app || app.stage === newStage) return;
    const destOrder = sortedByColumn[newStage].length;

    setApplications((prev) =>
      prev.map((a) => (a.id === id ? { ...a, stage: newStage, order: destOrder } : a))
    );
    try {
      // appliedAt is now decided server-side (see applications.ts's PATCH handler) — entering
      // APPLIED sets it there in the same transaction as the stage-event write, so it's never
      // computed client-side here.
      await api.applications.update(id, { stage: newStage, order: destOrder });
    } catch (err) {
      setApplications(previous);
      toast.error(err instanceof Error ? err.message : "Failed to update stage — reverted");
    }
  }

  async function onAssignDoc(id: string, field: "resumeDocId" | "coverDocId", docId: string) {
    const previous = applications;
    const value = docId || null;
    setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, [field]: value } : a)));
    try {
      await api.applications.update(id, { [field]: value });
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
  const activeApplication = applications.find((a) => a.id === activeId) ?? null;

  if (loading) {
    return (
      <PageLayout width="full">
        <div className="flex gap-4">
          {STAGES.map((stage) => (
            <Skeleton key={stage} className="h-80 w-72 rounded-lg" />
          ))}
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout width="full">
        <ErrorState title="Failed to load pipeline" error={error} onRetry={load} />
      </PageLayout>
    );
  }

  return (
    <PageLayout width="full">
      <PageHeader
        icon={Kanban}
        title="Pipeline"
        description="Track every approved application through to offer or rejection."
      />
      <div className="mb-4 flex items-center gap-3">
        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v ?? "all")}>
          <SelectTrigger className="w-56">
            <SelectValue labels={CATEGORY_FILTER_LABELS} />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_FILTER_OPTIONS.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{visibleApplications.length} applications</span>
      </div>

      <div className="relative overflow-x-auto">
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="flex gap-4">
            {STAGES.map((stage, index) => (
              <Column
                key={stage}
                stage={stage}
                applications={sortedByColumn[stage]}
                documents={documents}
                expandedId={expandedId}
                collapsed={collapsedStages.has(stage)}
                onToggleCollapse={() => toggleCollapsed(stage)}
                onToggleExpand={(id) => setExpandedId((prev) => (prev === id ? null : id))}
                onAssignDoc={onAssignDoc}
                onMoveStage={moveStage}
                onOpenDetail={openDetail}
                entranceProps={entrance(index)}
              />
            ))}
          </div>
          <DragOverlay>
            {activeApplication && (
              <div className="w-72">
                <CardBody
                  application={activeApplication}
                  documents={documents}
                  expanded={false}
                  onToggleExpand={() => {}}
                  onAssignDoc={() => {}}
                  onMoveStage={() => {}}
                  onOpenDetail={() => {}}
                  isDragOverlay
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>

        {applications.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="pointer-events-auto">
              <EmptyState
                icon={Kanban}
                title="No applications yet"
                description="Approve a posting on Discovery to start tracking it through the pipeline."
                action={
                  <Button render={<Link to="/discovery" />} nativeButton={false}>
                    Go to Discovery
                  </Button>
                }
              />
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!detailId} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detailApplication?.posting?.title}</DialogTitle>
            <DialogDescription>
              {detailApplication?.posting?.organization} ·{" "}
              {detailApplication?.posting?.location ?? "location unknown"}
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Job description</label>
            <div className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-2 text-sm text-foreground">
              {detailApplication?.posting?.description
                ? htmlToPlainText(detailApplication.posting.description)
                : "No description was captured for this posting."}
            </div>
            {detailApplication?.posting?.url && (
              <a
                href={detailApplication.posting.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-sm text-primary underline"
              >
                View original posting
              </a>
            )}
          </div>
          {detailApplication && (
            <PrepContextPanel applicationId={detailApplication.id} defaultOpen={false} />
          )}
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
    </PageLayout>
  );
}
