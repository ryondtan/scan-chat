import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PageShell, EmptyState } from "@/lib/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Upload, Trash2, Download, Folder } from "lucide-react";

export const Route = createFileRoute("/_authenticated/files")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Files — Lumen" },
      { name: "description", content: "Upload and organize your school files — worksheets, PDFs, images and notes." },
    ],
  }),
  component: FilesPage,
});

type FileRow = { id: string; name: string; path: string; size_bytes: number | null; mime_type: string | null; subject: string | null; created_at: string };

function FilesPage() {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    const { data, error } = await supabase.from("user_files").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setFiles((data ?? []) as FileRow[]);
    setLoading(false);
  };
  useEffect(() => { reload(); }, []);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user!.id;
      const path = `${uid}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const up = await supabase.storage.from("user-files").upload(path, file);
      if (up.error) throw up.error;
      const { error } = await supabase.from("user_files").insert({
        user_id: uid, name: file.name, path, size_bytes: file.size, mime_type: file.type || null,
      });
      if (error) throw error;
      toast.success("Uploaded");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const download = async (f: FileRow) => {
    const { data, error } = await supabase.storage.from("user-files").createSignedUrl(f.path, 60);
    if (error || !data) return toast.error(error?.message ?? "Failed");
    window.open(data.signedUrl, "_blank");
  };

  const remove = async (f: FileRow) => {
    if (!confirm(`Delete ${f.name}?`)) return;
    await supabase.storage.from("user-files").remove([f.path]);
    await supabase.from("user_files").delete().eq("id", f.id);
    reload();
  };

  return (
    <PageShell
      title="Files"
      description="Upload worksheets, PDFs and study material. Files are private to you."
      actions={
        <>
          <input ref={inputRef} type="file" hidden onChange={onPick} />
          <button onClick={() => inputRef.current?.click()} disabled={uploading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
            <Upload className="w-4 h-4" /> {uploading ? "Uploading…" : "Upload"}
          </button>
        </>
      }
    >
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : files.length === 0 ? (
        <EmptyState icon={Folder} title="No files yet" description="Upload PDFs, images, and documents to keep them safe and accessible from any device." />
      ) : (
        <div className="rounded-xl border bg-card divide-y">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-3 p-3">
              <div className="w-10 h-10 rounded-lg bg-accent grid place-items-center shrink-0">
                <FileText className="w-5 h-5 text-accent-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{f.name}</div>
                <div className="text-xs text-muted-foreground">
                  {fmtBytes(f.size_bytes)} · {new Date(f.created_at).toLocaleDateString()}
                </div>
              </div>
              <button onClick={() => download(f)} className="p-2 rounded-md hover:bg-accent"><Download className="w-4 h-4" /></button>
              <button onClick={() => remove(f)} className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}

function fmtBytes(n: number | null) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
