import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Download, FileSignature, FileText, FolderOpen, ScanSearch, Trash2 } from "lucide-react";
import { api, ApiError } from "../api/client";
import type { Document, DocumentDetail } from "../api/types";
import { ErrorState } from "@/components/states/ErrorState";
import { EmptyState } from "@/components/states/EmptyState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useEntrance } from "@/lib/useEntrance";
import { PageHeader, PageLayout } from "@/components/PageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function Documents() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [kind, setKind] = useState<"resume" | "cover_letter">("resume");
  const [label, setLabel] = useState("");
  const [filePath, setFilePath] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [usageById, setUsageById] = useState<Record<string, DocumentDetail>>({});
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const entrance = useEntrance();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const docs = await api.documents.list();
      setDocuments(docs);
      const details = await Promise.all(
        docs.map((d) => api.documents.get(d.id).catch(() => null))
      );
      const map: Record<string, DocumentDetail> = {};
      details.forEach((d) => {
        if (d) map[d.id] = d;
      });
      setUsageById(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }

  async function scanForNewFiles() {
    setScanning(true);
    try {
      const result = await api.documents.scan();
      toast.success(`Scan complete — ${result.inserted} new, ${result.skipped} already registered`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createDocument() {
    if (!label.trim() || !filePath.trim()) {
      toast.error("Label and file path are required");
      return;
    }
    setSaving(true);
    try {
      await api.documents.create({ kind, label: label.trim(), filePath: filePath.trim() });
      toast.success("Document added");
      setDialogOpen(false);
      setLabel("");
      setFilePath("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add document");
    } finally {
      setSaving(false);
    }
  }

  async function removeDocument(id: string) {
    try {
      await api.documents.remove(id);
      toast.success("Document deleted");
      await load();
    } catch (err) {
      // The API returns 409 with a plain "still assigned to an application" message when a
      // document is attached to an application — no attached-application count is exposed by
      // that route, so the message below doesn't fabricate one.
      if (err instanceof ApiError && err.status === 409) {
        toast.error("This document is attached to an application — remove it from there first.");
      } else {
        toast.error(err instanceof Error ? err.message : "Failed to delete document");
      }
    }
  }

  const resumes = documents.filter((d) => d.kind === "resume");
  const coverLetters = documents.filter((d) => d.kind === "cover_letter");

  return (
    <PageLayout>
      <PageHeader
        icon={FileText}
        title="Documents"
        description="Base resumes and cover letters available to attach to applications."
        count={{ value: documents.length, noun: documents.length === 1 ? "document" : "documents" }}
        actions={
          <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={scanForNewFiles} disabled={scanning}>
            <ScanSearch className="mr-1 size-4" />
            {scanning ? "Scanning…" : "Scan for new files"}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger render={<Button size="sm" />}>Add document</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add document</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="mb-1">Kind</Label>
                  <Select value={kind} onValueChange={(v) => setKind(v as "resume" | "cover_letter")}>
                    <SelectTrigger className="w-full">
                      <SelectValue labels={{ resume: "Resume", cover_letter: "Cover letter" }} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="resume">Resume</SelectItem>
                      <SelectItem value="cover_letter">Cover letter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1">Label</Label>
                  <Input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="e.g. Will Paz Resume — Data Science"
                  />
                </div>
                <div>
                  <Label className="mb-1">File path</Label>
                  <Input
                    value={filePath}
                    onChange={(e) => setFilePath(e.target.value)}
                    placeholder="/Users/.../Resumes/file.pdf"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createDocument} disabled={saving}>
                  {saving ? "Adding…" : "Add"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Skeleton className="h-40 rounded-md" />
          <Skeleton className="h-40 rounded-md" />
        </div>
      ) : error ? (
        <ErrorState title="Failed to load documents" error={error} onRetry={load} />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <DocumentList
            title="Resumes"
            icon={FileText}
            documents={resumes}
            usageById={usageById}
            onDelete={setConfirmDeleteId}
            onPreview={setPreviewDoc}
            entrance={entrance}
          />
          <DocumentList
            title="Cover Letters"
            icon={FileSignature}
            documents={coverLetters}
            usageById={usageById}
            onDelete={setConfirmDeleteId}
            onPreview={setPreviewDoc}
            entrance={entrance}
          />
        </div>
      )}

      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{previewDoc?.label}</DialogTitle>
          </DialogHeader>
          {previewDoc && previewDoc.filePath.toLowerCase().endsWith(".pdf") ? (
            <iframe
              src={api.documents.fileUrl(previewDoc.id)}
              title={previewDoc.label}
              className="h-[70vh] w-full rounded-md border"
            />
          ) : (
            <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
              Preview isn't available for Word documents in-app. Download it to view.
              <div className="mt-3">
                <Button
                  size="sm"
                  render={<a href={previewDoc ? api.documents.fileUrl(previewDoc.id, true) : "#"} />}
                  nativeButton={false}
                >
                  <Download className="mr-1 size-4" />
                  Download
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDeleteId}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
        title="Delete document?"
        description="This removes the document record from the tracker. It can't be undone, and it will fail if the document is still attached to an application."
        confirmLabel="Delete"
        destructive
        onConfirm={() => confirmDeleteId && removeDocument(confirmDeleteId)}
      />
    </PageLayout>
  );
}

function DocumentList({
  title,
  icon: Icon,
  documents,
  usageById,
  onDelete,
  onPreview,
  entrance,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  documents: Document[];
  usageById: Record<string, DocumentDetail>;
  onDelete: (id: string) => void;
  onPreview: (d: Document) => void;
  entrance: (index: number) => { className?: string; style?: React.CSSProperties };
}) {
  return (
    <div>
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Icon className="size-4" />
        {title}
      </h2>
      {documents.length === 0 ? (
        <EmptyState icon={FileText} title="None yet" />
      ) : (
        <ul className="space-y-2">
          {documents.map((d, index) => {
            const usage = usageById[d.id];
            const exists = d.exists ?? true;
            const { className: entranceClassName, style: entranceStyle } = entrance(index);
            return (
              <li
                key={d.id}
                style={entranceStyle}
                className={`flex items-center justify-between gap-2 rounded-md border p-2 text-sm ${
                  entranceClassName ?? ""
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <button
                      className="truncate text-left hover:underline"
                      onClick={() => exists && onPreview(d)}
                      disabled={!exists}
                    >
                      {d.label}
                    </button>
                    {d.isBaseTemplate && <Badge variant="secondary">base</Badge>}
                    {!exists && (
                      <Tooltip>
                        <TooltipTrigger
                          render={<Badge variant="destructive" className="gap-1" />}
                        >
                          <AlertTriangle className="size-3" /> file missing
                        </TooltipTrigger>
                        <TooltipContent>File no longer exists on disk.</TooltipContent>
                      </Tooltip>
                    )}
                    {usage && usage.usedBy.length > 0 && (
                      <Tooltip>
                        <TooltipTrigger render={<Badge variant="outline" />}>
                          Used by {usage.usedBy.length}
                        </TooltipTrigger>
                        <TooltipContent>
                          {usage.usedBy
                            .map((u) => `${u.postingTitle} — ${u.organization}`)
                            .join(", ")}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <div
                    className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground"
                    title={d.filePath}
                  >
                    <FolderOpen className="size-3 shrink-0" />
                    <span className="truncate">{d.filePath}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {exists ? (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Open file"
                      render={<a href={api.documents.fileUrl(d.id)} target="_blank" rel="noreferrer" />}
                      nativeButton={false}
                    >
                      <FolderOpen />
                    </Button>
                  ) : (
                    <Button variant="ghost" size="icon-xs" aria-label="Open file" disabled>
                      <FolderOpen />
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="icon-xs"
                    aria-label="Delete document"
                    onClick={() => onDelete(d.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
