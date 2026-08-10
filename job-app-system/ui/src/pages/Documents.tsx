import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../api/client";
import type { Document } from "../api/types";
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
      toast.error(err instanceof Error ? err.message : "Failed to delete document");
    }
  }

  const resumes = documents.filter((d) => d.kind === "resume");
  const coverLetters = documents.filter((d) => d.kind === "cover_letter");

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {documents.length} document{documents.length === 1 ? "" : "s"}
        </span>
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
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Will Paz Resume — Data Science" />
              </div>
              <div>
                <Label className="mb-1">File path</Label>
                <Input value={filePath} onChange={(e) => setFilePath(e.target.value)} placeholder="/Users/.../Resumes/file.pdf" />
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

      {loading ? (
        <div className="grid grid-cols-2 gap-6">
          <Skeleton className="h-40 rounded-md" />
          <Skeleton className="h-40 rounded-md" />
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load documents: {error}{" "}
          <button className="underline" onClick={load}>
            Retry
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          <DocumentList title="Resumes" documents={resumes} onDelete={removeDocument} />
          <DocumentList title="Cover Letters" documents={coverLetters} onDelete={removeDocument} />
        </div>
      )}
    </div>
  );
}

function DocumentList({
  title,
  documents,
  onDelete,
}: {
  title: string;
  documents: Document[];
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-foreground">{title}</h2>
      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">None yet.</p>
      ) : (
        <ul className="space-y-2">
          {documents.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between rounded-md border p-2 text-sm"
            >
              <span>
                {d.label} {d.isBaseTemplate && <Badge variant="secondary">base</Badge>}
              </span>
              <button
                className="text-xs text-destructive hover:underline"
                onClick={() => onDelete(d.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
