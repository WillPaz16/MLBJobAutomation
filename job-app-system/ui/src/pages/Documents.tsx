import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Document } from "../api/types";

export function Documents() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.documents
      .list()
      .then(setDocuments)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="p-6 text-sm text-gray-500">Loading…</p>;

  const resumes = documents.filter((d) => d.kind === "resume");
  const coverLetters = documents.filter((d) => d.kind === "cover_letter");

  return (
    <div className="p-6">
      {documents.length === 0 && (
        <p className="mb-4 text-sm text-gray-500">
          No documents imported yet. Run the document import step to seed this library from{" "}
          <code>Resumes/</code> and <code>Cover Letters/</code>.
        </p>
      )}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Resumes</h2>
          <ul className="space-y-2">
            {resumes.map((d) => (
              <li key={d.id} className="rounded-md border border-gray-200 p-2 text-sm dark:border-gray-800">
                {d.label} {d.isBaseTemplate && <span className="text-xs text-purple-600">(base)</span>}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Cover Letters</h2>
          <ul className="space-y-2">
            {coverLetters.map((d) => (
              <li key={d.id} className="rounded-md border border-gray-200 p-2 text-sm dark:border-gray-800">
                {d.label} {d.isBaseTemplate && <span className="text-xs text-purple-600">(base)</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
