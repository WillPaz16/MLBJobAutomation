import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileSignature, FileText, FolderOpen, Trash2 } from "lucide-react";
import { api, ApiError } from "../api/client";
import type { Document } from "../api/types";
import { ErrorState } from "@/components/states/ErrorState";
import { EmptyState } from "@/components/states/EmptyState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageHeader, PageLayout } from "@/components/PageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setDocuments(await api.documents.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setLoading(false);
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
                      <SelectValue />
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
            onDelete={setConfirmDeleteId}
          />
          <DocumentList
            title="Cover Letters"
            icon={FileSignature}
            documents={coverLetters}
            onDelete={setConfirmDeleteId}
          />
        </div>
      )}

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
  onDelete,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  documents: Document[];
  onDelete: (id: string) => void;
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
          {documents.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate">{d.label}</span>
                  {d.isBaseTemplate && <Badge variant="secondary">base</Badge>}
                </div>
                <div
                  className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground"
                  title={d.filePath}
                >
                  <FolderOpen className="size-3 shrink-0" />
                  <span className="truncate">{d.filePath}</span>
                </div>
              </div>
              <Button
                variant="destructive"
                size="icon-xs"
                aria-label="Delete document"
                onClick={() => onDelete(d.id)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
