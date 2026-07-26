import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PageShell, EmptyState } from "@/lib/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { askAssistant } from "@/lib/ai.functions";
import {
  FileText, Upload, Trash2, Download, Folder, FolderPlus, Star, Share2,
  Eye, Sparkles, Search, ChevronRight, Home, Image as ImageIcon,
  Film, Music, FileSpreadsheet, Presentation, X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/files")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Files — Lumen" },
      { name: "description", content: "Your personal cloud drive: upload, organize, preview and ask AI about your files." },
    ],
  }),
  component: FilesPage,
});

type FileRow = {
  id: string; name: string; path: string; size_bytes: number | null;
  mime_type: string | null; subject: string | null; created_at: string;
  folder_id: string | null; is_favorite: boolean; last_accessed_at: string | null;
};
type FolderRow = { id: string; name: string; parent_id: string | null; created_at: string };
type Tab = "all" | "recent" | "favorites";

function FilesPage() {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [path, setPath] = useState<FolderRow[]>([]); // breadcrumb
  const [preview, setPreview] = useState<FileRow | null>(null);
  const [aiFor, setAiFor] = useState<FileRow | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentFolderId = path.length ? path[path.length - 1].id : null;

  const reload = useCallback(async () => {
    const [f, d] = await Promise.all([
      supabase.from("user_files").select("*").order("created_at", { ascending: false }),
      supabase.from("user_folders").select("*").order("name"),
    ]);
    if (f.error) toast.error(f.error.message);
    if (d.error) toast.error(d.error.message);
    setFiles(((f.data ?? []) as unknown) as FileRow[]);
    setFolders(((d.data ?? []) as unknown) as FolderRow[]);
    setLoading(false);
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const uploadFiles = useCallback(async (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (!arr.length) return;
    setUploading(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user!.id;
      for (const file of arr) {
        const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const p = `${uid}/${Date.now()}-${clean}`;
        const up = await supabase.storage.from("user-files").upload(p, file);
        if (up.error) throw up.error;
        const { error } = await supabase.from("user_files").insert({
          user_id: uid, name: file.name, path: p, size_bytes: file.size,
          mime_type: file.type || null, folder_id: currentFolderId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        if (error) throw error;
      }
      toast.success(`Uploaded ${arr.length} file${arr.length > 1 ? "s" : ""}`);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [currentFolderId, reload]);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) uploadFiles(e.target.files);
  };

  const signedUrl = async (f: FileRow, expires = 300) => {
    const { data, error } = await supabase.storage.from("user-files").createSignedUrl(f.path, expires);
    if (error || !data) { toast.error(error?.message ?? "Failed"); return null; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabase.from("user_files").update({ last_accessed_at: new Date().toISOString() } as any).eq("id", f.id);
    return data.signedUrl;
  };

  const download = async (f: FileRow) => {
    const url = await signedUrl(f);
    if (url) window.open(url, "_blank");
  };

  const share = async (f: FileRow) => {
    const url = await signedUrl(f, 60 * 60 * 24 * 7);
    if (!url) return;
    try { await navigator.clipboard.writeText(url); toast.success("Share link copied (valid 7 days)"); }
    catch { window.prompt("Copy this share link:", url); }
  };

  const openPreview = async (f: FileRow) => {
    const url = await signedUrl(f);
    if (!url) return;
    setPreview({ ...f, path: url }); // reuse path field to carry the signed url for preview
  };

  const toggleFav = async (f: FileRow) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("user_files").update({ is_favorite: !f.is_favorite } as any).eq("id", f.id);
    if (error) return toast.error(error.message);
    setFiles((prev) => prev.map((x) => x.id === f.id ? { ...x, is_favorite: !x.is_favorite } : x));
  };

  const remove = async (f: FileRow) => {
    if (!confirm(`Delete ${f.name}?`)) return;
    await supabase.storage.from("user-files").remove([f.path]);
    const { error } = await supabase.from("user_files").delete().eq("id", f.id);
    if (error) return toast.error(error.message);
    setFiles((prev) => prev.filter((x) => x.id !== f.id));
  };

  const createFolder = async () => {
    const name = window.prompt("Folder name")?.trim();
    if (!name) return;
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase.from("user_folders").insert({
      user_id: userRes.user!.id, name, parent_id: currentFolderId,
    });
    if (error) return toast.error(error.message);
    reload();
  };

  const removeFolder = async (fo: FolderRow) => {
    const hasKids = files.some((f) => f.folder_id === fo.id) || folders.some((x) => x.parent_id === fo.id);
    if (hasKids && !confirm(`"${fo.name}" is not empty. Delete anyway? (files inside will move to root)`)) return;
    // move files to root
    await supabase.from("user_files").update({ folder_id: null }).eq("folder_id", fo.id);
    const { error } = await supabase.from("user_folders").delete().eq("id", fo.id);
    if (error) return toast.error(error.message);
    reload();
  };

  const renameFolder = async (fo: FolderRow) => {
    const name = window.prompt("Rename folder", fo.name)?.trim();
    if (!name) return;
    const { error } = await supabase.from("user_folders").update({ name }).eq("id", fo.id);
    if (error) return toast.error(error.message);
    reload();
  };

  const openFolder = (fo: FolderRow) => setPath((p) => [...p, fo]);
  const goTo = (idx: number) => setPath((p) => p.slice(0, idx));

  const visibleFolders = useMemo(() =>
    folders.filter((f) => f.parent_id === currentFolderId &&
      (!query || f.name.toLowerCase().includes(query.toLowerCase()))),
  [folders, currentFolderId, query]);

  const visibleFiles = useMemo(() => {
    let list = files;
    if (tab === "favorites") list = list.filter((f) => f.is_favorite);
    else if (tab === "recent") list = [...list]
      .filter((f) => f.last_accessed_at)
      .sort((a, b) => (b.last_accessed_at ?? "").localeCompare(a.last_accessed_at ?? ""))
      .slice(0, 30);
    else list = list.filter((f) => f.folder_id === currentFolderId);
    if (query) list = list.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()));
    return list;
  }, [files, tab, currentFolderId, query]);

  return (
    <PageShell
      title="Files"
      description="Your private cloud drive. Upload documents, media, and organize into folders."
      actions={
        <>
          <input ref={inputRef} type="file" hidden multiple onChange={onPick}
            accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,image/*,video/*,audio/*" />
          <button onClick={createFolder}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-background text-sm font-medium hover:bg-accent">
            <FolderPlus className="w-4 h-4" /> New folder
          </button>
          <button onClick={() => inputRef.current?.click()} disabled={uploading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
            <Upload className="w-4 h-4" /> {uploading ? "Uploading…" : "Upload"}
          </button>
        </>
      }
    >
      {/* tabs + search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex rounded-lg border bg-card p-1 text-sm">
          {(["all", "recent", "favorites"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md capitalize ${tab === t ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search files and folders…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>

      {/* breadcrumbs */}
      {tab === "all" && (
        <div className="flex items-center gap-1 mb-3 text-sm text-muted-foreground flex-wrap">
          <button onClick={() => goTo(0)} className="inline-flex items-center gap-1 hover:text-foreground">
            <Home className="w-3.5 h-3.5" /> My drive
          </button>
          {path.map((p, i) => (
            <span key={p.id} className="inline-flex items-center gap-1">
              <ChevronRight className="w-3.5 h-3.5" />
              <button onClick={() => goTo(i + 1)} className="hover:text-foreground">{p.name}</button>
            </span>
          ))}
        </div>
      )}

      {/* dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragOver(false);
          if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
        }}
        className={`rounded-xl border-2 border-dashed transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border"}`}
      >
        {loading ? (
          <div className="text-sm text-muted-foreground p-8 text-center">Loading…</div>
        ) : visibleFolders.length === 0 && visibleFiles.length === 0 ? (
          <EmptyState icon={Folder} title="Nothing here yet"
            description="Drag & drop files anywhere or click Upload. You can also create folders to organize your work." />
        ) : (
          <div className="p-3 space-y-4">
            {tab === "all" && visibleFolders.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {visibleFolders.map((fo) => (
                  <div key={fo.id} className="group flex items-center gap-2 p-3 rounded-lg border bg-card hover:bg-accent cursor-pointer"
                       onDoubleClick={() => openFolder(fo)}>
                    <button onClick={() => openFolder(fo)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                      <Folder className="w-5 h-5 text-primary shrink-0" />
                      <span className="text-sm font-medium truncate">{fo.name}</span>
                    </button>
                    <div className="opacity-0 group-hover:opacity-100 flex">
                      <button onClick={() => renameFolder(fo)} className="p-1 text-xs text-muted-foreground hover:text-foreground">Rename</button>
                      <button onClick={() => removeFolder(fo)} className="p-1 rounded-md hover:bg-background text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="rounded-lg border bg-card divide-y">
              {visibleFiles.map((f) => {
                const Icon = iconFor(f.mime_type);
                return (
                  <div key={f.id} className="group flex items-center gap-3 p-3">
                    <button onClick={() => openPreview(f)} className="w-10 h-10 rounded-lg bg-accent grid place-items-center shrink-0">
                      <Icon className="w-5 h-5 text-accent-foreground" />
                    </button>
                    <button onClick={() => openPreview(f)} className="min-w-0 flex-1 text-left">
                      <div className="text-sm font-medium truncate">{f.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {fmtBytes(f.size_bytes)} · {new Date(f.created_at).toLocaleDateString()}
                      </div>
                    </button>
                    <button onClick={() => toggleFav(f)} title="Favorite"
                      className={`p-2 rounded-md hover:bg-accent ${f.is_favorite ? "text-yellow-500" : "text-muted-foreground"}`}>
                      <Star className="w-4 h-4" fill={f.is_favorite ? "currentColor" : "none"} />
                    </button>
                    <button onClick={() => setAiFor(f)} title="Ask AI about this file" className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-primary"><Sparkles className="w-4 h-4" /></button>
                    <button onClick={() => openPreview(f)} title="Preview" className="p-2 rounded-md hover:bg-accent hidden sm:block"><Eye className="w-4 h-4" /></button>
                    <button onClick={() => share(f)} title="Share link" className="p-2 rounded-md hover:bg-accent"><Share2 className="w-4 h-4" /></button>
                    <button onClick={() => download(f)} title="Download" className="p-2 rounded-md hover:bg-accent"><Download className="w-4 h-4" /></button>
                    <button onClick={() => remove(f)} title="Delete" className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                  </div>
                );
              })}
              {visibleFiles.length === 0 && (
                <div className="p-6 text-sm text-muted-foreground text-center">No files{query ? " match your search" : " here"}.</div>
              )}
            </div>
          </div>
        )}
      </div>

      {preview && <PreviewModal file={preview} onClose={() => setPreview(null)} />}
      {aiFor && <AskFileModal file={aiFor} onClose={() => setAiFor(null)} />}
    </PageShell>
  );
}

function PreviewModal({ file, onClose }: { file: FileRow; onClose: () => void }) {
  const url = file.path; // carries signed url
  const mime = file.mime_type ?? "";
  return (
    <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-background rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-3 border-b">
          <div className="text-sm font-medium truncate">{file.name}</div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-accent"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-auto bg-muted grid place-items-center">
          {mime.startsWith("image/") ? (
            <img src={url} alt={file.name} className="max-w-full max-h-[80vh]" />
          ) : mime.startsWith("video/") ? (
            <video src={url} controls className="max-w-full max-h-[80vh]" />
          ) : mime.startsWith("audio/") ? (
            <audio src={url} controls className="w-full p-6" />
          ) : mime === "application/pdf" ? (
            <iframe src={url} title={file.name} className="w-full h-[80vh] bg-white" />
          ) : (
            <div className="p-8 text-sm text-muted-foreground text-center">
              Preview not available for this file type.
              <div className="mt-3"><a href={url} target="_blank" rel="noreferrer" className="text-primary underline">Open in new tab</a></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AskFileModal({ file, onClose }: { file: FileRow; onClose: () => void }) {
  const ask = useServerFn(askAssistant);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true); setAnswer("");
    try {
      const res = await ask({ data: { mode: "doc-qa", input: q || "Summarize this file and list the key points.", fileId: file.id, persist: false } });
      setAnswer(res.reply);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-background rounded-xl max-w-2xl w-full flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-primary shrink-0" />
            <div className="text-sm font-medium truncate">Ask AI about “{file.name}”</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-accent"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3 overflow-auto">
          <textarea value={q} onChange={(e) => setQ(e.target.value)} rows={3}
            placeholder="e.g. Summarize this document, or What are the key formulas?"
            className="w-full rounded-lg border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <button onClick={run} disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
            <Sparkles className="w-4 h-4" /> {loading ? "Thinking…" : "Analyze with AI"}
          </button>
          {answer && (
            <div className="rounded-lg border bg-card p-3 text-sm whitespace-pre-wrap">{answer}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function iconFor(mime: string | null) {
  const m = mime ?? "";
  if (m.startsWith("image/")) return ImageIcon;
  if (m.startsWith("video/")) return Film;
  if (m.startsWith("audio/")) return Music;
  if (m.includes("spreadsheet") || m.includes("excel")) return FileSpreadsheet;
  if (m.includes("presentation") || m.includes("powerpoint")) return Presentation;
  return FileText;
}

function fmtBytes(n: number | null) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
